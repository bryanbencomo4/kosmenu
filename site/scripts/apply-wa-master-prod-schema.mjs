#!/usr/bin/env node
/**
 * Apply ONLY wa_master_* schema to production Supabase.
 * Requires backup check + explicit confirm.
 *
 * Usage (repo root):
 *   $env:CONFIRM_WA_MASTER_PROD_SCHEMA='I_AUTHORIZE_WA_MASTER_PROD_SCHEMA'
 *   $env:CONFIRM_WA_MASTER_BACKUP_OK='1'
 *   node site/scripts/apply-wa-master-prod-schema.mjs
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PROD = 'qqhberaayhohxlbbhdyi';
const PREVIEW = 'gsfxqzvmyzjjgpigrste';
const CONFIRM = 'I_AUTHORIZE_WA_MASTER_PROD_SCHEMA';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');
const sqlPath = path.join(
  root,
  'supabase/migrations/20261124040000_wa_master_assistant.sql',
);

if ((process.env.CONFIRM_WA_MASTER_PROD_SCHEMA || '').trim() !== CONFIRM) {
  console.error(`Refused: set CONFIRM_WA_MASTER_PROD_SCHEMA=${CONFIRM}`);
  process.exit(1);
}
if ((process.env.CONFIRM_WA_MASTER_BACKUP_OK || '').trim() !== '1') {
  console.error('Refused: set CONFIRM_WA_MASTER_BACKUP_OK=1 after verifying a current backup.');
  process.exit(1);
}

const ref = (process.env.PLATFORM_WA_PROD_PROJECT_REF || PROD).trim();
if (ref !== PROD || ref.includes(PREVIEW)) {
  console.error(`Refused: project-ref must be exactly ${PROD} (got ${ref}).`);
  process.exit(1);
}

const backupsDir = path.join(root, 'backups');
if (!existsSync(backupsDir)) {
  console.error('Refused: backups/ directory missing — create a current backup first.');
  process.exit(1);
}
const recent = readdirSync(backupsDir).filter((f) => !f.startsWith('.'));
if (!recent.length) {
  console.error('Refused: backups/ is empty — verify a current backup exists.');
  process.exit(1);
}
console.log(`Backup check: found ${recent.length} file(s) in backups/ (operator confirmed OK).`);

const sql = readFileSync(sqlPath, 'utf8');
const sqlNoComments = sql
  .replace(/--[^\n]*/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '');
if (
  /\b(wasender_message_queue|chat_supervision|chat_conversations|pedidos|discovery_|wa_entry_)\b/i.test(
    sqlNoComments,
  )
) {
  console.error('Refused: SQL body references unrelated production tables.');
  process.exit(1);
}
if (/\bdrop\s+table\b/i.test(sqlNoComments)) {
  console.error('Refused: unexpected DROP TABLE.');
  process.exit(1);
}
if (!/\bwa_master_profiles\b/.test(sql) || !/\bwa_master_quota_reserve\b/.test(sql)) {
  console.error('Refused: expected wa_master objects missing from SQL.');
  process.exit(1);
}

const preflightSql = `
select
  to_regclass('public.wa_entry_threads') as wa_entry_threads,
  to_regclass('public.wa_master_profiles') as wa_master_profiles_before;
`;

const verifySql = `
select
  to_regclass('public.wa_master_profiles') as wa_master_profiles,
  to_regclass('public.wa_master_threads') as wa_master_threads,
  to_regclass('public.wa_master_turns') as wa_master_turns,
  to_regclass('public.wa_master_quota') as wa_master_quota,
  to_regclass('public.wa_master_quota_ledger') as wa_master_quota_ledger,
  to_regclass('public.wa_entry_threads') as wa_entry_threads_unchanged,
  exists(
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'wa_master_quota_reserve'
  ) as quota_reserve_rpc,
  exists(
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'wa_master_quota_record_tokens'
  ) as quota_record_rpc;
`;

function runQuery(sqlText, label) {
  const dir = mkdtempSync(path.join(tmpdir(), 'wa-master-prod-'));
  const file = path.join(dir, 'q.sql');
  writeFileSync(file, sqlText, 'utf8');
  try {
    const r = spawnSync(
      'npx',
      [
        'supabase',
        'db',
        'query',
        `--remote=${ref}`,
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

console.log(`Preflight production ${ref}`);
runQuery(preflightSql, 'preflight');
console.log(`Applying ONLY wa_master schema to production ${ref}`);
runQuery(sql, 'schema_apply');
runQuery(verifySql, 'schema_verify');
console.log('OK: wa_master production schema applied. wa_entry_* untouched.');
