/**
 * Start Next.js on port 3001 with .env.staging.local loaded into process.env.
 */
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = join(root, '.env.staging.local');
if (!existsSync(envPath)) {
  console.error('Run scripts/_write-staging-env.mjs first');
  process.exit(1);
}

function loadEnv(path) {
  const out = { ...process.env };
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i <= 0) continue;
    let v = t.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    out[t.slice(0, i).trim()] = v;
  }
  return out;
}

const env = loadEnv(envPath);
env.PORT = '3001';
env.CHATBOT_STAGING_MODE = '1';
env.CHATBOT_BLOCK_ORDERS = '1';
env.CHATBOT_SIMULATE_GEMINI = '0';

console.log(
  JSON.stringify({
    starting: true,
    port: 3001,
    staging: env.CHATBOT_STAGING_MODE,
    simulate: env.CHATBOT_SIMULATE_GEMINI,
    mediaLive: env.CHATBOT_MEDIA_LIVE,
    maxCalls: env.CHATBOT_LIVE_MAX_GEMINI_CALLS,
    maxCost: env.CHATBOT_LIVE_MAX_COST_USD,
  }),
);

const child = spawn(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['next', 'dev', '-p', '3001', '-H', '127.0.0.1'],
  {
    cwd: root,
    env,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  },
);

child.on('exit', (code) => process.exit(code ?? 1));
