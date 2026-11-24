#!/usr/bin/env node
/**
 * Apply wa_handoff_codes Preview schema ONLY.
 * Usage: CONFIRM_WA_HANDOFF_PREVIEW=1 node site/scripts/apply-wa-handoff-preview-schema.mjs
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
const sqlPath = path.join(root, 'supabase/preview-bootstrap/14-wa-handoff-codes.sql');

if (process.env.CONFIRM_WA_HANDOFF_PREVIEW !== '1') {
  console.error('Refused: set CONFIRM_WA_HANDOFF_PREVIEW=1');
  process.exit(1);
}
const ref = (process.env.PLATFORM_WA_PREVIEW_PROJECT_REF || PREVIEW).trim();
if (ref !== PREVIEW || ref.includes(PROD)) {
  console.error(`Refused: preview ref must be ${PREVIEW}`);
  process.exit(1);
}
const sql = readFileSync(sqlPath, 'utf8');
if (!sql.includes('PREVIEW BOOTSTRAP ONLY')) {
  console.error('Refused: missing Preview guard');
  process.exit(1);
}

function runQuery(sqlText, label) {
  const dir = mkdtempSync(path.join(tmpdir(), 'wa-handoff-'));
  const file = path.join(dir, 'q.sql');
  writeFileSync(file, sqlText, 'utf8');
  try {
    const r = spawnSync(
      'npx',
      ['supabase', 'db', 'query', `--remote=${ref}`, '--yes', '-o', 'json', '-f', file],
      { cwd: root, encoding: 'utf8', shell: true },
    );
    if (r.status !== 0) {
      console.error(label, 'failed', r.stderr || r.stdout);
      process.exit(r.status || 1);
    }
    console.log(label, 'ok');
    if ((r.stdout || '').trim()) console.log(r.stdout.trim());
  } finally {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}

runQuery(sql, 'schema_apply');
runQuery(
  `select to_regclass('public.wa_handoff_codes') as wa_handoff_codes,
   exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
     where n.nspname='public' and p.proname='wa_handoff_redeem') as redeem_rpc;`,
  'schema_verify',
);
console.log('OK: wa_handoff Preview schema applied. Production untouched.');
