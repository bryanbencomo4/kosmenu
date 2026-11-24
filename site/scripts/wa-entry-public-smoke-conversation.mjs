#!/usr/bin/env node
/** Public-open conversation smoke (signed webhooks). New IDs only. */
import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CONFIRM = 'I_AUTHORIZE_WA_ENTRY_PUBLIC_SMOKE';
if ((process.env.CONFIRM_WA_ENTRY_PUBLIC_SMOKE || '').trim() !== CONFIRM) {
  console.error(`Refused: set CONFIRM_WA_ENTRY_PUBLIC_SMOKE=${CONFIRM}`);
  process.exit(1);
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');
const deployDir = path.join(root, 'site/.wa-entry-prod-deploy');
mkdirSync(deployDir, { recursive: true });
const secret = readFileSync(path.join(deployDir, 'webhook-secret.local.txt'), 'utf8').trim();
const BASE = 'https://elmenuxfa.com';
const REAL = '584140821633';
const PUBLIC_NEW = '584120019999'; // previously would be not_allowlisted

function mid(tag) {
  return `3EB0PUB${Date.now().toString(36).toUpperCase()}${randomBytes(3).toString('hex').toUpperCase()}${tag}`;
}
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function post(fromDigits, text, tag) {
  const messageId = mid(tag);
  const body = JSON.stringify({
    event: 'messages.received',
    sessionId: 'ELMENUXFA1',
    data: {
      messages: {
        key: {
          id: messageId,
          fromMe: false,
          remoteJid: `${fromDigits}@s.whatsapp.net`,
          cleanedSenderPn: fromDigits,
        },
        messageTimestamp: Math.floor(Date.now() / 1000),
        messageBody: text,
      },
    },
  });
  const started = Date.now();
  const res = await fetch(`${BASE}/api/wa-entry/webhook`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'X-Webhook-Signature': secret },
    body,
  });
  const json = await res.json().catch(() => null);
  const row = { fromDigits, text, tag, messageId, status: res.status, ms: Date.now() - started, json };
  console.log(JSON.stringify(row));
  return row;
}

const health = await (await fetch(`${BASE}/api/wa-entry/webhook`)).json();
const steps = [];

// Previously blocked outsider should now get a reply (router public)
steps.push(await post(PUBLIC_NEW, 'Hola', 'NEW'));
await sleep(5500);

// Real phone full path
steps.push(await post(REAL, 'MENÚ', 'M'));
await sleep(5500);
steps.push(await post(REAL, '1', 'C'));
await sleep(5500);
steps.push(await post(REAL, 'MENÚ', 'M2'));
await sleep(5500);
steps.push(await post(REAL, '2', 'B'));
await sleep(5500);
steps.push(await post(REAL, '1', 'R'));
await sleep(6000);

// duplicate message_id
const dupId = mid('DUP');
const [a, b] = await Promise.all([
  post(REAL, 'MENÚ', 'D1').catch(() => null),
  (async () => {
    const body = JSON.stringify({
      event: 'messages.received',
      sessionId: 'ELMENUXFA1',
      data: {
        messages: {
          key: {
            id: dupId,
            fromMe: false,
            remoteJid: `${REAL}@s.whatsapp.net`,
            cleanedSenderPn: REAL,
          },
          messageTimestamp: Math.floor(Date.now() / 1000),
          messageBody: 'Hola',
        },
      },
    });
    // overwrite: do proper parallel same id
    return null;
  })(),
]);

const bodyDup = JSON.stringify({
  event: 'messages.received',
  sessionId: 'ELMENUXFA1',
  data: {
    messages: {
      key: {
        id: dupId,
        fromMe: false,
        remoteJid: `${REAL}@s.whatsapp.net`,
        cleanedSenderPn: REAL,
      },
      messageTimestamp: Math.floor(Date.now() / 1000),
      messageBody: 'Hola',
    },
  },
});
async function postRaw(messageId, text) {
  const body = JSON.stringify({
    event: 'messages.received',
    sessionId: 'ELMENUXFA1',
    data: {
      messages: {
        key: {
          id: messageId,
          fromMe: false,
          remoteJid: `${REAL}@s.whatsapp.net`,
          cleanedSenderPn: REAL,
        },
        messageTimestamp: Math.floor(Date.now() / 1000),
        messageBody: text,
      },
    },
  });
  const started = Date.now();
  const res = await fetch(`${BASE}/api/wa-entry/webhook`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'X-Webhook-Signature': secret },
    body,
  });
  const json = await res.json().catch(() => null);
  return { messageId, status: res.status, ms: Date.now() - started, json };
}
const dupPair = await Promise.all([postRaw(dupId, 'Hola'), postRaw(dupId, 'Hola')]);
steps.push({ tag: 'DUP', dupPair });

const out = {
  at: new Date().toISOString(),
  health,
  steps,
  publicOk:
    health.allowlistCount === 0 &&
    health.enforceAllowlist === false &&
    health.routerEnabled === true &&
    steps[0]?.json?.action === 'replied' &&
    steps[0]?.json?.reason !== 'not_allowlisted',
};
writeFileSync(path.join(deployDir, 'public-smoke-conversation.json'), JSON.stringify(out, null, 2));
console.log(JSON.stringify({ ok: out.publicOk, health, firstPublic: steps[0]?.json }, null, 2));
process.exit(out.publicOk ? 0 : 2);
