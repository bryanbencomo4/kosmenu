/**
 * Push chatbot production env to Vercel (non-interactive).
 * Reads GEMINI_API_KEY from .env.local; never prints secret values.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function loadEnv(path) {
  if (!existsSync(path)) return {};
  const out = {};
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

const local = loadEnv(join(root, '.env.local'));
const gemini = (local.GEMINI_API_KEY || '').trim();
if (!gemini) {
  console.error('GEMINI_API_KEY missing in .env.local');
  process.exit(1);
}

const TRUENO = '0aa8c53b-07f1-446e-8b88-66c2b7ae89ea';

/** @type {Record<string, string>} */
const vars = {
  CHATBOT_ENABLED: '1',
  CHATBOT_ALLOW_PRODUCTION: '1',
  CHATBOT_SIMULATE_GEMINI: '0',
  CHATBOT_STAGING_MODE: '0',
  CHATBOT_BLOCK_ORDERS: '0',
  CHATBOT_MEDIA_LIVE: '1',
  CHATBOT_VOICE_STT: '1',
  CHATBOT_IMAGE_ANALYSIS: '1',
  CHATBOT_QUOTA_BACKEND: 'postgres',
  CHATBOT_ALLOWED_COMMERCE_IDS: TRUENO,
  CHATBOT_GEMINI_MODEL: 'gemini-3.1-flash-lite',
  CHATBOT_GEMINI_MODEL_FALLBACK: 'gemini-2.5-flash-lite',
  CHATBOT_MAX_TOOL_ROUNDS: '4',
  CHATBOT_MAX_OUTPUT_TOKENS: '256',
  CHATBOT_RATE_LIMIT_PER_IP_PER_MIN: '20',
  CHATBOT_MAX_REQUESTS_PER_SESSION: '40',
  CHATBOT_MAX_MONTHLY_REQUESTS_PER_COMMERCE: '500',
  CHATBOT_MAX_MONTHLY_TOKENS_PER_COMMERCE: '2000000',
  NEXT_PUBLIC_CHATBOT_PREVIEW: '1',
  // Product chat cues (efecto pack) enabled for Trueno UX.
  NEXT_PUBLIC_CHATBOT_SOUNDS_LICENSED: '1',
  GEMINI_API_KEY: gemini,
};

function upsert(name, value) {
  // Remove existing production value if present (ignore failures).
  spawnSync('npx', ['vercel', 'env', 'rm', name, 'production', '-y'], {
    cwd: root,
    encoding: 'utf8',
    shell: true,
  });
  const r = spawnSync(
    'npx',
    ['vercel', 'env', 'add', name, 'production'],
    {
      cwd: root,
      encoding: 'utf8',
      shell: true,
      input: `${value}\n`,
    },
  );
  const ok = r.status === 0;
  console.log(
    JSON.stringify({
      name,
      ok,
      status: r.status,
      // Never echo value
      err: ok ? null : (r.stderr || r.stdout || '').slice(0, 200),
    }),
  );
  return ok;
}

let failed = 0;
for (const [name, value] of Object.entries(vars)) {
  if (!upsert(name, value)) failed += 1;
}
console.log(JSON.stringify({ done: true, failed, total: Object.keys(vars).length }));
process.exit(failed ? 1 : 0);
