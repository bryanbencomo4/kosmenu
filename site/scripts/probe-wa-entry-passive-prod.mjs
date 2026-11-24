#!/usr/bin/env node
/**
 * Probe production passive path: forged 401, valid signature claim+router_off, duplicate.
 * Never prints the webhook secret.
 */
import { createHash, randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');
const deployDir = path.join(root, 'site/.wa-entry-prod-deploy');
const secretFile = path.join(deployDir, 'webhook-secret.local.txt');
const envFile = path.join(deployDir, 'vercel-production.env');
const outFile = path.join(deployDir, 'passive-probe-result.json');

const BASE = process.env.WA_ENTRY_PROD_BASE || 'https://elmenuxfa.com';
const PROD = 'qqhberaayhohxlbbhdyi';

function loadEnv(filePath) {
  const out = {};
  if (!readFileSync) return out;
  try {
    for (const line of readFileSync(filePath, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (!m) continue;
      let v = m[2];
      if (
        (v.startsWith('"') && v.endsWith('"')) ||
        (v.startsWith("'") && v.endsWith("'"))
      ) {
        v = v.slice(1, -1);
      }
      out[m[1]] = v.replace(/\\n/g, '\n');
    }
  } catch {
    /* optional */
  }
  return out;
}

function fp(v) {
  return createHash('sha256').update(String(v)).digest('hex').slice(0, 12);
}

const secret = readFileSync(secretFile, 'utf8').trim();
if (!secret) {
  console.error(JSON.stringify({ ok: false, error: 'missing_local_secret' }));
  process.exit(1);
}

const messageId = `wamid.passive_probe_${Date.now()}_${randomBytes(4).toString('hex')}`;
const payload = {
  event: 'messages.received',
  sessionId: 'ELMENUXFA1',
  data: {
    messages: {
      key: {
        id: messageId,
        fromMe: false,
        remoteJid: '584129990001@s.whatsapp.net',
        cleanedSenderPn: '584129990001',
      },
      messageTimestamp: Math.floor(Date.now() / 1000),
      messageBody: 'Hola',
    },
  },
};
const body = JSON.stringify(payload);

async function post(signature) {
  const started = Date.now();
  const res = await fetch(`${BASE}/api/wa-entry/webhook`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(signature ? { 'X-Webhook-Signature': signature } : {}),
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
  return { status: res.status, ms: Date.now() - started, json, text: text.slice(0, 240) };
}

const healthRes = await fetch(`${BASE}/api/wa-entry/webhook`);
const health = await healthRes.json();

const forged = await post('forged-signature-not-real');
const valid = await post(secret);
const dup = await post(secret);

const env = loadEnv(envFile);
const url = (env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
const key = (env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

let persist = { checked: false };
if (url && key && url.includes(PROD)) {
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client
    .from('wa_entry_seen_messages')
    .select('message_id,session_id')
    .eq('message_id', messageId)
    .maybeSingle();
  persist = {
    checked: true,
    found: Boolean(data),
    sessionId: data?.session_id || null,
    error: error?.message || null,
    urlHost: new URL(url).host,
  };
} else {
  persist = {
    checked: false,
    reason: 'prod_supabase_env_unavailable_in_local_probe',
  };
}

const report = {
  ok:
    health.inboundEnabled === true &&
    health.routerEnabled === false &&
    health.realWasenderEnabled === false &&
    forged.status === 401 &&
    valid.status === 200 &&
    valid.json?.reason === 'router_off' &&
    dup.json?.reason === 'duplicate',
  health,
  secretFp: fp(secret),
  messageIdFp: fp(messageId),
  forged: { status: forged.status, error: forged.json?.error || null, ms: forged.ms },
  valid: {
    status: valid.status,
    action: valid.json?.action,
    reason: valid.json?.reason,
    replyCount: valid.json?.replyCount,
    ms: valid.ms,
  },
  duplicate: {
    status: dup.status,
    action: dup.json?.action,
    reason: dup.json?.reason,
    ms: dup.ms,
  },
  persist,
};

mkdirSync(deployDir, { recursive: true });
writeFileSync(outFile, JSON.stringify(report, null, 2), 'utf8');
console.log(JSON.stringify(report, null, 2));
process.exit(report.ok ? 0 : 2);
