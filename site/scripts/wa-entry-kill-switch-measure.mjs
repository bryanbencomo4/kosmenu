#!/usr/bin/env node
/**
 * Measured router kill-switch: ROUTER=0 → probe → ROUTER=1 → probe.
 * Does not touch Wasender session / disconnect. Never prints secrets.
 */
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CONFIRM = 'I_AUTHORIZE_WA_ENTRY_KILL_SWITCH_MEASURE';
if ((process.env.CONFIRM_WA_ENTRY_KILL_SWITCH_MEASURE || '').trim() !== CONFIRM) {
  console.error(`Refused: set CONFIRM_WA_ENTRY_KILL_SWITCH_MEASURE=${CONFIRM}`);
  process.exit(1);
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');
const deployDir = path.join(root, 'site/.wa-entry-prod-deploy');
mkdirSync(deployDir, { recursive: true });
const secret = readFileSync(path.join(deployDir, 'webhook-secret.local.txt'), 'utf8').trim();
const BASE = 'https://elmenuxfa.com';
const ALLOW = '584140821633';

function setEnv(key, value) {
  spawnSync('npx', ['vercel', 'env', 'rm', key, 'production', '--yes'], {
    cwd: root,
    encoding: 'utf8',
    shell: true,
  });
  const add = spawnSync('npx', ['vercel', 'env', 'add', key, 'production'], {
    cwd: root,
    encoding: 'utf8',
    shell: true,
    input: `${value}\n`,
  });
  if (add.status !== 0) {
    throw new Error(`env_set_failed:${key}:${add.stderr || add.stdout}`);
  }
}

function deployProd() {
  const started = Date.now();
  const r = spawnSync('npx', ['vercel', 'deploy', '--prod', '--yes'], {
    cwd: root,
    encoding: 'utf8',
    shell: true,
  });
  return {
    status: r.status,
    ms: Date.now() - started,
    tail: `${r.stdout || ''}\n${r.stderr || ''}`.slice(-800),
  };
}

async function health() {
  return (await fetch(`${BASE}/api/wa-entry/webhook`)).json();
}

async function probe(tag) {
  const messageId = `3EB0KILL${Date.now().toString(36).toUpperCase()}${randomBytes(2).toString('hex').toUpperCase()}${tag}`;
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
        messageBody: 'MENÚ',
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
  return { messageId, status: res.status, ms: Date.now() - started, json };
}

const report = { at: new Date().toISOString(), steps: [] };

const h0 = await health();
report.steps.push({ step: 'health_before', h0 });
console.log(JSON.stringify({ step: 'health_before', router: h0.routerEnabled, inbound: h0.inboundEnabled }));

setEnv('PLATFORM_WA_ROUTER', '0');
report.steps.push({ step: 'set_router_0', ok: true });
const dOff = deployProd();
report.steps.push({ step: 'deploy_router_off', ...dOff });
console.log(JSON.stringify({ step: 'deploy_router_off', status: dOff.status, ms: dOff.ms }));
if (dOff.status !== 0) {
  writeFileSync(path.join(deployDir, 'kill-switch-measure.json'), JSON.stringify(report, null, 2));
  process.exit(1);
}

await new Promise((r) => setTimeout(r, 3000));
const hOff = await health();
const pOff = await probe('OFF');
report.steps.push({ step: 'probe_router_off', health: hOff, probe: pOff });
console.log(
  JSON.stringify({
    step: 'probe_router_off',
    router: hOff.routerEnabled,
    action: pOff.json?.action,
    reason: pOff.json?.reason,
    ms: pOff.ms,
  }),
);

setEnv('PLATFORM_WA_ROUTER', '1');
report.steps.push({ step: 'set_router_1', ok: true });
const dOn = deployProd();
report.steps.push({ step: 'deploy_router_on', ...dOn });
console.log(JSON.stringify({ step: 'deploy_router_on', status: dOn.status, ms: dOn.ms }));
if (dOn.status !== 0) {
  writeFileSync(path.join(deployDir, 'kill-switch-measure.json'), JSON.stringify(report, null, 2));
  process.exit(1);
}

await new Promise((r) => setTimeout(r, 3000));
const hOn = await health();
const pOn = await probe('ON');
report.steps.push({ step: 'probe_router_on', health: hOn, probe: pOn });
console.log(
  JSON.stringify({
    step: 'probe_router_on',
    router: hOn.routerEnabled,
    action: pOn.json?.action,
    reason: pOn.json?.reason,
    ms: pOn.ms,
  }),
);

const ok =
  hOff.routerEnabled === false &&
  pOff.json?.reason === 'router_off' &&
  hOn.routerEnabled === true &&
  pOn.json?.action === 'replied' &&
  h0.inboundEnabled === true &&
  hOn.inboundEnabled === true;

report.ok = ok;
report.note =
  'Wasender session not touched. Only PLATFORM_WA_ROUTER flipped. Allowlist unchanged.';
writeFileSync(path.join(deployDir, 'kill-switch-measure.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ ok, report: 'site/.wa-entry-prod-deploy/kill-switch-measure.json' }));
process.exit(ok ? 0 : 2);
