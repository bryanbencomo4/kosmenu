#!/usr/bin/env node
/**
 * Update ELMENUXFA1 webhook via Wasender API (Personal Access Token).
 * Never prints token or webhook secret.
 *
 * Requires local files:
 *   site/.wa-entry-prod-deploy/wasender-pat.local.txt
 *   site/.wa-entry-prod-deploy/webhook-secret.local.txt
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CONFIRM = 'I_AUTHORIZE_ELMENUXFA1_WEBHOOK_UPDATE';
const SESSION_ID = 79701;
const WEBHOOK_URL = 'https://elmenuxfa.com/api/wa-entry/webhook';

if ((process.env.CONFIRM_ELMENUXFA1_WEBHOOK || '').trim() !== CONFIRM) {
  console.error(`Refused: set CONFIRM_ELMENUXFA1_WEBHOOK=${CONFIRM}`);
  process.exit(1);
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');
const deployDir = path.join(root, 'site/.wa-entry-prod-deploy');
const patFile = path.join(deployDir, 'wasender-pat.local.txt');
const secretFile = path.join(deployDir, 'webhook-secret.local.txt');

if (!existsSync(patFile)) {
  console.error(JSON.stringify({ ok: false, error: 'missing_wasender_pat_local' }));
  process.exit(2);
}
if (!existsSync(secretFile)) {
  console.error(JSON.stringify({ ok: false, error: 'missing_webhook_secret_local' }));
  process.exit(2);
}

const pat = readFileSync(patFile, 'utf8').trim();
const secret = readFileSync(secretFile, 'utf8').trim();
const fp = (v) => createHash('sha256').update(String(v)).digest('hex').slice(0, 12);

const body = {
  webhook_url: WEBHOOK_URL,
  webhook_enabled: true,
  webhook_events: ['messages.received'],
};

const res = await fetch(`https://www.wasenderapi.com/api/whatsapp-sessions/${SESSION_ID}`, {
  method: 'PUT',
  headers: {
    Authorization: `Bearer ${pat}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
  body: JSON.stringify(body),
});

const text = await res.text();
let json = null;
try {
  json = JSON.parse(text);
} catch {
  /* ignore */
}

const data = json?.data || json || {};
const report = {
  ok: res.ok,
  status: res.status,
  sessionId: SESSION_ID,
  webhook_enabled: data.webhook_enabled ?? null,
  webhook_url: data.webhook_url || null,
  webhook_events: data.webhook_events || null,
  secretFpLocal: fp(secret),
  note: 'Webhook secret must match PLATFORM_WA_WEBHOOK_SECRET (configured separately in dashboard/Vercel).',
  error: res.ok ? null : json?.message || json?.error || text.slice(0, 200),
};

writeFileSync(path.join(deployDir, 'webhook-update-result.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
process.exit(res.ok ? 0 : 1);
