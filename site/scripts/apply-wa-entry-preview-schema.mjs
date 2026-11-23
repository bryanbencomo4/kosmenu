#!/usr/bin/env node
/**
 * Apply wa-entry Preview schema ONLY to kosmenu-preview.
 * Refuses production. Does not run unless CONFIRM_WA_ENTRY_PREVIEW=1.
 *
 * Usage:
 *   CONFIRM_WA_ENTRY_PREVIEW=1 node site/scripts/apply-wa-entry-preview-schema.mjs
 *
 * Requires: npx supabase CLI logged in, or DATABASE_URL for Preview.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const PREVIEW = 'gsfxqzvmyzjjgpigrste';
const PROD = 'qqhberaayhohxlbbhdyi';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');
const sqlPath = path.join(root, 'supabase/preview-bootstrap/12-wa-entry-router.sql');

if (process.env.CONFIRM_WA_ENTRY_PREVIEW !== '1') {
  console.error('Refused: set CONFIRM_WA_ENTRY_PREVIEW=1 to apply Preview schema.');
  process.exit(1);
}

const ref = (process.env.PLATFORM_WA_PREVIEW_PROJECT_REF || PREVIEW).trim();
if (ref === PROD || ref.includes(PROD)) {
  console.error('Refused: production project ref.');
  process.exit(1);
}

const sql = readFileSync(sqlPath, 'utf8');
if (!sql.includes('PREVIEW BOOTSTRAP ONLY')) {
  console.error('Refused: SQL missing Preview guard header.');
  process.exit(1);
}

console.log(`Applying ${sqlPath} to project-ref=${ref} …`);
const result = spawnSync(
  'npx',
  ['supabase', 'db', 'query', `--project-ref=${ref}`, '-f', sqlPath],
  { cwd: root, stdio: 'inherit', shell: true },
);

if (result.status !== 0) {
  console.error('Apply failed. You may need to pipe SQL manually against Preview only.');
  process.exit(result.status || 1);
}

console.log('OK: wa-entry Preview schema applied (not production).');
