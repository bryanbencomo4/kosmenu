#!/usr/bin/env node
/**
 * Read-only ELMENUXFA1 / Wasender session inspect.
 * Never prints API keys or webhook secrets — fingerprints only.
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');
const deployDir = path.join(root, 'site/.wa-entry-prod-deploy');
const envPath =
  process.env.WA_ENTRY_PROD_ENV_FILE ||
  path.join(deployDir, 'vercel-production.env');

function loadEnv(filePath) {
  const out = {};
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
  return out;
}

function fp(value) {
  return createHash('sha256').update(String(value)).digest('hex').slice(0, 12);
}

function maskPhone(phone) {
  const d = String(phone || '').replace(/\D/g, '');
  if (d.length < 6) return '***';
  return `${d.slice(0, 3)}***${d.slice(-2)}`;
}

function sanitizeWebhookUrl(url) {
  if (!url) return null;
  try {
    const u = new URL(String(url));
    return `${u.protocol}//${u.host}${u.pathname}`;
  } catch {
    return 'invalid_url';
  }
}

const env = loadEnv(envPath);
const key = (env.WASENDER_API_KEY || '').trim();
if (!key) {
  console.error(JSON.stringify({ ok: false, error: 'missing_WASENDER_API_KEY' }));
  process.exit(1);
}

const headers = {
  Authorization: `Bearer ${key}`,
  Accept: 'application/json',
};

const listRes = await fetch('https://www.wasenderapi.com/api/whatsapp-sessions', {
  headers,
});
const listText = await listRes.text();
let listJson = null;
try {
  listJson = JSON.parse(listText);
} catch {
  /* ignore */
}

const sessions = Array.isArray(listJson?.data)
  ? listJson.data
  : Array.isArray(listJson)
    ? listJson
    : [];

const sanitized = sessions.map((s) => ({
  id: s.id,
  name: s.name,
  phone: maskPhone(s.phone_number),
  status: s.status,
  webhook_enabled: Boolean(s.webhook_enabled),
  webhook_url: sanitizeWebhookUrl(s.webhook_url),
  webhook_events: s.webhook_events || null,
  has_webhook_secret: Boolean(s.webhook_secret),
  webhook_secret_fp: s.webhook_secret ? fp(s.webhook_secret) : null,
}));

const elmenuxfa1 =
  sanitized.find((s) => String(s.name || '').toUpperCase() === 'ELMENUXFA1') ||
  sanitized.find((s) => String(s.name || '').toUpperCase().includes('ELMENU'));

const out = {
  ok: listRes.ok,
  status: listRes.status,
  key_fp: fp(key),
  session_count: sessions.length,
  sessions: sanitized,
  elmenuxfa1: elmenuxfa1 || null,
  error: listRes.ok
    ? null
    : listJson?.message || listJson?.error || listText.slice(0, 240),
  note:
    'Session list requires personal access token on some accounts; session API key may 401.',
};

mkdirSync(deployDir, { recursive: true });
writeFileSync(
  path.join(deployDir, 'elmenuxfa1-session-inspect.json'),
  JSON.stringify(out, null, 2),
  'utf8',
);
console.log(JSON.stringify(out, null, 2));
if (!listRes.ok) process.exit(2);
