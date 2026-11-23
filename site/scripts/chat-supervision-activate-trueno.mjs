/**
 * One-shot Trueno activation checklist after owner authorization.
 *
 * Requires BOTH phrases (migration is destructive-schema; smoke is separate):
 *   CHAT_SUPERVISION_MIGRATE_CONFIRM=I_AUTHORIZE_CHAT_SUPERVISION_MIGRATION
 *   CHAT_SUPERVISION_ACTIVATE_CONFIRM=I_AUTHORIZE_CHAT_SUPERVISION_TRUENO_ACTIVATE
 *   CHAT_SUPERVISION_MIGRATE_TARGET=prod
 *
 * This script:
 *   1) applies migration + realtime publication (via apply script)
 *   2) runs read-only readiness and refuses if SCHEMA_NOT_READY
 *   3) prints deploy/flag/smoke commands (does NOT deploy or set Vercel env)
 *
 * Usage (repo root):
 *   $env:CHAT_SUPERVISION_MIGRATE_CONFIRM='I_AUTHORIZE_CHAT_SUPERVISION_MIGRATION'
 *   $env:CHAT_SUPERVISION_ACTIVATE_CONFIRM='I_AUTHORIZE_CHAT_SUPERVISION_TRUENO_ACTIVATE'
 *   $env:CHAT_SUPERVISION_MIGRATE_TARGET='prod'
 *   node site/scripts/chat-supervision-activate-trueno.mjs
 */
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const MIGRATE = 'I_AUTHORIZE_CHAT_SUPERVISION_MIGRATION';
const ACTIVATE = 'I_AUTHORIZE_CHAT_SUPERVISION_TRUENO_ACTIVATE';
const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..', '..');

if ((process.env.CHAT_SUPERVISION_MIGRATE_CONFIRM || '').trim() !== MIGRATE) {
  console.error(`Refusing: CHAT_SUPERVISION_MIGRATE_CONFIRM=${MIGRATE}`);
  process.exit(2);
}
if ((process.env.CHAT_SUPERVISION_ACTIVATE_CONFIRM || '').trim() !== ACTIVATE) {
  console.error(`Refusing: CHAT_SUPERVISION_ACTIVATE_CONFIRM=${ACTIVATE}`);
  process.exit(2);
}
if ((process.env.CHAT_SUPERVISION_MIGRATE_TARGET || '').trim().toLowerCase() !== 'prod') {
  console.error('Refusing: CHAT_SUPERVISION_MIGRATE_TARGET must be prod for Trueno pilot.');
  process.exit(2);
}

function run(cmd, args, label) {
  console.log(`\n=== ${label} ===`);
  const r = spawnSync(cmd, args, {
    cwd: root,
    encoding: 'utf8',
    shell: true,
    env: process.env,
    stdio: 'inherit',
  });
  if (r.status !== 0) {
    console.error(`${label} failed with status ${r.status}`);
    process.exit(r.status || 1);
  }
}

run('node', ['site/scripts/validate-chat-supervision-migration.mjs'], 'validate_sql');
run('node', ['site/scripts/apply-chat-supervision-migration.mjs'], 'apply_migration');
run('node', ['site/scripts/chat-supervision-remote-readiness.mjs'], 'readiness');

console.log(`
SCHEMA applied. Still required before GO (manual / separate auth):

1) Deploy feature/chat-supervision-human (or merge) so /api/panel/conversaciones exists on elmenuxfa.com
2) Set production env (Trueno only):
   CHAT_SUPERVISION_ENABLED=1
   CHAT_SUPERVISION_WASENDER=1
   CHAT_SUPERVISION_HUMAN_TAKEOVER=1
   CHAT_SUPERVISION_COMMERCE_IDS=0aa8c53b-07f1-446e-8b88-66c2b7ae89ea
   CHAT_SUPERVISION_SESSION_PEPPER=<secret>
   # unset MEMORY / E2E bearer vars
3) Optional dedicated notify number:
   CHAT_SUPERVISION_WHATSAPP_CONFIRM=I_AUTHORIZE_TRUENO_SUPERVISION_WHATSAPP
   CHAT_SUPERVISION_WHATSAPP_E164=+58…
   node site/scripts/set-trueno-supervision-whatsapp.mjs
4) Smoke:
   CHAT_SUPERVISION_SMOKE_CONFIRM=I_AUTHORIZE_CHAT_SUPERVISION_SMOKE
   BASE_URL=https://elmenuxfa.com
   CHAT_SUPERVISION_SMOKE_BEARER=<merchant JWT>
   node site/scripts/chat-supervision-post-migration-smoke.mjs
`);
