/**
 * Apply chat supervision migration to a Supabase remote — AUTHORIZATION GATED.
 *
 * Refuses to run unless both are set exactly:
 *   CHAT_SUPERVISION_MIGRATE_CONFIRM=I_AUTHORIZE_CHAT_SUPERVISION_MIGRATION
 *   CHAT_SUPERVISION_MIGRATE_TARGET=prod|preview
 *
 * Usage (from repo root):
 *   $env:CHAT_SUPERVISION_MIGRATE_CONFIRM='I_AUTHORIZE_CHAT_SUPERVISION_MIGRATION'
 *   $env:CHAT_SUPERVISION_MIGRATE_TARGET='prod'
 *   node site/scripts/apply-chat-supervision-migration.mjs
 *
 * Does not deploy app code or flip feature flags.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const CONFIRM = 'I_AUTHORIZE_CHAT_SUPERVISION_MIGRATION';
const TARGETS = {
  prod: 'qqhberaayhohxlbbhdyi',
  preview: 'gsfxqzvmyzjjgpigrste',
};

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..', '..');
const migrationPath = join(
  root,
  'supabase',
  'migrations',
  '20261123090000_chat_supervision_conversations.sql',
);

const confirm = (process.env.CHAT_SUPERVISION_MIGRATE_CONFIRM || '').trim();
const targetKey = (process.env.CHAT_SUPERVISION_MIGRATE_TARGET || '').trim().toLowerCase();
const projectRef = TARGETS[targetKey];

if (confirm !== CONFIRM) {
  console.error(
    `Refusing: set CHAT_SUPERVISION_MIGRATE_CONFIRM=${CONFIRM} after explicit authorization in chat.`,
  );
  process.exit(2);
}

if (!projectRef) {
  console.error(
    `Refusing: set CHAT_SUPERVISION_MIGRATE_TARGET=prod|preview (got "${targetKey || ''}").`,
  );
  process.exit(2);
}

if (targetKey === 'preview') {
  console.error(
    'Refusing preview: schema lacks comercio_members / membership helpers. Use prod for Trueno pilot.',
  );
  process.exit(2);
}

if (!existsSync(migrationPath)) {
  console.error('Migration file missing:', migrationPath);
  process.exit(1);
}

const sql = readFileSync(migrationPath, 'utf8');
const realtimeSql = `
do $$
begin
  begin
    alter publication supabase_realtime add table public.chat_conversations;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.chat_messages;
  exception when duplicate_object then null;
  end;
end $$;
`;

console.log(`Applying chat supervision migration to ${targetKey} (${projectRef})…`);

function runQuery(query, label) {
  const r = spawnSync(
    'npx',
    ['supabase', 'db', 'query', `--remote=${projectRef}`, '-o', 'json', query],
    { cwd: root, encoding: 'utf8', shell: true },
  );
  if (r.status !== 0) {
    console.error(label, 'failed');
    console.error(r.stdout || '');
    console.error(r.stderr || '');
    process.exit(r.status || 1);
  }
  console.log(label, 'ok');
  return r.stdout;
}

runQuery(sql, 'migration');
runQuery(realtimeSql, 'realtime_publication');
runQuery(
  `select to_regclass('public.chat_conversations') as chat_conversations,
          to_regclass('public.chat_messages') as chat_messages,
          to_regclass('public.chat_supervision_events') as events,
          exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                 where n.nspname='public' and p.proname='chat_take_conversation') as take_rpc;`,
  'verify',
);

console.log(`
Next (still requires separate authorization / deploy):
  CHAT_SUPERVISION_ENABLED=1
  CHAT_SUPERVISION_WASENDER=1
  CHAT_SUPERVISION_HUMAN_TAKEOVER=1
  CHAT_SUPERVISION_COMMERCE_IDS=0aa8c53b-07f1-446e-8b88-66c2b7ae89ea
  # unset CHAT_SUPERVISION_MEMORY and E2E bearer vars
`);
