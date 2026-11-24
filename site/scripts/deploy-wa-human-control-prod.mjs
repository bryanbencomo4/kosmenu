#!/usr/bin/env node
/**
 * Deploy human-control + bot UX with Master intelligence OFF.
 *
 *   CONFIRM_WA_HUMAN_CONTROL_DEPLOY=I_AUTHORIZE_WA_HUMAN_CONTROL_DEPLOY \
 *   node site/scripts/deploy-wa-human-control-prod.mjs
 */
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CONFIRM = 'I_AUTHORIZE_WA_HUMAN_CONTROL_DEPLOY';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

if ((process.env.CONFIRM_WA_HUMAN_CONTROL_DEPLOY || '').trim() !== CONFIRM) {
  console.error(`Refused: set CONFIRM_WA_HUMAN_CONTROL_DEPLOY=${CONFIRM}`);
  process.exit(1);
}

const forced = [
  'BUSINESS_ASSISTANT_ENABLED=1',
  'NEXT_PUBLIC_BUSINESS_ASSISTANT=1',
  'PLATFORM_WA_MASTER=0',
  'PLATFORM_WA_MASTER_PUBLIC=0',
  'PLATFORM_WA_MASTER_RECEPTIONIST=0',
  'PLATFORM_WA_MASTER_SHADOW=0',
  'PLATFORM_WA_BOT_MUTE=0',
  'PLATFORM_WA_OPERATOR_CONTROL=1',
  'PLATFORM_WA_BUSINESS_ASSISTANT_URL=https://app.elmenuxfa.com/asistente',
  'PLATFORM_WA_CONSUMER_URL=https://elmenuxfa.com/asistente?ref=wa',
];

const args = ['deploy', '--prod', '--yes'];
for (const line of forced) {
  args.push('--env', line, '--build-env', line);
}

console.log('Deploying human-control production (Master OFF)…');
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
  path.join(root, 'site/.wa-entry-preview-deploy/last-human-control-deploy.json'),
  JSON.stringify(
    {
      at: new Date().toISOString(),
      purpose: 'wa_human_control_master_off',
      masterEnabled: false,
      urls,
    },
    null,
    2,
  ),
);
console.log('Deploy meta written.', urls.join(', '));
