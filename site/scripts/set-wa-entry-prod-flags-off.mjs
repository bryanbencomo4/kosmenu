#!/usr/bin/env node
/**
 * Set production wa-entry flags to OFF / fail-closed defaults.
 * Does not set webhook secret (requires ELMENUXFA1 backup first).
 * Does not enable inbound/router/real send.
 */
import { spawnSync } from 'node:child_process';

const CONFIRM = 'I_AUTHORIZE_WA_ENTRY_PROD_ENV_OFF';
if ((process.env.CONFIRM_WA_ENTRY_PROD_ENV || '').trim() !== CONFIRM) {
  console.error(`Refused: set CONFIRM_WA_ENTRY_PROD_ENV=${CONFIRM}`);
  process.exit(1);
}

const vars = {
  PLATFORM_WA_INBOUND: '0',
  PLATFORM_WA_ROUTER: '0',
  PLATFORM_WA_ADAPTER: 'wasender',
  PLATFORM_WA_STORE: 'supabase',
  PLATFORM_WA_ALLOW_REAL_WASENDER: '0',
  PLATFORM_WA_ENFORCE_ALLOWLIST: '1',
  PLATFORM_WA_ALLOWLIST_DIGITS: '',
  PLATFORM_WA_PROD_PROJECT_REF: 'qqhberaayhohxlbbhdyi',
};

function run(cmd, args, input) {
  const r = spawnSync(cmd, args, {
    encoding: 'utf8',
    shell: true,
    input,
  });
  return r;
}

for (const [key, value] of Object.entries(vars)) {
  // Remove existing production value if present (ignore failure).
  spawnSync('npx', ['vercel', 'env', 'rm', key, 'production', '--yes'], {
    encoding: 'utf8',
    shell: true,
  });
  const add = run(
    'npx',
    ['vercel', 'env', 'add', key, 'production'],
    `${value}\n`,
  );
  if (add.status !== 0) {
    console.error(`Failed setting ${key}`);
    console.error(add.stdout || '');
    console.error(add.stderr || '');
    process.exit(add.status || 1);
  }
  console.log(`set ${key}=${key.includes('SECRET') || key.includes('DIGITS') ? '(set)' : value}`);
}

console.log('OK: production wa-entry flags set OFF (fail-closed).');
