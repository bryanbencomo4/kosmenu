#!/usr/bin/env node
/**
 * Arm / disarm limited Master Assistant pilot on production Vercel.
 * Default PHASE=off keeps Master kill-switched.
 *
 * PHASE=off   → PLATFORM_WA_MASTER=0 (public router unchanged)
 * PHASE=deploy_flags_off → Master OFF vars only (after code deploy)
 * PHASE=pilot → Master ON + allowlist 584140821633 + Gemini under pilot limits
 *
 * Usage:
 *   $env:CONFIRM_WA_MASTER_PILOT='I_AUTHORIZE_WA_MASTER_PILOT_584140821633'
 *   $env:PHASE='pilot'
 *   node site/scripts/arm-wa-master-pilot-prod.mjs
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CONFIRM = 'I_AUTHORIZE_WA_MASTER_PILOT_584140821633';
const PILOT = '584140821633';

if ((process.env.CONFIRM_WA_MASTER_PILOT || '').trim() !== CONFIRM) {
  console.error(`Refused: set CONFIRM_WA_MASTER_PILOT=${CONFIRM}`);
  process.exit(1);
}

const phase = (process.env.PHASE || 'off').trim().toLowerCase();
if (!['off', 'deploy_flags_off', 'pilot'].includes(phase)) {
  console.error('Refused: PHASE must be off|deploy_flags_off|pilot');
  process.exit(1);
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');
const deployDir = path.join(root, 'site/.wa-master-prod-deploy');
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
  const shown = key.includes('DIGITS') ? `(len=${value.length})` : value;
  console.log(`set ${key}=${shown}`);
}

let vars;
if (phase === 'off' || phase === 'deploy_flags_off') {
  vars = {
    PLATFORM_WA_MASTER: '0',
    PLATFORM_WA_MASTER_SHADOW: '0',
    PLATFORM_WA_MASTER_ALLOW_GEMINI: '0',
    PLATFORM_WA_MASTER_SIMULATE: '1',
    PLATFORM_WA_MASTER_ALLOWLIST_DIGITS: '',
  };
} else {
  // pilot
  vars = {
    PLATFORM_WA_MASTER: '1',
    PLATFORM_WA_MASTER_SHADOW: '0',
    PLATFORM_WA_MASTER_ALLOWLIST_DIGITS: PILOT,
    PLATFORM_WA_MASTER_ALLOW_GEMINI: '1',
    PLATFORM_WA_MASTER_SIMULATE: '0',
    PLATFORM_WA_MASTER_MAX_MONTHLY_REQUESTS: '80',
    PLATFORM_WA_MASTER_MAX_GEMINI_HTTP_PER_TURN: '2',
    PLATFORM_WA_MASTER_MAX_REPLIES: '2',
  };
}

for (const [k, v] of Object.entries(vars)) setVercelEnv(k, v);

const meta = {
  at: new Date().toISOString(),
  phase,
  vars: {
    ...vars,
    PLATFORM_WA_MASTER_ALLOWLIST_DIGITS: vars.PLATFORM_WA_MASTER_ALLOWLIST_DIGITS
      ? PILOT
      : '',
  },
  note:
    phase === 'pilot'
      ? `Master ON only for ${PILOT}; all others keep classic router.`
      : 'Master OFF — classic public router only.',
};
writeFileSync(path.join(deployDir, `pilot-${phase}.json`), JSON.stringify(meta, null, 2));
console.log(JSON.stringify({ ok: true, ...meta }, null, 2));
