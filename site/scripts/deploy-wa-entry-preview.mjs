#!/usr/bin/env node
/**
 * Deploy wa-entry HTTPS receiver to Vercel Preview ONLY (never --prod).
 * Reads site/.wa-entry-preview-deploy/vercel-preview.env (gitignored).
 *
 * Usage (repo root):
 *   CONFIRM_WA_ENTRY_PREVIEW_DEPLOY=1 node site/scripts/deploy-wa-entry-preview.mjs
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PREVIEW = 'gsfxqzvmyzjjgpigrste';
const PROD = 'qqhberaayhohxlbbhdyi';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');
const siteRoot = path.join(root, 'site');
const envPath = path.join(siteRoot, '.wa-entry-preview-deploy', 'vercel-preview.env');

if (process.env.CONFIRM_WA_ENTRY_PREVIEW_DEPLOY !== '1') {
  console.error('Refused: set CONFIRM_WA_ENTRY_PREVIEW_DEPLOY=1');
  process.exit(1);
}
if (!existsSync(envPath)) {
  console.error('Missing', envPath);
  process.exit(1);
}

const lines = readFileSync(envPath, 'utf8')
  .split(/\r?\n/)
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith('#'));

const map = Object.fromEntries(
  lines.map((l) => {
    const i = l.indexOf('=');
    return [l.slice(0, i), l.slice(i + 1)];
  }),
);

function req(key) {
  const v = (map[key] || '').trim();
  if (!v && key !== 'PLATFORM_WA_ALLOWLIST_DIGITS') {
    console.error('Missing', key);
    process.exit(1);
  }
  return v;
}

if (req('PLATFORM_WA_INBOUND') !== '0' || req('PLATFORM_WA_ROUTER') !== '0') {
  console.error('Refused: inbound/router must be 0 for this deploy.');
  process.exit(1);
}
if (req('PLATFORM_WA_ALLOW_REAL_WASENDER') !== '0') {
  console.error('Refused: real Wasender must be off.');
  process.exit(1);
}
if (req('PLATFORM_WA_ADAPTER') !== 'preview_isolated') {
  console.error('Refused: adapter must be preview_isolated.');
  process.exit(1);
}
if (req('PLATFORM_WA_STORE') !== 'supabase_preview') {
  console.error('Refused: store must be supabase_preview.');
  process.exit(1);
}
const previewUrl = req('PLATFORM_WA_PREVIEW_SUPABASE_URL');
if (!previewUrl.includes(PREVIEW) || previewUrl.includes(PROD)) {
  console.error('Refused: Preview Supabase URL invalid.');
  process.exit(1);
}
if (req('PLATFORM_WA_PREVIEW_PROJECT_REF') !== PREVIEW) {
  console.error('Refused: Preview project ref mismatch.');
  process.exit(1);
}

const secretFp = createHash('sha256')
  .update(req('PLATFORM_WA_WEBHOOK_SECRET'))
  .digest('hex')
  .slice(0, 12);

const deployArgs = ['deploy', '--yes'];
for (const line of lines) {
  deployArgs.push('--env', line);
  deployArgs.push('--build-env', line);
}

console.log('Deploying Vercel Preview (NOT production)…');
console.log('Flags: INBOUND=0 ROUTER=0 ADAPTER=preview_isolated STORE=supabase_preview');
console.log('Preview ref:', PREVIEW);
console.log('Webhook secret fingerprint:', secretFp);

// Project Root Directory in Vercel is `site`, so deploy from monorepo root.
const r = spawnSync('npx', ['vercel', ...deployArgs], {
  cwd: root,
  encoding: 'utf8',
  shell: true,
  env: process.env,
});

// Avoid dumping env; print stdout/stderr but redact long JWTs / secrets
function redact(s) {
  return String(s || '')
    .replace(/eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g, '[REDACTED_JWT]')
    .replace(/PLATFORM_WA_WEBHOOK_SECRET=[^\s]+/g, 'PLATFORM_WA_WEBHOOK_SECRET=[REDACTED]')
    .replace(/PLATFORM_WA_PREVIEW_SERVICE_ROLE_KEY=[^\s]+/g, 'PLATFORM_WA_PREVIEW_SERVICE_ROLE_KEY=[REDACTED]');
}

process.stdout.write(redact(r.stdout));
process.stderr.write(redact(r.stderr));

if (r.status !== 0) {
  process.exit(r.status || 1);
}

const combined = `${r.stdout || ''}\n${r.stderr || ''}`;
const urlMatch = combined.match(/https:\/\/[a-z0-9-]+\.vercel\.app/gi) || [];
const unique = [...new Set(urlMatch)];
const meta = {
  deployedAt: new Date().toISOString(),
  previewProjectRef: PREVIEW,
  webhookSecretFingerprint: secretFp,
  inboundEnabled: false,
  routerEnabled: false,
  adapter: 'preview_isolated',
  storeKind: 'supabase_preview',
  realWasenderEnabled: false,
  urls: unique,
  webhookPath: '/api/wa-entry/webhook',
};
writeFileSync(
  path.join(siteRoot, '.wa-entry-preview-deploy', 'last-deploy.json'),
  JSON.stringify(meta, null, 2),
);
console.log('Deploy meta written (no secrets). URLs:', unique.join(', ') || '(parse manually)');
process.exit(0);
