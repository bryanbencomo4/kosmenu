#!/usr/bin/env node
/**
 * Arm production wa-entry for PASSIVE reception only.
 * - Generates (or reuses local) webhook secret — never prints full value
 * - Sets Vercel Production flags: INBOUND=1 ROUTER=0 ALLOW_REAL=0
 * - Writes secret fingerprint + local secret file (gitignored)
 *
 * Usage (repo root):
 *   $env:CONFIRM_WA_ENTRY_ARM_PASSIVE='I_AUTHORIZE_WA_ENTRY_PASSIVE'
 *   node site/scripts/arm-wa-entry-passive-prod.mjs
 */
import { spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CONFIRM = 'I_AUTHORIZE_WA_ENTRY_PASSIVE';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');
const deployDir = path.join(root, 'site/.wa-entry-prod-deploy');
const secretFile = path.join(deployDir, 'webhook-secret.local.txt');
const metaFile = path.join(deployDir, 'passive-arm-meta.json');

if ((process.env.CONFIRM_WA_ENTRY_ARM_PASSIVE || '').trim() !== CONFIRM) {
  console.error(`Refused: set CONFIRM_WA_ENTRY_ARM_PASSIVE=${CONFIRM}`);
  process.exit(1);
}

mkdirSync(deployDir, { recursive: true });

function fp(value) {
  return createHash('sha256').update(String(value)).digest('hex').slice(0, 12);
}

function setVercelEnv(key, value) {
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
    console.error(`Failed setting ${key}`);
    console.error(add.stdout || '');
    console.error(add.stderr || '');
    process.exit(add.status || 1);
  }
}

let secret = '';
if (existsSync(secretFile)) {
  secret = readFileSync(secretFile, 'utf8').trim();
}
if (!secret || secret.length < 24) {
  secret = randomBytes(32).toString('hex');
  writeFileSync(secretFile, `${secret}\n`, { encoding: 'utf8', mode: 0o600 });
}

const secretFp = fp(secret);

const vars = {
  PLATFORM_WA_INBOUND: '1',
  PLATFORM_WA_ROUTER: '0',
  PLATFORM_WA_ADAPTER: 'wasender',
  PLATFORM_WA_STORE: 'supabase',
  PLATFORM_WA_ALLOW_REAL_WASENDER: '0',
  PLATFORM_WA_ENFORCE_ALLOWLIST: '1',
  PLATFORM_WA_ALLOWLIST_DIGITS: '',
  PLATFORM_WA_PROD_PROJECT_REF: 'qqhberaayhohxlbbhdyi',
  PLATFORM_WA_WEBHOOK_SECRET: secret,
};

for (const [key, value] of Object.entries(vars)) {
  setVercelEnv(key, value);
  const shown =
    key.includes('SECRET') || key.includes('DIGITS') ? `(fp=${key.includes('SECRET') ? secretFp : 'empty'})` : value;
  console.log(`set ${key}=${shown}`);
}

const meta = {
  at: new Date().toISOString(),
  mode: 'passive',
  webhookUrl: 'https://elmenuxfa.com/api/wa-entry/webhook',
  secretFp,
  inbound: '1',
  router: '0',
  allowReal: '0',
  enforceAllowlist: '1',
  store: 'supabase',
  prodRef: 'qqhberaayhohxlbbhdyi',
  wasenderEvents: ['messages.received'],
  note: 'Configure ELMENUXFA1 Payload URL + same secret; Endpoint ON; Ignore groups/broadcasts/channels stay ON.',
};
writeFileSync(metaFile, JSON.stringify(meta, null, 2), 'utf8');
console.log(JSON.stringify({ ok: true, ...meta, secretFile: 'site/.wa-entry-prod-deploy/webhook-secret.local.txt' }, null, 2));
