/**
 * Set Vercel Preview-only env for Discovery Gemini test → Supabase Preview.
 * Never writes Production. Does not print secret values.
 *
 *   node site/scripts/_set-preview-discovery-env.mjs
 */
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const site = join(root, 'site');
const PREVIEW = 'gsfxqzvmyzjjgpigrste';
const PROD = 'qqhberaayhohxlbbhdyi';

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

const preview = {
  ...loadEnv(join(root, '.env.preview.local')),
  ...loadEnv(join(root, '.env.preview.keys')),
};

const pullPath = join(site, '.env.production.pull.tmp');
const pull = spawnSync(
  'npx',
  ['vercel', 'env', 'pull', pullPath, '--environment', 'production', '--yes'],
  { cwd: site, encoding: 'utf8', shell: true },
);
if (pull.status !== 0) {
  console.error('vercel env pull failed', pull.stderr || pull.stdout);
  process.exit(1);
}
const prod = loadEnv(pullPath);
unlinkSync(pullPath);

const sbUrl = (preview.NEXT_PUBLIC_SUPABASE_URL || preview.SUPABASE_URL || '').trim();
const anon = (
  preview.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  preview.SUPABASE_ANON_KEY ||
  ''
).trim();
const service = (preview.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const gemini = (prod.GEMINI_API_KEY || preview.GEMINI_API_KEY || '').trim();

if (!sbUrl.includes(PREVIEW) || sbUrl.includes(PROD)) {
  console.error('Refused: preview Supabase URL is not gsfxqzv');
  process.exit(2);
}
if (!anon || !service || !gemini) {
  console.error('Missing anon/service/gemini for Preview setup', {
    hasAnon: Boolean(anon),
    hasService: Boolean(service),
    hasGemini: Boolean(gemini),
  });
  process.exit(2);
}

const pairs = {
  NEXT_PUBLIC_SUPABASE_URL: sbUrl,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: anon,
  SUPABASE_SERVICE_ROLE_KEY: service,
  GEMINI_API_KEY: gemini,
  NEXT_PUBLIC_DISCOVERY_ASSISTANT: '1',
  DISCOVERY_ASSISTANT_ENABLED: '1',
  DISCOVERY_ASSISTANT_ALLOW_PRODUCTION: '1',
  DISCOVERY_ASSISTANT_ALLOW_GEMINI: '1',
  DISCOVERY_ASSISTANT_SIMULATE: '0',
  DISCOVERY_ASSISTANT_QUOTA_BACKEND: 'postgres',
  DISCOVERY_ASSISTANT_POSTGRES_QUOTA_READY: '1',
  DISCOVERY_ASSISTANT_MAX_REQUESTS_PER_SESSION: '15',
  DISCOVERY_ASSISTANT_MAX_MONTHLY_REQUESTS: '200',
  DISCOVERY_ASSISTANT_MAX_MONTHLY_TOKENS: '500000',
  DISCOVERY_ASSISTANT_MAX_TOOL_ROUNDS: '2',
  DISCOVERY_ASSISTANT_MAX_OUTPUT_TOKENS: '512',
  DISCOVERY_ASSISTANT_MAX_GEMINI_HTTP_CALLS: '3',
  DISCOVERY_ASSISTANT_GEMINI_HTTP_BUDGET: '15',
  DISCOVERY_ASSISTANT_RATE_LIMIT_PER_IP_PER_MIN: '15',
};

function setPreviewEnv(name, value) {
  const tmp = join(site, `.env.set.${name}.tmp`);
  writeFileSync(tmp, value, 'utf8');
  // Remove existing Preview value if present (ignore errors).
  spawnSync('npx', ['vercel', 'env', 'rm', name, 'preview', '-y'], {
    cwd: site,
    encoding: 'utf8',
    shell: true,
  });
  const add = spawnSync(
    'npx',
    ['vercel', 'env', 'add', name, 'preview', '--force'],
    {
      cwd: site,
      encoding: 'utf8',
      shell: true,
      input: value + '\n',
    },
  );
  unlinkSync(tmp);
  if (add.status !== 0) {
    throw new Error(`Failed to set ${name}: ${add.stderr || add.stdout}`);
  }
  console.log(`SET preview ${name} len=${value.length}`);
}

for (const [k, v] of Object.entries(pairs)) {
  setPreviewEnv(k, v);
}

console.log(
  JSON.stringify(
    {
      ok: true,
      previewRef: PREVIEW,
      keysSet: Object.keys(pairs),
      geminiLen: gemini.length,
    },
    null,
    2,
  ),
);
