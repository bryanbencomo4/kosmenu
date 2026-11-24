#!/usr/bin/env node
/**
 * Controlled public open for wa-entry production.
 * Phase A (default): set conservative limits, KEEP allowlist.
 * Phase B (--open-public): ENFORCE=0 + empty allowlist (requires prior confirm).
 *
 * Usage:
 *   CONFIRM=... PHASE=limits node site/scripts/arm-wa-entry-public-controlled-prod.mjs
 *   CONFIRM=... PHASE=open node site/scripts/arm-wa-entry-public-controlled-prod.mjs
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CONFIRM = 'I_AUTHORIZE_WA_ENTRY_PUBLIC_CONTROLLED';
if ((process.env.CONFIRM_WA_ENTRY_PUBLIC_CONTROLLED || '').trim() !== CONFIRM) {
  console.error(`Refused: set CONFIRM_WA_ENTRY_PUBLIC_CONTROLLED=${CONFIRM}`);
  process.exit(1);
}

const phase = (process.env.PHASE || 'limits').trim().toLowerCase();
if (phase !== 'limits' && phase !== 'open' && phase !== 'router_off' && phase !== 'router_on') {
  console.error('Refused: PHASE must be limits|open|router_off|router_on');
  process.exit(1);
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');
const deployDir = path.join(root, 'site/.wa-entry-prod-deploy');
mkdirSync(deployDir, { recursive: true });

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
  console.log(`set ${key}=${key.includes('DIGITS') ? `(len=${value.length})` : value}`);
}

const common = {
  PLATFORM_WA_INBOUND: '1',
  PLATFORM_WA_ADAPTER: 'wasender',
  PLATFORM_WA_STORE: 'supabase',
  PLATFORM_WA_ALLOW_REAL_WASENDER: '1',
  PLATFORM_WA_MAX_REPLIES_PER_HOUR: '12',
  PLATFORM_WA_WEBHOOK_RATE_PER_MINUTE: '60',
  PLATFORM_WA_PROD_PROJECT_REF: 'qqhberaayhohxlbbhdyi',
};

let vars;
if (phase === 'limits') {
  vars = {
    ...common,
    PLATFORM_WA_ROUTER: '1',
    PLATFORM_WA_ENFORCE_ALLOWLIST: '1',
    PLATFORM_WA_ALLOWLIST_DIGITS: '584140821633',
  };
} else if (phase === 'open') {
  vars = {
    ...common,
    PLATFORM_WA_ROUTER: '1',
    PLATFORM_WA_ENFORCE_ALLOWLIST: '0',
    PLATFORM_WA_ALLOWLIST_DIGITS: '',
  };
} else if (phase === 'router_off') {
  vars = { PLATFORM_WA_ROUTER: '0' };
} else {
  vars = { PLATFORM_WA_ROUTER: '1' };
}

for (const [k, v] of Object.entries(vars)) setVercelEnv(k, v);

const meta = {
  at: new Date().toISOString(),
  phase,
  vars,
  note:
    phase === 'open'
      ? 'Public open: enforce off, empty allowlist. Bot replies to inbound only.'
      : phase === 'limits'
        ? 'Limits armed; allowlist still enforced until PHASE=open.'
        : `Router ${phase}`,
};
writeFileSync(path.join(deployDir, `public-controlled-${phase}.json`), JSON.stringify(meta, null, 2));
console.log(JSON.stringify({ ok: true, ...meta }, null, 2));
