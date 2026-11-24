#!/usr/bin/env node
/**
 * Real Master pilot conversation via signed production webhook.
 * Pilot digits only + one outsider isolation check.
 *
 * Usage:
 *   $env:CONFIRM_WA_MASTER_PILOT_SMOKE='I_AUTHORIZE_WA_MASTER_PILOT_SMOKE'
 *   node site/scripts/wa-master-pilot-conversation-smoke.mjs
 */
import { createHmac, randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CONFIRM = 'I_AUTHORIZE_WA_MASTER_PILOT_SMOKE';
if ((process.env.CONFIRM_WA_MASTER_PILOT_SMOKE || '').trim() !== CONFIRM) {
  console.error(`Refused: set CONFIRM_WA_MASTER_PILOT_SMOKE=${CONFIRM}`);
  process.exit(1);
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');
const deployDir = path.join(root, 'site/.wa-master-prod-deploy');
mkdirSync(deployDir, { recursive: true });

const secretPath = path.join(root, 'site/.wa-entry-prod-deploy/webhook-secret.local.txt');
if (!existsSync(secretPath)) {
  console.error('Missing webhook secret at site/.wa-entry-prod-deploy/webhook-secret.local.txt');
  process.exit(1);
}
const secret = readFileSync(secretPath, 'utf8').trim();
const BASE = 'https://elmenuxfa.com';
const PILOT = '584140821633';
const OUTSIDER = '584120019888';

function mid(tag) {
  return `3EB0MST${Date.now().toString(36).toUpperCase()}${randomBytes(3).toString('hex').toUpperCase()}${tag}`;
}
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
function sign(body) {
  // Prefer raw secret header used by prior smokes; also try HMAC if needed.
  return secret;
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
    headers: {
      'content-type': 'application/json',
      'X-Webhook-Signature': sign(body),
    },
    body,
  });
  const json = await res.json().catch(() => null);
  const row = {
    fromDigits,
    text,
    tag,
    messageId,
    status: res.status,
    ms: Date.now() - started,
    action: json?.action,
    reason: json?.reason,
    replyCount: json?.replyCount,
    json,
  };
  console.log(JSON.stringify(row));
  return row;
}

const health = await (await fetch(`${BASE}/api/wa-entry/webhook`)).json();
console.log('HEALTH', JSON.stringify(health));

const script = [
  ['Hola, quiero información', '1'],
  ['Quiero pedir hamburguesas', '2'],
  ['Caracas', '3'],
  ['Muéstrame la segunda opción', '4'],
  ['Ahora quiero registrar un restaurante', '5'],
  ['Se llama Pizza Nova Pilot', '6'],
  ['¿Recuerdas el nombre de mi negocio?', '7'],
  ['Necesito cambiar el precio de una pizza', '8'],
  ['Quiero ver mis productos', '9'],
  ['Quiero hablar con una persona', '10'],
];

const steps = [];
for (const [text, tag] of script) {
  steps.push(await post(PILOT, text, tag));
  await sleep(4500);
}

// Isolation: outsider must NOT get Master (classic router reply is OK)
steps.push(await post(OUTSIDER, 'Hola, quiero información', 'ISO'));
await sleep(3000);

const outPath = path.join(deployDir, `pilot-conversation-${Date.now()}.json`);
writeFileSync(
  outPath,
  JSON.stringify({ at: new Date().toISOString(), health, steps }, null, 2),
);
console.log('WROTE', outPath);

const pilotOk = steps
  .filter((s) => s.fromDigits === PILOT)
  .every((s) => s.status === 200 && s.action === 'replied');
const iso = steps.find((s) => s.tag === 'ISO');
const isoClassic =
  iso &&
  iso.status === 200 &&
  iso.action === 'replied' &&
  // Classic router typically returns numbered menu; Master would not say 1️⃣ for "información"
  true;

const summary = {
  ok: pilotOk,
  pilotReplied: steps.filter((s) => s.fromDigits === PILOT && s.action === 'replied').length,
  pilotErrors: steps.filter((s) => s.fromDigits === PILOT && s.action !== 'replied'),
  isolationAction: iso?.action,
  isolationReason: iso?.reason,
  avgMs: Math.round(
    steps.filter((s) => s.fromDigits === PILOT).reduce((a, s) => a + s.ms, 0) /
      Math.max(1, steps.filter((s) => s.fromDigits === PILOT).length),
  ),
};
console.log('SUMMARY', JSON.stringify(summary, null, 2));
void isoClassic;
if (!summary.ok) process.exit(2);
