#!/usr/bin/env node
/**
 * Apply ONLY wa_handoff_codes (+ redeem RPC) to production Supabase.
 *
 *   $env:CONFIRM_WA_HANDOFF_PROD_SCHEMA='I_AUTHORIZE_WA_HANDOFF_PROD_SCHEMA'
 *   $env:CONFIRM_WA_HANDOFF_BACKUP_OK='1'
 *   node site/scripts/apply-wa-handoff-prod-schema.mjs
 */
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PROD = 'qqhberaayhohxlbbhdyi';
const PREVIEW = 'gsfxqzvmyzjjgpigrste';
const CONFIRM = 'I_AUTHORIZE_WA_HANDOFF_PROD_SCHEMA';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');
const sqlPath = path.join(root, 'supabase/migrations/20261124060000_wa_handoff_codes.sql');

if ((process.env.CONFIRM_WA_HANDOFF_PROD_SCHEMA || '').trim() !== CONFIRM) {
  console.error(`Refused: set CONFIRM_WA_HANDOFF_PROD_SCHEMA=${CONFIRM}`);
  process.exit(1);
}
if ((process.env.CONFIRM_WA_HANDOFF_BACKUP_OK || '').trim() !== '1') {
  console.error('Refused: set CONFIRM_WA_HANDOFF_BACKUP_OK=1 after verifying a current backup.');
  process.exit(1);
}

const ref = (process.env.PLATFORM_WA_PROD_PROJECT_REF || PROD).trim();
if (ref !== PROD || ref.includes(PREVIEW)) {
  console.error(`Refused: project-ref must be exactly ${PROD}`);
  process.exit(1);
}

const backupsDir = path.join(root, 'backups');
if (!existsSync(backupsDir) || readdirSync(backupsDir).filter((f) => !f.startsWith('.')).length === 0) {
  console.error('Refused: backups/ missing or empty.');
  process.exit(1);
}
console.log('Backup check: backups/ present (operator confirmed OK).');

const sql = readFileSync(sqlPath, 'utf8');
const sqlNoComments = sql.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
if (
  /\b(wasender_message_queue|chat_supervision|chat_conversations|pedidos|productos|comercios|discovery_|wa_entry_|wa_master_)\b/i.test(
    sqlNoComments,
  )
) {
  console.error('Refused: SQL references unrelated production tables.');
  process.exit(1);
}
if (/\bdrop\s+table\b/i.test(sqlNoComments)) {
  console.error('Refused: unexpected DROP TABLE.');
  process.exit(1);
}
if (!/\bwa_handoff_codes\b/.test(sql) || !/\bwa_handoff_redeem\b/.test(sql)) {
  console.error('Refused: expected wa_handoff objects missing.');
  process.exit(1);
}

const preflightSql = `
select
  to_regclass('public.pedidos') as pedidos,
  to_regclass('public.productos') as productos,
  to_regclass('public.comercios') as comercios,
  to_regclass('public.wa_handoff_codes') as wa_handoff_before;
`;

const verifySql = `
select
  to_regclass('public.wa_handoff_codes') as wa_handoff_codes,
  to_regclass('public.pedidos') as pedidos_unchanged,
  to_regclass('public.productos') as productos_unchanged,
  to_regclass('public.comercios') as comercios_unchanged,
  exists(
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'wa_handoff_redeem'
  ) as redeem_rpc,
  (select relrowsecurity from pg_class where oid = 'public.wa_handoff_codes'::regclass) as rls_on;
`;

function runQuery(sqlText, label) {
  const dir = mkdtempSync(path.join(tmpdir(), 'wa-handoff-prod-'));
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

console.log(`Preflight production ${ref}`);
runQuery(preflightSql, 'preflight');
console.log(`Applying ONLY wa_handoff schema to production ${ref}`);
runQuery(sql, 'schema_apply');
runQuery(verifySql, 'schema_verify');
console.log('OK: wa_handoff production schema applied. Core commerce tables untouched.');
