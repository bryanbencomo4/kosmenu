#!/usr/bin/env node
/**
 * Deploy Next Preview with business/consumer assistants + Preview handoff store.
 * NEVER --prod. Keeps WA inbound/router idle (receptionist not armed).
 *
 *   CONFIRM_WA_HANDOFF_ASSISTANTS_PREVIEW=1 node site/scripts/deploy-wa-handoff-assistants-preview.mjs
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PREVIEW = 'gsfxqzvmyzjjgpigrste';
const PROD = 'qqhberaayhohxlbbhdyi';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');
const siteRoot = path.join(root, 'site');
const envPath = path.join(siteRoot, '.wa-entry-preview-deploy', 'vercel-preview.env');

if (process.env.CONFIRM_WA_HANDOFF_ASSISTANTS_PREVIEW !== '1') {
  console.error('Refused: set CONFIRM_WA_HANDOFF_ASSISTANTS_PREVIEW=1');
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
  if (!v) {
    console.error('Missing', key);
    process.exit(1);
  }
  return v;
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

// Force idle WA for this deploy — do not arm receptionist until Flutter+API proven.
const forced = [
  'PLATFORM_WA_INBOUND=0',
  'PLATFORM_WA_ROUTER=0',
  `PLATFORM_WA_ADAPTER=${req('PLATFORM_WA_ADAPTER')}`,
  `PLATFORM_WA_STORE=${req('PLATFORM_WA_STORE')}`,
  'PLATFORM_WA_ALLOW_REAL_WASENDER=0',
  `PLATFORM_WA_PREVIEW_PROJECT_REF=${req('PLATFORM_WA_PREVIEW_PROJECT_REF')}`,
  `PLATFORM_WA_PREVIEW_SUPABASE_URL=${req('PLATFORM_WA_PREVIEW_SUPABASE_URL')}`,
  `PLATFORM_WA_PREVIEW_SERVICE_ROLE_KEY=${req('PLATFORM_WA_PREVIEW_SERVICE_ROLE_KEY')}`,
  `PLATFORM_WA_WEBHOOK_SECRET=${req('PLATFORM_WA_WEBHOOK_SECRET')}`,
  'BUSINESS_ASSISTANT_ENABLED=1',
  'NEXT_PUBLIC_BUSINESS_ASSISTANT=1',
  'NEXT_PUBLIC_DISCOVERY_ASSISTANT=1',
  'DISCOVERY_ASSISTANT_ENABLED=1',
  'DISCOVERY_ASSISTANT_SIMULATE=1',
  'PLATFORM_WA_BUSINESS_ASSISTANT_URL=https://app.elmenuxfa.com/asistente',
  'PLATFORM_WA_CONSUMER_URL=https://elmenuxfa.com/asistente?ref=wa',
  'PLATFORM_WA_MASTER=0',
  'PLATFORM_WA_MASTER_RECEPTIONIST=0',
];

const deployArgs = ['deploy', '--yes'];
for (const line of forced) {
  deployArgs.push('--env', line);
  deployArgs.push('--build-env', line);
}

console.log('Deploying Vercel Preview (NOT production) — assistants + handoff Preview PG…');
console.log('WA inbound/router: idle. Master/receptionist: off.');
console.log('Preview ref:', PREVIEW);

const r = spawnSync('npx', ['vercel', ...deployArgs], {
  cwd: root,
  encoding: 'utf8',
  shell: true,
  env: process.env,
});

function redact(s) {
  return String(s || '')
    .replace(/eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g, '[REDACTED_JWT]')
    .replace(/PLATFORM_WA_WEBHOOK_SECRET=[^\s]+/g, 'PLATFORM_WA_WEBHOOK_SECRET=[REDACTED]')
    .replace(
      /PLATFORM_WA_PREVIEW_SERVICE_ROLE_KEY=[^\s]+/g,
      'PLATFORM_WA_PREVIEW_SERVICE_ROLE_KEY=[REDACTED]',
    );
}

process.stdout.write(redact(r.stdout));
process.stderr.write(redact(r.stderr));
if (r.status !== 0) process.exit(r.status || 1);

const combined = `${r.stdout || ''}\n${r.stderr || ''}`;
const urlMatch = combined.match(/https:\/\/[a-z0-9-]+\.vercel\.app/gi) || [];
const unique = [...new Set(urlMatch)];
const meta = {
  deployedAt: new Date().toISOString(),
  previewProjectRef: PREVIEW,
  purpose: 'wa_handoff_assistants_preview',
  inboundEnabled: false,
  routerEnabled: false,
  masterEnabled: false,
  receptionistEnabled: false,
  businessAssistantEnabled: true,
  discoveryAssistantEnabled: true,
  discoverySimulate: true,
  handoffStore: 'supabase_preview',
  urls: unique,
};
writeFileSync(
  path.join(siteRoot, '.wa-entry-preview-deploy', 'last-handoff-assistants-deploy.json'),
  JSON.stringify(meta, null, 2),
);
console.log('Deploy meta written. URLs:', unique.join(', ') || '(parse manually)');
process.exit(0);
