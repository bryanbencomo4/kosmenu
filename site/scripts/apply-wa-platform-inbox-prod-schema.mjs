#!/usr/bin/env node
/**
 * Apply ONLY wa_platform_* inbox+tickets schema to production.
 * Requires explicit auth + verified backup.
 *
 *   $env:CONFIRM_WA_PLATFORM_INBOX_PROD_SCHEMA='I_AUTHORIZE_WA_PLATFORM_INBOX_PROD_SCHEMA'
 *   $env:CONFIRM_WA_PLATFORM_INBOX_BACKUP_OK='1'
 *   node site/scripts/apply-wa-platform-inbox-prod-schema.mjs
 */
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PROD = 'qqhberaayhohxlbbhdyi';
const PREVIEW = 'gsfxqzvmyzjjgpigrste';
const CONFIRM = 'I_AUTHORIZE_WA_PLATFORM_INBOX_PROD_SCHEMA';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');
const sqlPath = path.join(
  root,
  'supabase/migrations/20261124130000_wa_platform_inbox_tickets.sql',
);
const previewTwin = path.join(
  root,
  'supabase/preview-bootstrap/15-wa-platform-inbox-tickets.sql',
);

if ((process.env.CONFIRM_WA_PLATFORM_INBOX_PROD_SCHEMA || '').trim() !== CONFIRM) {
  console.error(`Refused: set CONFIRM_WA_PLATFORM_INBOX_PROD_SCHEMA=${CONFIRM}`);
  process.exit(1);
}
if ((process.env.CONFIRM_WA_PLATFORM_INBOX_BACKUP_OK || '').trim() !== '1') {
  console.error(
    'Refused: set CONFIRM_WA_PLATFORM_INBOX_BACKUP_OK=1 after verifying a current backup.',
  );
  process.exit(1);
}

const ref = (process.env.PLATFORM_WA_PROD_PROJECT_REF || PROD).trim();
if (ref !== PROD || ref.includes(PREVIEW)) {
  console.error(`Refused: project-ref must be exactly ${PROD} (got ${ref}).`);
  process.exit(1);
}

const backupsDir = path.join(root, 'backups');
if (!existsSync(backupsDir)) {
  console.error('Refused: backups/ directory missing.');
  process.exit(1);
}
const recent = readdirSync(backupsDir).filter((f) => !f.startsWith('.'));
if (!recent.length) {
  console.error('Refused: backups/ empty — record a usable backup first.');
  process.exit(1);
}
console.log(`Backup check: ${recent.length} artifact(s) in backups/ (operator OK).`);

const sql = readFileSync(sqlPath, 'utf8');
const previewSql = readFileSync(previewTwin, 'utf8');
const strip = (s) =>
  s
    .replace(/--[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s+/g, ' ')
    .trim();
if (strip(sql) !== strip(previewSql)) {
  console.error('Refused: prod migration DDL ≠ Preview twin.');
  process.exit(1);
}
console.log('DDL identity: prod migration matches Preview twin.');

const sqlNoComments = sql.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
if (
  /\b(wasender_message_queue|chat_supervision|chat_conversations|pedidos|productos|discovery_)\b/i.test(
    sqlNoComments,
  )
) {
  console.error('Refused: SQL references unrelated tables.');
  process.exit(1);
}
if (/\bdrop\s+table\b/i.test(sqlNoComments)) {
  console.error('Refused: DROP TABLE not allowed.');
  process.exit(1);
}
if (
  !/\bwa_platform_inbox_conversations\b/.test(sql) ||
  !/\bwa_platform_support_tickets\b/.test(sql)
) {
  console.error('Refused: expected wa_platform_* objects missing.');
  process.exit(1);
}

function runQuery(sqlText, label) {
  const dir = mkdtempSync(path.join(tmpdir(), 'wa-inbox-prod-'));
  const file = path.join(dir, 'q.sql');
  writeFileSync(file, sqlText, 'utf8');
  try {
    const r = spawnSync(
      'npx',
      ['supabase', 'db', 'query', `--remote=${ref}`, '--yes', '-o', 'json', '-f', file],
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

const preflightSql = `
select
  to_regclass('public.wa_platform_support_tickets') as tickets_before,
  to_regclass('public.wa_entry_threads') as wa_entry_threads,
  to_regclass('public.pedidos') as pedidos,
  (select count(*) from public.pedidos) as pedidos_count;
`;

const verifySql = `
select
  to_regclass('public.wa_platform_inbox_conversations') as conversations,
  to_regclass('public.wa_platform_inbox_messages') as messages,
  to_regclass('public.wa_platform_support_tickets') as tickets,
  to_regclass('public.wa_entry_threads') as wa_entry_threads_untouched,
  to_regclass('public.pedidos') as pedidos_untouched,
  (select count(*) from public.pedidos) as pedidos_count,
  (select relrowsecurity from pg_class where oid = 'public.wa_platform_support_tickets'::regclass) as tickets_rls,
  (select count(*) from pg_indexes where schemaname='public' and tablename like 'wa_platform_%') as wa_platform_indexes,
  (select has_table_privilege('service_role', 'public.wa_platform_support_tickets', 'INSERT')) as service_role_insert,
  (select has_table_privilege('anon', 'public.wa_platform_support_tickets', 'SELECT')) as anon_select;
`;

const smokeSql = `
insert into public.wa_platform_inbox_conversations (
  from_digits, status, last_message_text, last_message_at_ms, unread_count,
  attention_version, context_role, context_note, updated_at_ms
) values (
  '580000000099', 'needs_attention', 'prod_smoke', 1, 1, 0, 'support_human', 'prod_smoke', 1
)
on conflict (from_digits) do update set updated_at_ms = excluded.updated_at_ms;

insert into public.wa_platform_support_tickets (
  id, from_digits, text, context, status, created_at_ms, notified, notify_error, updated_at_ms
) values (
  'sup_prod_migrate_smoke', '580000000099', '9', 'prod_migrate_smoke', 'pending', 1, true, null, 1
)
on conflict (id) do update set updated_at_ms = excluded.updated_at_ms;

select id, status from public.wa_platform_support_tickets where id = 'sup_prod_migrate_smoke';

delete from public.wa_platform_support_tickets where id = 'sup_prod_migrate_smoke';
delete from public.wa_platform_inbox_conversations where from_digits = '580000000099';
`;

console.log(`Applying wa_platform inbox+tickets to PROD ${ref}`);
runQuery(preflightSql, 'preflight');
runQuery(sql, 'schema_apply');
runQuery(verifySql, 'schema_verify');
runQuery(smokeSql, 'schema_smoke_rw');
console.log('OK: production wa_platform_* migration applied + verified.');
