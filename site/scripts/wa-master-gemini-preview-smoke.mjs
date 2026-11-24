#!/usr/bin/env node
/**
 * Preview-only Master Gemini smoke wrapper (≤10 billable HTTP).
 * Usage (repo root):
 *   node site/scripts/wa-master-gemini-preview-smoke.mjs
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const site = path.resolve(__dirname, '..');

const r = spawnSync(
  'npx',
  ['tsx', path.join(__dirname, 'wa-master-gemini-preview-smoke-run.ts')],
  {
    cwd: site,
    encoding: 'utf8',
    shell: true,
    env: {
      ...process.env,
      PLATFORM_WA_MASTER_ALLOW_GEMINI: '1',
      PLATFORM_WA_MASTER_SIMULATE: '0',
      PLATFORM_WA_MASTER_MAX_MONTHLY_REQUESTS: '10',
      PLATFORM_WA_MASTER_MAX_GEMINI_HTTP_PER_TURN: '2',
      WA_MASTER_SMOKE_MAX_HTTP: '10',
    },
  },
);
process.stdout.write(r.stdout || '');
process.stderr.write(r.stderr || '');
process.exit(r.status || 0);
