#!/usr/bin/env node
/**
 * Apply platform inbox + support tickets schema ONLY to kosmenu-preview.
 * Refuses production. Requires CONFIRM_WA_PLATFORM_INBOX_PREVIEW=1.
 *
 *   $env:CONFIRM_WA_PLATFORM_INBOX_PREVIEW='1'
 *   node site/scripts/apply-wa-platform-inbox-preview-schema.mjs
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PREVIEW = 'gsfxqzvmyzjjgpigrste';
const PROD = 'qqhberaayhohxlbbhdyi';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');
const sqlPath = path.join(root, 'supabase/preview-bootstrap/15-wa-platform-inbox-tickets.sql');

if (process.env.CONFIRM_WA_PLATFORM_INBOX_PREVIEW !== '1') {
  console.error('Refused: set CONFIRM_WA_PLATFORM_INBOX_PREVIEW=1');
  process.exit(1);
}

const ref = (process.env.PLATFORM_WA_PREVIEW_PROJECT_REF || PREVIEW).trim();
if (ref !== PREVIEW || ref.includes(PROD)) {
  console.error(`Refused: preview ref must be ${PREVIEW} (got ${ref})`);
  process.exit(1);
}

const sql = readFileSync(sqlPath, 'utf8');
if (!sql.includes('PREVIEW BOOTSTRAP ONLY')) {
  console.error('Refused: missing Preview guard');
  process.exit(1);
}
const sqlNoComments = sql.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
if (
  /\b(wasender_message_queue|chat_supervision|chat_conversations|pedidos|productos)\b/i.test(
    sqlNoComments,
  )
) {
  console.error('Refused: SQL references unrelated tables');
  process.exit(1);
}
if (/\bdrop\s+table\b/i.test(sql)) {
  console.error('Refused: DROP TABLE not allowed');
  process.exit(1);
}

function runQuery(sqlText, label) {
  const dir = mkdtempSync(path.join(tmpdir(), 'wa-inbox-preview-'));
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

const verifySql = `
select
  to_regclass('public.wa_platform_inbox_conversations') as conversations,
  to_regclass('public.wa_platform_inbox_messages') as messages,
  to_regclass('public.wa_platform_support_tickets') as tickets,
  to_regclass('public.wa_entry_threads') as wa_entry_threads_untouched,
  (select count(*) from pg_tables where schemaname='public' and tablename='pedidos') as pedidos_table_exists;
`;

const smokeSql = `
-- Insert + read smoke (rolled back via delete). No touch of wa_entry_threads.
insert into public.wa_platform_inbox_conversations (
  from_digits, status, last_message_text, last_message_at_ms, unread_count,
  attention_version, context_role, context_note, updated_at_ms
) values (
  '580000000001', 'needs_attention', 'smoke', 1, 1, 0, 'support_human', 'smoke note', 1
)
on conflict (from_digits) do update set
  status = excluded.status,
  context_note = excluded.context_note,
  updated_at_ms = excluded.updated_at_ms;

insert into public.wa_platform_support_tickets (
  id, from_digits, text, context, status, created_at_ms, notified, notify_error, updated_at_ms
) values (
  'sup_preview_smoke', '580000000001', '9', 'preview_smoke', 'pending', 1, true, null, 1
)
on conflict (id) do update set updated_at_ms = excluded.updated_at_ms;

select id, from_digits, status from public.wa_platform_support_tickets where id = 'sup_preview_smoke';

delete from public.wa_platform_support_tickets where id = 'sup_preview_smoke';
delete from public.wa_platform_inbox_conversations where from_digits = '580000000001';
`;

console.log(`Applying inbox+tickets schema to Preview ${ref} (prod untouched)`);
runQuery(sql, 'schema_apply');
runQuery(verifySql, 'schema_verify');
runQuery(smokeSql, 'schema_smoke');
console.log('OK: wa_platform_inbox Preview schema applied + smoked. Production untouched.');
