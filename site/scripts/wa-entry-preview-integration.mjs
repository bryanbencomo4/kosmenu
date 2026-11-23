#!/usr/bin/env node
/**
 * Runs wa-entry Preview integration Vitest (isolated sender, Preview DB).
 * Does not touch production or send real WhatsApp messages.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PREVIEW = 'gsfxqzvmyzjjgpigrste';
const PROD = 'qqhberaayhohxlbbhdyi';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');
const siteRoot = path.join(root, 'site');

function loadEnvFile(filePath, into) {
  if (!existsSync(filePath)) return;
  for (const line of readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i < 0) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    into[k] = v;
  }
}

const bag = {};
loadEnvFile(path.join(root, '.env.preview.local'), bag);
loadEnvFile(path.join(root, '.env.preview.keys'), bag);
const url = (bag.NEXT_PUBLIC_SUPABASE_URL || bag.SUPABASE_URL || '').trim();
const key = (bag.SUPABASE_SERVICE_ROLE_KEY || '').trim();

if (!url.includes(PREVIEW) || url.includes(PROD)) {
  console.error('Refused: Preview URL missing or points at production.');
  process.exit(1);
}
if (!key) {
  console.error('Refused: missing Preview service role key.');
  process.exit(1);
}

console.log(`wa-entry Preview integration → ${PREVIEW}`);
const r = spawnSync('npx', ['vitest', 'run', 'tests/wa-entry-preview-integration.test.ts'], {
  cwd: siteRoot,
  encoding: 'utf8',
  shell: true,
  env: {
    ...process.env,
    PLATFORM_WA_PREVIEW_SUPABASE_URL: url,
    PLATFORM_WA_PREVIEW_SERVICE_ROLE_KEY: key,
    PLATFORM_WA_PREVIEW_PROJECT_REF: PREVIEW,
    PLATFORM_WA_ALLOW_REAL_WASENDER: '0',
  },
  stdio: 'inherit',
});

process.exit(r.status || 0);
