#!/usr/bin/env node
/**
 * Publish platform WA inbox + durable tickets + fail-closed auto-reply allowlist.
 * Requires migration 20261124130000 already applied on prod.
 *
 *   CONFIRM_WA_PLATFORM_INBOX_DEPLOY=I_AUTHORIZE_WA_PLATFORM_INBOX_PILOT_639066A \
 *   node site/scripts/deploy-wa-platform-inbox-prod.mjs
 *
 * Does NOT change WaSender webhook. Master stays allowlist-only (not public).
 */
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CONFIRM = 'I_AUTHORIZE_WA_PLATFORM_INBOX_PILOT_639066A';
const PILOT = '584140821633';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

if ((process.env.CONFIRM_WA_PLATFORM_INBOX_DEPLOY || '').trim() !== CONFIRM) {
  console.error(`Refused: set CONFIRM_WA_PLATFORM_INBOX_DEPLOY=${CONFIRM}`);
  process.exit(1);
}

const forced = [
  'BUSINESS_ASSISTANT_ENABLED=1',
  'NEXT_PUBLIC_BUSINESS_ASSISTANT=1',
  // Absolute auto-reply silence outside pilot.
  `PLATFORM_WA_AUTO_REPLY_DIGITS=${PILOT}`,
  // Keep Master allowlist-only (not public).
  'PLATFORM_WA_MASTER=1',
  'PLATFORM_WA_MASTER_PUBLIC=0',
  'PLATFORM_WA_MASTER_RECEPTIONIST=0',
  'PLATFORM_WA_MASTER_SHADOW=0',
  'PLATFORM_WA_MASTER_ALLOW_GEMINI=1',
  'PLATFORM_WA_MASTER_SIMULATE=0',
  `PLATFORM_WA_MASTER_ALLOWLIST_DIGITS=${PILOT}`,
  'PLATFORM_WA_BOT_MUTE=0',
  'PLATFORM_WA_OPERATOR_CONTROL=1',
  // Durable inbox + option-9 tickets (migration applied).
  'PLATFORM_WA_INBOX_SUPABASE=1',
  'PLATFORM_WA_BUSINESS_ASSISTANT_URL=https://app.elmenuxfa.com/asistente',
  'PLATFORM_WA_CONSUMER_URL=https://elmenuxfa.com/asistente?ref=wa',
];

const args = ['deploy', '--prod', '--yes'];
for (const line of forced) {
  args.push('--env', line, '--build-env', line);
}

console.log('Deploying platform WA inbox (durable) + pilot allowlist…');
console.log('Migration 20261124130000: assumed applied (wa_platform_*); flag PLATFORM_WA_INBOX_SUPABASE=1');
const r = spawnSync('npx', ['vercel', ...args], {
  cwd: root,
  encoding: 'utf8',
  shell: true,
  env: process.env,
});
process.stdout.write(r.stdout || '');
process.stderr.write(r.stderr || '');
if (r.status !== 0) process.exit(r.status || 1);

const urls = [...new Set((`${r.stdout}\n${r.stderr}`.match(/https:\/\/[a-z0-9-]+\.vercel\.app/gi) || []))];
writeFileSync(
  path.join(root, 'site/.wa-entry-preview-deploy/last-platform-inbox-deploy.json'),
  JSON.stringify(
    {
      at: new Date().toISOString(),
      commitHint: '639066a+durable-inbox',
      autoReplyDigits: PILOT,
      masterPublic: false,
      inboxSupabase: true,
      migrationApplied: true,
      migration: '20261124130000_wa_platform_inbox_tickets.sql',
      urls,
    },
    null,
    2,
  ),
);

for (const [key, value] of [
  ['PLATFORM_WA_AUTO_REPLY_DIGITS', PILOT],
  ['PLATFORM_WA_INBOX_SUPABASE', '1'],
  ['PLATFORM_WA_MASTER_PUBLIC', '0'],
]) {
  const envAdd = spawnSync(
    'npx',
    ['vercel', 'env', 'add', key, 'production', '--value', value, '--yes', '--force'],
    { cwd: root, encoding: 'utf8', shell: true, env: process.env },
  );
  process.stdout.write(envAdd.stdout || '');
  process.stderr.write(envAdd.stderr || '');
}
console.log('OK deploy', urls.join(', '));
