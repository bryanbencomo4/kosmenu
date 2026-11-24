#!/usr/bin/env node
/**
 * Production Next deploy for handoff/assistants with receptionist OFF.
 * Does NOT change Discovery/supervision/webhook secrets.
 *
 *   CONFIRM_WA_HANDOFF_PROD_DEPLOY=I_AUTHORIZE_WA_HANDOFF_PROD_DEPLOY \
 *   node site/scripts/deploy-wa-handoff-prod-next.mjs
 */
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CONFIRM = 'I_AUTHORIZE_WA_HANDOFF_PROD_DEPLOY';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');

if ((process.env.CONFIRM_WA_HANDOFF_PROD_DEPLOY || '').trim() !== CONFIRM) {
  console.error(`Refused: set CONFIRM_WA_HANDOFF_PROD_DEPLOY=${CONFIRM}`);
  process.exit(1);
}

// Fail-closed public Master receptionist; enable business API for Flutter.
const forced = [
  'BUSINESS_ASSISTANT_ENABLED=1',
  'NEXT_PUBLIC_BUSINESS_ASSISTANT=1',
  'PLATFORM_WA_MASTER_RECEPTIONIST=0',
  'PLATFORM_WA_BUSINESS_ASSISTANT_URL=https://app.elmenuxfa.com/asistente',
  'PLATFORM_WA_CONSUMER_URL=https://elmenuxfa.com/asistente?ref=wa',
];

const args = ['deploy', '--prod', '--yes'];
for (const line of forced) {
  args.push('--env', line);
  args.push('--build-env', line);
}

console.log('Deploying Next PRODUCTION (receptionist OFF, business assistant API ON)…');
console.log('Previous prod alias target must remain recoverable via Vercel dashboard.');

const r = spawnSync('npx', ['vercel', ...args], {
  cwd: root,
  encoding: 'utf8',
  shell: true,
  env: process.env,
});

function redact(s) {
  return String(s || '').replace(/eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g, '[REDACTED_JWT]');
}
process.stdout.write(redact(r.stdout));
process.stderr.write(redact(r.stderr));
if (r.status !== 0) process.exit(r.status || 1);

const urls = [...new Set((`${r.stdout}\n${r.stderr}`.match(/https:\/\/[a-z0-9-]+\.vercel\.app/gi) || []))];
const meta = {
  deployedAt: new Date().toISOString(),
  purpose: 'wa_handoff_prod_next',
  receptionistEnabled: false,
  businessAssistantEnabled: true,
  previousProdHint: 'kosmenu-okeo6gvwa-bryanbencomo4s-projects.vercel.app',
  urls,
};
writeFileSync(
  path.join(root, 'site/.wa-entry-preview-deploy/last-handoff-prod-next-deploy.json'),
  JSON.stringify(meta, null, 2),
);
console.log('Deploy meta written. URLs:', urls.join(', ') || '(parse manually)');
