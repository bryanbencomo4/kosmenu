#!/usr/bin/env node
/**
 * Arm production wa-entry for ALLOWLIST-ONLY real replies (ELMENUXFA1 trial).
 * - Requires local WASENDER_API_KEY file (gitignored) or env WASENDER_API_KEY
 * - Sets ROUTER=1 ALLOW_REAL=1 ENFORCE_ALLOWLIST=1 + single allowlist digits
 * - Never prints secrets
 *
 * Usage (repo root):
 *   $env:CONFIRM_WA_ENTRY_ALLOWLIST_TRIAL='I_AUTHORIZE_WA_ENTRY_ALLOWLIST_TRIAL'
 *   $env:PLATFORM_WA_ALLOWLIST_DIGITS='58414XXXXXXX'
 *   node site/scripts/arm-wa-entry-allowlist-trial-prod.mjs
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CONFIRM = 'I_AUTHORIZE_WA_ENTRY_ALLOWLIST_TRIAL';
if ((process.env.CONFIRM_WA_ENTRY_ALLOWLIST_TRIAL || '').trim() !== CONFIRM) {
  console.error(`Refused: set CONFIRM_WA_ENTRY_ALLOWLIST_TRIAL=${CONFIRM}`);
  process.exit(1);
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');
const deployDir = path.join(root, 'site/.wa-entry-prod-deploy');
const keyFile = path.join(deployDir, 'wasender-api-key.local.txt');
mkdirSync(deployDir, { recursive: true });

const allowlist = String(process.env.PLATFORM_WA_ALLOWLIST_DIGITS || '')
  .split(/[,\s]+/)
  .map((s) => s.replace(/\D/g, ''))
  .filter(Boolean);
if (allowlist.length !== 1) {
  console.error('Refused: exactly one PLATFORM_WA_ALLOWLIST_DIGITS number required for trial');
  process.exit(1);
}
const digits = allowlist[0];
if (digits.length < 10 || digits.length > 15) {
  console.error(JSON.stringify({ ok: false, error: 'allowlist_digits_length_invalid', len: digits.length }));
  process.exit(1);
}

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

let apiKey = (process.env.WASENDER_API_KEY || '').trim();
if (!apiKey && existsSync(keyFile)) {
  apiKey = readFileSync(keyFile, 'utf8').trim();
}
if (!apiKey || apiKey.length < 20) {
  console.error(JSON.stringify({ ok: false, error: 'wasender_api_key_missing' }));
  process.exit(1);
}
if (/https?:\/\//i.test(apiKey) || /\s/.test(apiKey)) {
  console.error(JSON.stringify({ ok: false, error: 'wasender_api_key_invalid_shape' }));
  process.exit(1);
}

writeFileSync(keyFile, `${apiKey}\n`, { encoding: 'utf8', mode: 0o600 });
const keyFp = fp(apiKey);

const vars = {
  PLATFORM_WA_INBOUND: '1',
  PLATFORM_WA_ROUTER: '1',
  PLATFORM_WA_ADAPTER: 'wasender',
  PLATFORM_WA_STORE: 'supabase',
  PLATFORM_WA_ALLOW_REAL_WASENDER: '1',
  PLATFORM_WA_ENFORCE_ALLOWLIST: '1',
  PLATFORM_WA_ALLOWLIST_DIGITS: digits,
  PLATFORM_WA_PROD_PROJECT_REF: 'qqhberaayhohxlbbhdyi',
  WASENDER_API_KEY: apiKey,
};

for (const [key, value] of Object.entries(vars)) {
  setVercelEnv(key, value);
  if (key === 'WASENDER_API_KEY') {
    console.log(`set ${key}=(fp=${keyFp} prefix=${apiKey.slice(0, 6)} suffix=${apiKey.slice(-4)})`);
  } else if (key === 'PLATFORM_WA_ALLOWLIST_DIGITS') {
    console.log(`set ${key}=${digits}`);
  } else {
    console.log(`set ${key}=${value}`);
  }
}

const meta = {
  at: new Date().toISOString(),
  mode: 'allowlist_trial',
  inbound: '1',
  router: '1',
  allowReal: '1',
  enforceAllowlist: '1',
  allowlistDigits: digits,
  allowlistCount: 1,
  keyFp,
  keyPrefix: apiKey.slice(0, 6),
  keySuffix: apiKey.slice(-4),
  prodRef: 'qqhberaayhohxlbbhdyi',
  note: 'Only allowlisted digits get replies. Redeploy required. Use fresh WhatsApp message IDs (not passive_probe).',
};
writeFileSync(path.join(deployDir, 'allowlist-trial-arm-meta.json'), JSON.stringify(meta, null, 2));
console.log(JSON.stringify({ ok: true, ...meta }, null, 2));
