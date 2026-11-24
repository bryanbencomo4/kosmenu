#!/usr/bin/env node
/**
 * Post-deploy verification for platform inbox + auto-reply allowlist.
 * Does not send unsolicited WA to strangers. Uses webhook with secret from
 * site/.wa-entry-preview-deploy/vercel-preview.env (same pattern as prior probes).
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PILOT = '584140821633';
const OTHER = '584199911122';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const previewEnv = path.join(root, 'site/.wa-entry-preview-deploy/vercel-preview.env');
const prodEnv = path.join(root, 'site/.wa-entry-prod-deploy/vercel-production.env');
const secretFile = path.join(root, 'site/.wa-entry-prod-deploy/webhook-secret.local.txt');
const BASE = (process.env.BASE_URL || 'https://elmenuxfa.com').replace(/\/$/, '');
const ADMIN = (process.env.ADMIN_BASE || 'https://admin.elmenuxfa.com').replace(/\/$/, '');

function loadEnvFile(p) {
  const out = {};
  if (!existsSync(p)) return out;
  for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    out[m[1]] = v;
  }
  return out;
}

const fileEnv = { ...loadEnvFile(previewEnv), ...loadEnvFile(prodEnv) };
const secret = (
  process.env.PLATFORM_WA_WEBHOOK_SECRET ||
  (existsSync(secretFile) ? readFileSync(secretFile, 'utf8').trim() : '') ||
  fileEnv.PLATFORM_WA_WEBHOOK_SECRET ||
  ''
).trim();
const sbUrl = (
  process.env.PLATFORM_WA_PROD_SUPABASE_URL ||
  fileEnv.PLATFORM_WA_PROD_SUPABASE_URL ||
  fileEnv.NEXT_PUBLIC_SUPABASE_URL ||
  ''
).trim();
const sbKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || fileEnv.SUPABASE_SERVICE_ROLE_KEY || '').trim();

const steps = [];
function ok(name, detail = '') {
  steps.push({ name, ok: true, detail });
  console.log(`✓ ${name}${detail ? ` — ${detail}` : ''}`);
}
function fail(name, detail) {
  steps.push({ name, ok: false, detail });
  console.error(`✗ ${name} — ${detail}`);
}

async function get(url) {
  const res = await fetch(url, { redirect: 'manual' });
  return { status: res.status, loc: res.headers.get('location') || '', text: await res.text() };
}

async function postWebhook(fromDigits, text, messageId) {
  const payload = {
    event: 'messages.upsert',
    sessionId: 'ELMENUXFA1',
    data: {
      messages: [
        {
          key: {
            id: messageId,
            fromMe: false,
            remoteJid: `${fromDigits}@s.whatsapp.net`,
            cleanedSenderPn: fromDigits,
          },
          messageTimestamp: Math.floor(Date.now() / 1000),
          messageBody: text,
          message: { conversation: text },
        },
      ],
    },
  };
  const res = await fetch(`${BASE}/api/wa-entry/webhook`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'X-Webhook-Signature': secret,
    },
    body: JSON.stringify(payload),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

async function main() {
  // 1) Auth gates
  const wa = await get(`${ADMIN}/admin/wa-control`);
  if (wa.status === 307 || wa.status === 302 || /login/i.test(wa.loc)) {
    ok('auth_redirect', `${wa.status} → ${wa.loc || 'login'}`);
  } else if (wa.status === 200 && /Iniciar sesión|login/i.test(wa.text)) {
    ok('auth_login_page', 'login UI');
  } else {
    fail('auth_redirect', `unexpected ${wa.status} ${wa.loc}`);
  }

  const api = await fetch(`${ADMIN}/admin/api/wa-control`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'status' }),
  });
  if (api.status === 401 || api.status === 403 || api.status === 307) {
    ok('api_denied_unauth', String(api.status));
  } else {
    const j = await api.json().catch(() => ({}));
    if (j?.error && /auth|session|permission/i.test(String(j.error))) {
      ok('api_denied_unauth', String(j.error));
    } else {
      fail('api_denied_unauth', `status=${api.status}`);
    }
  }

  // 2) Regression surfaces
  for (const [name, url] of [
    ['menu_public', `${BASE}/api/health`],
    ['discovery', `${BASE}/api/asistente`],
    ['flutter_app', 'https://app.elmenuxfa.com/'],
  ]) {
    try {
      const r = await fetch(url, { redirect: 'follow' });
      if (r.ok || r.status === 304) ok(`regression_${name}`, String(r.status));
      else fail(`regression_${name}`, String(r.status));
    } catch (e) {
      fail(`regression_${name}`, String(e));
    }
  }

  if (!secret) {
    fail('webhook_secret', 'missing PLATFORM_WA_WEBHOOK_SECRET');
  } else {
    const t = Date.now();
    const pilot = await postWebhook(PILOT, 'Hola verificación inbox', `verify-pilot-${t}`);
    if (pilot.status === 200 && (pilot.json?.action === 'replied' || pilot.json?.reason === 'ok' || pilot.json?.accepted)) {
      ok('pilot_auto_reply', `${pilot.json.action || ''} ${pilot.json.reason || ''} replies=${(pilot.json.replies || []).length}`);
    } else if (pilot.status === 200 && pilot.json?.reason === 'human_handling') {
      ok('pilot_human_hold', 'conversation under human control');
    } else if (pilot.status === 200 && pilot.json?.reason === 'global_bot_mute') {
      fail('pilot_auto_reply', 'global mute active');
    } else {
      // Detailed accept
      const reason = pilot.json?.reason || pilot.json?.error || pilot.status;
      if (pilot.json?.action === 'replied') ok('pilot_auto_reply', JSON.stringify(pilot.json).slice(0, 120));
      else if (pilot.json?.accepted && pilot.json?.action === 'ignored' && /duplicate|rate/i.test(String(reason))) {
        ok('pilot_webhook_accepted', String(reason));
      } else {
        fail('pilot_auto_reply', JSON.stringify(pilot.json).slice(0, 200));
      }
    }

    const other = await postWebhook(OTHER, 'Hola desde número externo', `verify-other-${t}`);
    if (
      other.status === 200 &&
      other.json?.action === 'ignored' &&
      other.json?.reason === 'auto_reply_not_allowed'
    ) {
      ok('other_silence', 'auto_reply_not_allowed');
    } else if (other.status === 200 && other.json?.action === 'replied') {
      fail('other_silence', 'UNEXPECTED auto-reply to non-allowlisted');
    } else {
      fail('other_silence', JSON.stringify(other.json).slice(0, 200));
    }
  }

  // 3) Durable control store: attention cross-instance via threads
  if (sbUrl && sbKey && sbUrl.includes('qqhberaayhohxlbbhdyi')) {
    const sb = createClient(sbUrl, sbKey, { auth: { persistSession: false } });
    const { data, error } = await sb
      .from('wa_entry_threads')
      .select('from_digits,state,updated_at_ms,human_paused_until_ms')
      .eq('from_digits', PILOT)
      .maybeSingle();
    if (error) fail('control_store', error.message);
    else ok('control_store', data ? `state=${data.state}` : 'no thread yet (ok)');

    const { count } = await sb
      .from('wa_entry_outbound')
      .select('*', { count: 'exact', head: true })
      .eq('to_digits', OTHER)
      .gte('at_ms', Date.now() - 120_000);
    if ((count || 0) === 0) ok('other_no_outbound', '0 bot outbound in last 2m');
    else fail('other_no_outbound', `unexpected outbound count=${count}`);
  } else {
    fail('control_store', 'missing prod supabase credentials in env file');
  }

  const report = {
    at: new Date().toISOString(),
    base: BASE,
    admin: ADMIN,
    deployment: 'kosmenu-6zonx3fca',
    migrationApplied: false,
    steps,
  };
  const out = path.join(root, 'docs/wa-inbox-prod-verify.json');
  writeFileSync(out, JSON.stringify(report, null, 2));
  const failed = steps.filter((s) => !s.ok);
  console.log(`\n${steps.length - failed.length}/${steps.length} passed → ${out}`);
  if (failed.length) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
