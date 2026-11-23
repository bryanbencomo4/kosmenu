#!/usr/bin/env node
/**
 * Probe that WaSender-style access works: plain HTTPS + query bypass + webhook secret.
 * Does not print secrets.
 */
import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');
const deployDir = path.join(root, 'site/.wa-entry-preview-deploy');

function loadEnv(file) {
  const out = {};
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (!line.includes('=')) continue;
    const i = line.indexOf('=');
    out[line.slice(0, i)] = line.slice(i + 1).trim();
  }
  return out;
}

const bypassEnv = loadEnv(path.join(deployDir, 'vercel-protection-bypass.env'));
const waEnv = loadEnv(path.join(deployDir, 'vercel-preview.env'));
const meta = JSON.parse(readFileSync(path.join(deployDir, 'last-deploy.json'), 'utf8'));
const bypass = bypassEnv.VERCEL_AUTOMATION_BYPASS_SECRET;
const webhookSecret = waEnv.PLATFORM_WA_WEBHOOK_SECRET;
const base = meta.urls[0];
const pathName = meta.webhookPath || '/api/wa-entry/webhook';

if (!bypass || !webhookSecret || !base) {
  console.error('Missing bypass/webhook secret/deployment');
  process.exit(1);
}

const url = `${base}${pathName}?x-vercel-protection-bypass=${encodeURIComponent(bypass)}`;

// 1) GET without bypass should be HTML protection page
const bare = await fetch(`${base}${pathName}`);
const bareCt = bare.headers.get('content-type') || '';
const bareBody = await bare.text();

// 2) GET with bypass should be JSON health
const healthRes = await fetch(url);
const health = await healthRes.json();

// 3) POST forged webhook secret with bypass → 401
const forged = await fetch(url, {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    'x-webhook-signature': 'forged',
  },
  body: JSON.stringify({ event: 'messages.received' }),
});
const forgedJson = await forged.json();

// 4) POST valid webhook secret with bypass → kill_switch (flags off)
const okRes = await fetch(url, {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    'x-webhook-signature': webhookSecret,
  },
  body: JSON.stringify({
    event: 'messages.received',
    data: {
      messages: {
        key: {
          id: `bypass-probe-${Date.now()}`,
          fromMe: false,
          cleanedSenderPn: '584128880099',
          remoteJid: '584128880099@s.whatsapp.net',
        },
        messageBody: 'Hola',
      },
    },
  }),
});
const okJson = await okRes.json();

const report = {
  bareBlocked: bareCt.includes('text/html') || bareBody.includes('<!DOCTYPE html>'),
  healthOk:
    healthRes.status === 200 &&
    health.previewProjectRef === 'gsfxqzvmyzjjgpigrste' &&
    health.inboundEnabled === false &&
    health.realWasenderEnabled === false,
  forgedUnauthorized: forged.status === 401,
  authKillSwitch: okRes.status === 200 && okJson.reason === 'kill_switch',
  bypassFingerprint: createHash('sha256').update(bypass).digest('hex').slice(0, 12),
  webhookSecretFingerprint: createHash('sha256')
    .update(webhookSecret)
    .digest('hex')
    .slice(0, 12),
  publicEndpointBase: `${base}${pathName}`,
};

report.pass =
  report.bareBlocked &&
  report.healthOk &&
  report.forgedUnauthorized &&
  report.authKillSwitch;

console.log(JSON.stringify(report, null, 2));
process.exit(report.pass ? 0 : 2);
