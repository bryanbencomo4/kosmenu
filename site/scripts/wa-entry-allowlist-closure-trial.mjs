#!/usr/bin/env node
/**
 * Final allowlist-only closure trial against production.
 * Posts signed messages.received for 584140821633 (+ outsider / fromMe / dup probes).
 * Never prints webhook secret. Writes report JSON under .wa-entry-prod-deploy/
 */
import { spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const CONFIRM = 'I_AUTHORIZE_WA_ENTRY_CLOSURE_TRIAL';
if ((process.env.CONFIRM_WA_ENTRY_CLOSURE_TRIAL || '').trim() !== CONFIRM) {
  console.error(`Refused: set CONFIRM_WA_ENTRY_CLOSURE_TRIAL=${CONFIRM}`);
  process.exit(1);
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');
const deployDir = path.join(root, 'site/.wa-entry-prod-deploy');
const secretFile = path.join(deployDir, 'webhook-secret.local.txt');
const envFile = path.join(deployDir, 'vercel-production.env');
mkdirSync(deployDir, { recursive: true });

const BASE = process.env.WA_ENTRY_PROD_BASE || 'https://elmenuxfa.com';
const ALLOW = '584140821633';
const OUTSIDER = '584129990099';
const PROD = 'qqhberaayhohxlbbhdyi';

function loadEnv(filePath) {
  const out = {};
  try {
    for (const line of readFileSync(filePath, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (!m) continue;
      let v = m[2];
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      out[m[1]] = v.replace(/\\n/g, '\n');
    }
  } catch {
    /* optional */
  }
  return out;
}

function mid(tag) {
  return `3EB0CLOSE${Date.now().toString(36).toUpperCase()}${randomBytes(3).toString('hex').toUpperCase()}${tag}`;
}

function buildPayload({ messageId, fromDigits, text, fromMe = false, sessionId = 'ELMENUXFA1' }) {
  return {
    event: 'messages.received',
    sessionId,
    data: {
      messages: {
        key: {
          id: messageId,
          fromMe,
          remoteJid: `${fromDigits}@s.whatsapp.net`,
          cleanedSenderPn: fromDigits,
        },
        messageTimestamp: Math.floor(Date.now() / 1000),
        messageBody: text,
      },
    },
  };
}

const secret = readFileSync(secretFile, 'utf8').trim();
if (!secret || secret.length < 16) {
  console.error(JSON.stringify({ ok: false, error: 'missing_secret' }));
  process.exit(1);
}

async function postEvent(opts) {
  const messageId = opts.messageId || mid(opts.tag || 'X');
  const payload = buildPayload({ ...opts, messageId });
  const body = JSON.stringify(payload);
  const started = Date.now();
  const res = await fetch(`${BASE}/api/wa-entry/webhook`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'X-Webhook-Signature': opts.signature ?? secret,
    },
    body,
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* ignore */
  }
  return {
    messageId,
    text: opts.text,
    fromDigits: opts.fromDigits,
    fromMe: !!opts.fromMe,
    status: res.status,
    ms: Date.now() - started,
    json,
    raw: text.slice(0, 300),
  };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

const env = loadEnv(envFile);
const supabaseUrl =
  env.PLATFORM_WA_PROD_SUPABASE_URL ||
  env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.PLATFORM_WA_PROD_SUPABASE_URL ||
  '';
const serviceKey =
  env.PLATFORM_WA_PROD_SERVICE_ROLE_KEY ||
  env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  '';

const sb =
  supabaseUrl && serviceKey
    ? createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })
    : null;

async function dbSnapshot(label) {
  if (!sb) return { label, skipped: true };
  const [seen, outbound, thread, queue] = await Promise.all([
    sb
      .from('wa_entry_seen_messages')
      .select('message_id, created_at')
      .order('created_at', { ascending: false })
      .limit(20),
    sb
      .from('wa_entry_outbound')
      .select('id, to_digits, result, dedupe_key, text, created_at, at_ms')
      .eq('to_digits', ALLOW)
      .order('created_at', { ascending: false })
      .limit(20),
    sb.from('wa_entry_threads').select('*').eq('from_digits', ALLOW).maybeSingle(),
    sb
      .from('wasender_message_queue')
      .select('id, status, recipient, source, dedupe_key, attempts, last_error, sent_at, created_at, message')
      .eq('source', 'platform-wa-entry')
      .ilike('recipient', `%${ALLOW.slice(-10)}%`)
      .order('created_at', { ascending: false })
      .limit(20),
  ]);
  return {
    label,
    seen: seen.data || [],
    seenError: seen.error?.message || null,
    outbound: (outbound.data || []).map((r) => ({
      ...r,
      text: String(r.text || '').slice(0, 120),
    })),
    outboundError: outbound.error?.message || null,
    thread: thread.data || null,
    threadError: thread.error?.message || null,
    queue: (queue.data || []).map((r) => ({
      ...r,
      message: String(r.message || '').slice(0, 100),
    })),
    queueError: queue.error?.message || null,
  };
}

const health0 = await (await fetch(`${BASE}/api/wa-entry/webhook`)).json();
const steps = [];

async function step(name, fn) {
  const started = Date.now();
  try {
    const result = await fn();
    const row = { name, ok: true, ms: Date.now() - started, result };
    steps.push(row);
    console.log(JSON.stringify({ step: name, ok: true, ms: row.ms, summary: summarize(result) }));
    return result;
  } catch (err) {
    const row = { name, ok: false, ms: Date.now() - started, error: String(err?.message || err) };
    steps.push(row);
    console.error(JSON.stringify({ step: name, ok: false, error: row.error }));
    throw err;
  }
}

function summarize(result) {
  if (!result) return null;
  if (Array.isArray(result)) {
    return result.map((r) => ({
      text: r.text,
      status: r.status,
      action: r.json?.action,
      reason: r.json?.reason,
      ms: r.ms,
      messageId: r.messageId,
    }));
  }
  if (result.status != null) {
    return {
      text: result.text,
      status: result.status,
      action: result.json?.action,
      reason: result.json?.reason,
      ms: result.ms,
      messageId: result.messageId,
    };
  }
  return result;
}

const before = await dbSnapshot('before');

// 1) Business flow
await step('business_MENU_welcome', () =>
  postEvent({ fromDigits: ALLOW, text: 'MENÚ', tag: 'M1' }),
);
await sleep(800);
await step('business_2_submenu', () => postEvent({ fromDigits: ALLOW, text: '2', tag: 'B2' }));
await sleep(800);
await step('business_1_register', () => postEvent({ fromDigits: ALLOW, text: '1', tag: 'R1' }));
await sleep(800);
await step('business_MENU_again', () => postEvent({ fromDigits: ALLOW, text: 'MENÚ', tag: 'M2' }));
await sleep(800);
await step('business_2_submenu_again', () => postEvent({ fromDigits: ALLOW, text: '2', tag: 'B3' }));
await sleep(800);
await step('business_2_manage', () => postEvent({ fromDigits: ALLOW, text: '2', tag: 'G2' }));
await sleep(1200);

// 2) Duplicate identical message_id (not two equal user texts)
const dupId = mid('DUP');
const dupPayload = {
  fromDigits: ALLOW,
  text: 'MENÚ',
  messageId: dupId,
};
await step('duplicate_same_message_id', async () => {
  const [a, b] = await Promise.all([postEvent(dupPayload), postEvent(dupPayload)]);
  return { a, b, sameId: dupId };
});
await sleep(500);

// Two equal user texts with different IDs (must both process — not treated as webhook dup)
await step('two_equal_texts_different_ids', async () => {
  const a = await postEvent({ fromDigits: ALLOW, text: 'xyz_out_of_context', tag: 'T1' });
  await sleep(400);
  const b = await postEvent({ fromDigits: ALLOW, text: 'xyz_out_of_context', tag: 'T2' });
  return { a, b };
});
await sleep(800);

// 3) Human intervention vs bot echo
await step('bot_echo_fromMe_welcome_text', async () => {
  const welcome =
    '¡Hola! 👋 Bienvenido a *El Menú XFA*.\n\n¿Qué te gustaría hacer hoy? 😊\n\n*1️⃣ Quiero pedir comida* 🍔\n*2️⃣ Tengo un negocio* 🏪\n\nResponde con el número de tu opción.';
  return postEvent({
    fromDigits: ALLOW,
    text: welcome,
    fromMe: true,
    tag: 'EC',
  });
});
await sleep(400);

await step('human_fromMe_operator_text', () =>
  postEvent({
    fromDigits: ALLOW,
    text: `Operador humano prueba cierre ${Date.now()}`,
    fromMe: true,
    tag: 'HU',
  }),
);
await sleep(400);

await step('customer_during_human_pause', () =>
  postEvent({ fromDigits: ALLOW, text: 'Hola', tag: 'HP' }),
);

await step('expire_human_pause_fixture', async () => {
  if (sb) {
    const { error } = await sb
      .from('wa_entry_threads')
      .update({ human_paused_until_ms: Date.now() - 1000 })
      .eq('from_digits', ALLOW);
    if (error) throw new Error(error.message);
    return { expired: true, via: 'supabase_js' };
  }
  const sqlPath = path.join(deployDir, '_expire-pause.sql');
  const until = Date.now() - 1000;
  writeFileSync(
    sqlPath,
    `update public.wa_entry_threads set human_paused_until_ms = ${until} where from_digits = '${ALLOW}';`,
  );
  const r = spawnSync(
    'npx',
    ['supabase', 'db', 'query', `--remote=${PROD}`, '--yes', '-o', 'json', '-f', sqlPath],
    { cwd: root, encoding: 'utf8', shell: true },
  );
  if (r.status !== 0) {
    throw new Error(`expire_pause_sql_failed: ${(r.stderr || r.stdout || '').slice(0, 240)}`);
  }
  return { expired: true, via: 'supabase_sql' };
});

await sleep(300);
await step('resume_after_pause_MENU', () =>
  postEvent({ fromDigits: ALLOW, text: 'MENÚ', tag: 'RS' }),
);
await sleep(800);

// 4) Outsider not allowlisted
await step('outsider_not_allowlisted', () =>
  postEvent({ fromDigits: OUTSIDER, text: 'Hola', tag: 'OUT' }),
);

// Auth negative
await step('forged_signature', () =>
  postEvent({
    fromDigits: ALLOW,
    text: 'Hola',
    tag: 'FG',
    signature: 'forged-not-real',
  }),
);

const after = await dbSnapshot('after');
const health1 = await (await fetch(`${BASE}/api/wa-entry/webhook`)).json();

// Link checks
const linkChecks = {};
for (const [name, url] of [
  ['consumer_assistant', 'https://elmenuxfa.com/asistente?ref=wa'],
  ['business_landing', 'https://business.elmenuxfa.com/'],
  ['business_register', 'https://app.elmenuxfa.com/?tab=register'],
  ['business_manage', 'https://app.elmenuxfa.com/'],
  ['directory', 'https://elmenuxfa.com/'],
]) {
  const started = Date.now();
  try {
    const res = await fetch(url, { redirect: 'follow' });
    linkChecks[name] = { url, status: res.status, ms: Date.now() - started, finalUrl: res.url };
  } catch (err) {
    linkChecks[name] = { url, error: String(err?.message || err), ms: Date.now() - started };
  }
}

const report = {
  at: new Date().toISOString(),
  allowlist: ALLOW,
  outsider: OUTSIDER,
  healthBefore: health0,
  healthAfter: health1,
  steps,
  before,
  after,
  linkChecks,
  secretFp: createHash('sha256').update(secret).digest('hex').slice(0, 12),
};

writeFileSync(path.join(deployDir, 'closure-trial-report.json'), JSON.stringify(report, null, 2));
console.log(
  JSON.stringify(
    {
      ok: steps.every((s) => s.ok),
      steps: steps.length,
      healthAllowlist: health1.allowlistCount,
      report: 'site/.wa-entry-prod-deploy/closure-trial-report.json',
    },
    null,
    2,
  ),
);
