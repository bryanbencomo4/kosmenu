#!/usr/bin/env node
/**
 * Apply wa-master Preview schema ONLY to kosmenu-preview.
 * Refuses production. Requires CONFIRM_WA_MASTER_PREVIEW=1.
 *
 * Usage (repo root):
 *   $env:CONFIRM_WA_MASTER_PREVIEW='1'
 *   node site/scripts/apply-wa-master-preview-schema.mjs
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
const sqlPath = path.join(root, 'supabase/preview-bootstrap/13-wa-master-assistant.sql');

if (process.env.CONFIRM_WA_MASTER_PREVIEW !== '1') {
  console.error('Refused: set CONFIRM_WA_MASTER_PREVIEW=1 to apply Preview schema.');
  process.exit(1);
}

const ref = (process.env.PLATFORM_WA_PREVIEW_PROJECT_REF || PREVIEW).trim();
if (ref === PROD || ref.includes(PROD) || ref !== PREVIEW) {
  console.error(`Refused: project-ref must be exactly ${PREVIEW} (got ${ref}).`);
  process.exit(1);
}

const sql = readFileSync(sqlPath, 'utf8');
if (!sql.includes('PREVIEW BOOTSTRAP ONLY')) {
  console.error('Refused: SQL missing Preview guard header.');
  process.exit(1);
}
const sqlNoComments = sql
  .replace(/--[^\n]*/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '');
if (
  /\b(wasender_message_queue|chat_supervision|chat_conversations|pedidos|productos)\b/i.test(
    sqlNoComments,
  )
) {
  console.error('Refused: SQL body references unrelated production tables.');
  process.exit(1);
}
if (/\bdrop\s+table\b/i.test(sql)) {
  console.error('Refused: unexpected DROP TABLE.');
  process.exit(1);
}

const verifySql = `
select
  to_regclass('public.wa_master_profiles') as wa_master_profiles,
  to_regclass('public.wa_master_threads') as wa_master_threads,
  to_regclass('public.wa_master_turns') as wa_master_turns,
  to_regclass('public.wa_master_quota') as wa_master_quota,
  to_regclass('public.wa_master_quota_ledger') as wa_master_quota_ledger;
`;

function runQuery(sqlText, label) {
  const dir = mkdtempSync(path.join(tmpdir(), 'wa-master-preview-'));
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

console.log(`Pre-check: applying ONLY wa-master schema to Preview ${ref}`);
runQuery(sql, 'schema_apply');
runQuery(verifySql, 'schema_verify');
console.log('OK: wa-master Preview schema applied. Production untouched.');
