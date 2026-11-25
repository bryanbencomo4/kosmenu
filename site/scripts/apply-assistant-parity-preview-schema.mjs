#!/usr/bin/env node
/**
 * Apply assistant parity Preview schema ONLY to kosmenu-preview.
 * Refuses production. Requires CONFIRM_ASSISTANT_PARITY_PREVIEW=1.
 *
 * Applies:
 *   supabase/preview-bootstrap/16-upsell-engine-preview.sql
 *   supabase/preview-bootstrap/17-staff-invites-preview.sql
 *
 * Usage (repo root):
 *   $env:CONFIRM_ASSISTANT_PARITY_PREVIEW='1'
 *   node site/scripts/apply-assistant-parity-preview-schema.mjs
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
const files = [
  path.join(root, 'supabase/preview-bootstrap/16-upsell-engine-preview.sql'),
  path.join(root, 'supabase/preview-bootstrap/17-staff-invites-preview.sql'),
];

if (process.env.CONFIRM_ASSISTANT_PARITY_PREVIEW !== '1') {
  console.error('Refused: set CONFIRM_ASSISTANT_PARITY_PREVIEW=1 to apply Preview schema.');
  process.exit(1);
}

const ref = (process.env.PLATFORM_WA_PREVIEW_PROJECT_REF || PREVIEW).trim();
if (ref === PROD || ref.includes(PROD) || ref !== PREVIEW) {
  console.error(`Refused: project-ref must be exactly ${PREVIEW} (got ${ref}).`);
  process.exit(1);
}

function runQuery(sqlText, label) {
  const dir = mkdtempSync(path.join(tmpdir(), 'assistant-parity-preview-'));
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

for (const sqlPath of files) {
  const sql = readFileSync(sqlPath, 'utf8');
  if (!sql.includes('PREVIEW BOOTSTRAP ONLY')) {
    console.error('Refused: SQL missing Preview guard header:', sqlPath);
    process.exit(1);
  }
  if (/\bdrop\s+table\b/i.test(sql)) {
    console.error('Refused: unexpected DROP TABLE in', sqlPath);
    process.exit(1);
  }
  console.log(`Applying ${path.basename(sqlPath)} → Preview ${ref}`);
  runQuery(sql, path.basename(sqlPath));
}

runQuery(
  `
select
  to_regclass('public.upsell_settings') as upsell_settings,
  to_regclass('public.upsell_rules') as upsell_rules,
  to_regclass('public.upsell_rule_targets') as upsell_rule_targets,
  to_regclass('public.bundles') as bundles,
  to_regclass('public.comercio_member_invites') as comercio_member_invites;
`,
  'schema_verify',
);

console.log('OK: assistant parity Preview schema applied. Production untouched.');
