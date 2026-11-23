/**
 * CI/local runner: start Next with MEMORY supervision flags, run dual Playwright, exit.
 *
 * Requires (same as dual script + menu load):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY
 *   SUPABASE_SERVICE_ROLE_KEY   (menu/chat server paths)
 *
 * Optional:
 *   CHAT_SUPERVISION_CI_PORT=3015
 *   CHAT_SUPERVISION_CI_SKIP_IF_NO_SECRETS=1  → exit 0 when secrets missing
 */
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const siteRoot = join(__dirname, '..');
const repoRoot = join(siteRoot, '..');

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnvFile(join(siteRoot, '.env.local'));
loadEnvFile(join(siteRoot, '.env'));

const COMERCIO =
  process.env.CHAT_SUPERVISION_E2E_COMERCIO_ID ||
  '0aa8c53b-07f1-446e-8b88-66c2b7ae89ea';
const BEARER = process.env.CHAT_SUPERVISION_E2E_BEARER || 'e2e-supervision-token';
const skipIfNoSecrets = /^(1|true|yes)$/i.test(
  (process.env.CHAT_SUPERVISION_CI_SKIP_IF_NO_SECRETS || '').trim(),
);

function hasSecret(name) {
  return Boolean((process.env[name] || '').trim());
}

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      srv.close((err) => (err ? reject(err) : resolve(port)));
    });
    srv.on('error', reject);
  });
}

async function waitReady(base, timeoutMs = 90_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(
        `${base}/api/panel/conversaciones?comercioId=${encodeURIComponent(COMERCIO)}`,
        { headers: { Authorization: `Bearer ${BEARER}` } },
      );
      if (res.status === 200 || res.status === 401) return res.status;
    } catch {
      /* booting */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Server not ready at ${base} within ${timeoutMs}ms`);
}

function run(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      ...opts,
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });
    child.on('exit', (code) => resolve(code ?? 1));
  });
}

if (
  !hasSecret('NEXT_PUBLIC_SUPABASE_URL') ||
  !hasSecret('NEXT_PUBLIC_SUPABASE_ANON_KEY') ||
  !hasSecret('SUPABASE_SERVICE_ROLE_KEY')
) {
  const msg =
    'Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY';
  if (skipIfNoSecrets) {
    console.warn(`Skipping supervision CI e2e: ${msg}`);
    process.exit(0);
  }
  console.error(msg);
  process.exit(2);
}

const port =
  Number(process.env.CHAT_SUPERVISION_CI_PORT || 0) || (await freePort());
const base = `http://127.0.0.1:${port}`;

const env = {
  ...process.env,
  PORT: String(port),
  CHATBOT_SIMULATE_GEMINI: '1',
  CHAT_SUPERVISION_ENABLED: '1',
  CHAT_SUPERVISION_HUMAN_TAKEOVER: '1',
  CHAT_SUPERVISION_WASENDER: '0',
  CHAT_SUPERVISION_MEMORY: '1',
  CHAT_SUPERVISION_COMMERCE_IDS: COMERCIO,
  CHAT_SUPERVISION_E2E_BEARER: BEARER,
  CHAT_SUPERVISION_E2E_COMERCIO_ID: COMERCIO,
  NEXT_PUBLIC_CHAT_SUPERVISION_E2E_BEARER: BEARER,
};

console.log(`Starting Next on ${base} (MEMORY supervision E2E)…`);
const nextProc = spawn(
  'npx',
  ['next', 'dev', '-p', String(port), '-H', '127.0.0.1'],
  { cwd: siteRoot, env, stdio: 'inherit', shell: true },
);

let exitCode = 1;
try {
  const status = await waitReady(base);
  if (status !== 200) {
    throw new Error(`Panel E2E bearer rejected with HTTP ${status}`);
  }
  console.log('Server ready — running dual Playwright…');
  exitCode = await run('node', ['site/scripts/chat-supervision-dual-playwright.mjs'], {
    cwd: repoRoot,
    env: { ...env, BASE_URL: base },
  });
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  exitCode = 1;
} finally {
  nextProc.kill('SIGTERM');
  setTimeout(() => {
    try {
      nextProc.kill('SIGKILL');
    } catch {
      /* ignore */
    }
  }, 3000).unref?.();
}

process.exit(exitCode);
