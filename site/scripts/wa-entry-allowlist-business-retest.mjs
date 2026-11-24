#!/usr/bin/env node
/** Retest business flow only after fixing secondary session key. */
import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CONFIRM = 'I_AUTHORIZE_WA_ENTRY_BUSINESS_RETEST';
if ((process.env.CONFIRM_WA_ENTRY_BUSINESS_RETEST || '').trim() !== CONFIRM) {
  console.error(`Refused: set CONFIRM_WA_ENTRY_BUSINESS_RETEST=${CONFIRM}`);
  process.exit(1);
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');
const deployDir = path.join(root, 'site/.wa-entry-prod-deploy');
mkdirSync(deployDir, { recursive: true });
const secret = readFileSync(path.join(deployDir, 'webhook-secret.local.txt'), 'utf8').trim();
const BASE = 'https://elmenuxfa.com';
const ALLOW = '584140821633';

function mid(tag) {
  return `3EB0BIZ${Date.now().toString(36).toUpperCase()}${randomBytes(3).toString('hex').toUpperCase()}${tag}`;
}

async function post(text, tag) {
  const messageId = mid(tag);
  const body = JSON.stringify({
    event: 'messages.received',
    sessionId: 'ELMENUXFA1',
    data: {
      messages: {
        key: {
          id: messageId,
          fromMe: false,
          remoteJid: `${ALLOW}@s.whatsapp.net`,
          cleanedSenderPn: ALLOW,
        },
        messageTimestamp: Math.floor(Date.now() / 1000),
        messageBody: text,
      },
    },
  });
  const started = Date.now();
  const res = await fetch(`${BASE}/api/wa-entry/webhook`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'X-Webhook-Signature': secret,
    },
    body,
  });
  const json = await res.json().catch(() => null);
  const row = { text, tag, messageId, status: res.status, ms: Date.now() - started, json };
  console.log(JSON.stringify(row));
  return row;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

const steps = [];
steps.push(await post('MENÚ', 'M1'));
await sleep(5500);
steps.push(await post('2', 'B2'));
await sleep(5500);
steps.push(await post('1', 'R1'));
await sleep(5500);
steps.push(await post('MENÚ', 'M2'));
await sleep(5500);
steps.push(await post('2', 'B3'));
await sleep(5500);
steps.push(await post('2', 'G2'));
await sleep(6000);

writeFileSync(
  path.join(deployDir, 'business-retest-steps.json'),
  JSON.stringify({ at: new Date().toISOString(), steps }, null, 2),
);
console.log(JSON.stringify({ ok: steps.every((s) => s.status === 200 && s.json?.action === 'replied') }));
