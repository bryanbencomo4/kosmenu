#!/usr/bin/env node
/**
 * Apply ONLY wa-entry router schema to production Supabase.
 * Refuses unless CONFIRM_WA_ENTRY_PROD_SCHEMA=I_AUTHORIZE_WA_ENTRY_PROD_SCHEMA.
 *
 * Usage (repo root):
 *   $env:CONFIRM_WA_ENTRY_PROD_SCHEMA='I_AUTHORIZE_WA_ENTRY_PROD_SCHEMA'
 *   node site/scripts/apply-wa-entry-prod-schema.mjs
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PROD = 'qqhberaayhohxlbbhdyi';
const PREVIEW = 'gsfxqzvmyzjjgpigrste';
const CONFIRM = 'I_AUTHORIZE_WA_ENTRY_PROD_SCHEMA';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');
const sqlPath = path.join(
  root,
  'supabase/migrations/20261124013000_wa_entry_router.sql',
);

if ((process.env.CONFIRM_WA_ENTRY_PROD_SCHEMA || '').trim() !== CONFIRM) {
  console.error(`Refused: set CONFIRM_WA_ENTRY_PROD_SCHEMA=${CONFIRM}`);
  process.exit(1);
}

const ref = (process.env.PLATFORM_WA_PROD_PROJECT_REF || PROD).trim();
if (ref !== PROD || ref.includes(PREVIEW)) {
  console.error(`Refused: project-ref must be exactly ${PROD} (got ${ref}).`);
  process.exit(1);
}

const sql = readFileSync(sqlPath, 'utf8');
const sqlNoComments = sql
  .replace(/--[^\n]*/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '');
if (
  /\b(wasender_message_queue|chat_supervision|chat_conversations|pedidos|discovery_)\b/i.test(
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

const verifySql = `
select
  to_regclass('public.wa_entry_threads') as wa_entry_threads,
  to_regclass('public.wa_entry_seen_messages') as wa_entry_seen_messages,
  to_regclass('public.wa_entry_outbound') as wa_entry_outbound,
  to_regclass('public.wa_entry_send_locks') as wa_entry_send_locks,
  exists(
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'wa_entry_try_claim_message'
  ) as claim_rpc,
  exists(
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'wa_entry_match_bot_echo'
  ) as echo_rpc;
`;

function runQuery(sqlText, label) {
  const dir = mkdtempSync(path.join(tmpdir(), 'wa-entry-prod-'));
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

console.log(`Applying ONLY wa-entry router schema to production ${ref}`);
runQuery(sql, 'schema_apply');
runQuery(verifySql, 'schema_verify');
console.log('OK: wa-entry production schema applied. No other tables modified.');
