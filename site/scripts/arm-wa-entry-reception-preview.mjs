#!/usr/bin/env node
/**
 * Arm Preview deploy for RECEIVE-ONLY WaSender secondary-session test.
 * - ALLOW_REAL_WASENDER stays 0 (isolated simulated outbound only)
 * - Requires explicit allowlist digits
 * - Never --prod
 *
 * Usage (repo root):
 *   $env:CONFIRM_WA_ENTRY_ARM_RECEPTION='1'
 *   $env:PLATFORM_WA_ALLOWLIST_DIGITS='58412XXXXXXX'
 *   node site/scripts/arm-wa-entry-reception-preview.mjs
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PREVIEW = 'gsfxqzvmyzjjgpigrste';
const PROD = 'qqhberaayhohxlbbhdyi';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');
const envPath = path.join(root, 'site/.wa-entry-preview-deploy/vercel-preview.env');

if (process.env.CONFIRM_WA_ENTRY_ARM_RECEPTION !== '1') {
  console.error('Refused: set CONFIRM_WA_ENTRY_ARM_RECEPTION=1');
  process.exit(1);
}

const allowlist = (process.env.PLATFORM_WA_ALLOWLIST_DIGITS || '')
  .split(/[,\s]+/)
  .map((d) => d.replace(/\D/g, ''))
  .filter(Boolean);

if (allowlist.length === 0) {
  console.error('Refused: PLATFORM_WA_ALLOWLIST_DIGITS required (test numbers only).');
  process.exit(1);
}

if (!existsSync(envPath)) {
  console.error('Missing vercel-preview.env');
  process.exit(1);
}

const lines = readFileSync(envPath, 'utf8').split(/\r?\n/);
const map = Object.fromEntries(
  lines
    .filter((l) => l.includes('='))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i), l.slice(i + 1)];
    }),
);

if (!(map.PLATFORM_WA_PREVIEW_SUPABASE_URL || '').includes(PREVIEW)) {
  console.error('Refused: Preview Supabase URL invalid');
  process.exit(1);
}
if ((map.PLATFORM_WA_PREVIEW_SUPABASE_URL || '').includes(PROD)) {
  console.error('Refused: production Supabase URL');
  process.exit(1);
}

map.PLATFORM_WA_INBOUND = '1';
map.PLATFORM_WA_ROUTER = '1';
map.PLATFORM_WA_ADAPTER = 'preview_isolated';
map.PLATFORM_WA_STORE = 'supabase_preview';
map.PLATFORM_WA_ALLOW_REAL_WASENDER = '0';
map.PLATFORM_WA_ENFORCE_ALLOWLIST = '1';
map.PLATFORM_WA_ALLOWLIST_DIGITS = allowlist.join(',');
map.PLATFORM_WA_PREVIEW_PROJECT_REF = PREVIEW;

const next = Object.entries(map)
  .map(([k, v]) => `${k}=${v}`)
  .join('\n');
writeFileSync(envPath, `${next}\n`, 'utf8');

console.log(
  JSON.stringify(
    {
      arming: 'reception_only',
      inbound: 1,
      router: 1,
      realWasender: 0,
      allowlistCount: allowlist.length,
      adapter: 'preview_isolated',
      store: 'supabase_preview',
    },
    null,
    2,
  ),
);

const r = spawnSync(
  'node',
  [path.join(root, 'site/scripts/deploy-wa-entry-preview.mjs')],
  {
    cwd: root,
    encoding: 'utf8',
    shell: true,
    env: {
      ...process.env,
      CONFIRM_WA_ENTRY_PREVIEW_DEPLOY: '1',
    },
    stdio: 'inherit',
  },
);

if (r.status === 0) {
  // Refresh local Wasender URL against new Preview hostname (bypass already stored).
  spawnSync(
    'node',
    [path.join(root, 'site/scripts/ensure-wa-entry-protection-bypass.mjs')],
    {
      cwd: root,
      encoding: 'utf8',
      shell: true,
      env: { ...process.env, CONFIRM_WA_ENTRY_BYPASS: '1' },
      stdio: 'inherit',
    },
  );
}

process.exit(r.status || 0);
