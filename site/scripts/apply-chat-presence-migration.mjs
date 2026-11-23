/**
 * Apply chat presence/read-receipt columns — AUTHORIZATION GATED.
 *
 * Additive only (4 columns on chat_conversations). Idempotent.
 *
 *   $env:CHAT_PRESENCE_MIGRATE_CONFIRM='I_AUTHORIZE_CHAT_PRESENCE_MIGRATION'
 *   $env:CHAT_PRESENCE_MIGRATE_TARGET='prod'
 *   node site/scripts/apply-chat-presence-migration.mjs
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const CONFIRM = 'I_AUTHORIZE_CHAT_PRESENCE_MIGRATION';
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
  '20261123120000_chat_presence_read_receipts.sql',
);

const confirm = (process.env.CHAT_PRESENCE_MIGRATE_CONFIRM || '').trim();
const targetKey = (process.env.CHAT_PRESENCE_MIGRATE_TARGET || '').trim().toLowerCase();
const projectRef = TARGETS[targetKey];

if (confirm !== CONFIRM) {
  console.error(
    `Refusing: set CHAT_PRESENCE_MIGRATE_CONFIRM=${CONFIRM}`,
  );
  process.exit(2);
}

if (!projectRef) {
  console.error(
    `Refusing: set CHAT_PRESENCE_MIGRATE_TARGET=prod|preview (got "${targetKey || ''}").`,
  );
  process.exit(2);
}

if (!existsSync(migrationPath)) {
  console.error('Migration file missing:', migrationPath);
  process.exit(1);
}

const sql = readFileSync(migrationPath, 'utf8');

const preflightSql = `
select
  to_regclass('public.chat_conversations') as chat_conversations,
  (select count(*)::int from public.chat_conversations) as conversation_count;
`;

const verifySql = `
select
  exists(select 1 from information_schema.columns
    where table_schema='public' and table_name='chat_conversations'
      and column_name='consumer_typing_until') as has_consumer_typing,
  exists(select 1 from information_schema.columns
    where table_schema='public' and table_name='chat_conversations'
      and column_name='staff_typing_until') as has_staff_typing,
  exists(select 1 from information_schema.columns
    where table_schema='public' and table_name='chat_conversations'
      and column_name='consumer_last_read_seq') as has_consumer_read,
  exists(select 1 from information_schema.columns
    where table_schema='public' and table_name='chat_conversations'
      and column_name='staff_last_read_seq') as has_staff_read,
  (select count(*)::int from public.chat_conversations) as conversation_count,
  (select coalesce(min(consumer_last_read_seq),0)::int from public.chat_conversations) as min_consumer_read,
  (select coalesce(min(staff_last_read_seq),0)::int from public.chat_conversations) as min_staff_read;
`;

function runQueryFile(sqlText, label) {
  const dir = mkdtempSync(join(tmpdir(), 'chat-presence-migrate-'));
  const file = join(dir, 'q.sql');
  writeFileSync(file, sqlText, 'utf8');
  try {
    const r = spawnSync(
      'npx',
      [
        'supabase',
        'db',
        'query',
        `--remote=${projectRef}`,
        '--yes',
        '-o',
        'json',
        '-f',
        file,
      ],
      { cwd: root, encoding: 'utf8', shell: true },
    );
    if (r.status !== 0) {
      console.error(label, 'failed');
      console.error(r.stdout || '');
      console.error(r.stderr || '');
      process.exit(r.status || 1);
    }
    console.log(label, 'ok');
    if ((r.stdout || '').trim()) console.log(r.stdout.trim());
    return r.stdout;
  } finally {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}

console.log(`Applying chat presence migration to ${targetKey} (${projectRef})…`);
runQueryFile(preflightSql, 'preflight');
runQueryFile(sql, 'migration');
runQueryFile(verifySql, 'verify');
console.log('Done. Additive columns are live; no app deploy required for schema.');
