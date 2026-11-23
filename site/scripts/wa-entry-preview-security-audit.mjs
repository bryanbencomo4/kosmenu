#!/usr/bin/env node
/**
 * Security audit for wa-entry Preview readiness (no secret printing).
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PREVIEW = 'gsfxqzvmyzjjgpigrste';
const PROD = 'qqhberaayhohxlbbhdyi';
const OLD_LEAKED = '4bcf9702fc5df6f4bf508f4e2ce1bc64';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');
const deployDir = path.join(root, 'site/.wa-entry-preview-deploy');
const envPath = path.join(deployDir, 'vercel-preview.env');
const metaPath = path.join(deployDir, 'last-deploy.json');
const systemEnvPath = path.join(deployDir, 'vercel-system.preview.env');

function loadEnv(file) {
  if (!existsSync(file)) return {};
  const out = {};
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#') || !t.includes('=')) continue;
    const i = t.indexOf('=');
    let v = t.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    out[t.slice(0, i)] = v;
  }
  return out;
}

function fp(value) {
  return createHash('sha256').update(value).digest('hex').slice(0, 12);
}

const report = {
  at: new Date().toISOString(),
  checks: {},
};

const ignore = spawnSync('git', ['check-ignore', '-v', envPath], {
  cwd: root,
  encoding: 'utf8',
});
report.checks.envGitignored = ignore.status === 0;

const env = loadEnv(envPath);
const secret = env.PLATFORM_WA_WEBHOOK_SECRET || '';
report.checks.secretPresent = Boolean(secret);
report.checks.secretFingerprint = secret ? fp(secret) : null;
report.checks.oldLeakedInvalidated = secret !== OLD_LEAKED;
report.checks.previewUrlOk = (env.PLATFORM_WA_PREVIEW_SUPABASE_URL || '').includes(PREVIEW);
report.checks.previewUrlNotProd = !(env.PLATFORM_WA_PREVIEW_SUPABASE_URL || '').includes(PROD);
report.checks.previewRefOk = env.PLATFORM_WA_PREVIEW_PROJECT_REF === PREVIEW;
report.checks.realWasenderOff = env.PLATFORM_WA_ALLOW_REAL_WASENDER === '0';
report.checks.adapterIsolated = env.PLATFORM_WA_ADAPTER === 'preview_isolated';
report.checks.storePreview = env.PLATFORM_WA_STORE === 'supabase_preview';

const grepOld = spawnSync('git', ['grep', '-I', '-n', OLD_LEAKED], {
  cwd: root,
  encoding: 'utf8',
});
report.checks.oldSecretNotInGit = !grepOld.stdout?.trim();

if (secret) {
  const grepNew = spawnSync('git', ['grep', '-I', '-n', secret], {
    cwd: root,
    encoding: 'utf8',
  });
  report.checks.newSecretNotInGit = !grepNew.stdout?.trim();
}

const meta = existsSync(metaPath) ? JSON.parse(readFileSync(metaPath, 'utf8')) : null;
report.deployment = meta;

// Pull system preview env (may fail if no linked preview env) — names only in report
const pull = spawnSync(
  'npx',
  ['vercel', 'env', 'pull', systemEnvPath, '--environment', 'preview', '--yes'],
  { cwd: root, encoding: 'utf8', shell: true },
);
report.checks.systemEnvPullOk = pull.status === 0;
const sys = loadEnv(systemEnvPath);
report.checks.hasAutomationBypassEnv = Object.prototype.hasOwnProperty.call(
  sys,
  'VERCEL_AUTOMATION_BYPASS_SECRET',
);
report.checks.hostSupabaseIsProd = (sys.NEXT_PUBLIC_SUPABASE_URL || '').includes(PROD);
report.checks.hostSupabaseIsPreview = (sys.NEXT_PUBLIC_SUPABASE_URL || '').includes(PREVIEW);
report.checks.platformWaInProjectEnv = Object.keys(sys).some((k) => k.startsWith('PLATFORM_WA_'));

// Source audit: isolated sender / preview store guards
const isolatedSrc = readFileSync(
  path.join(root, 'site/app/api/wa-entry/_lib/sender-isolated.ts'),
  'utf8',
);
const storeSrc = readFileSync(
  path.join(root, 'site/app/api/wa-entry/_lib/store-supabase-preview.ts'),
  'utf8',
);
const runtimeSrc = readFileSync(
  path.join(root, 'site/app/api/wa-entry/_lib/runtime.ts'),
  'utf8',
);
const isolatedCodeOnly = isolatedSrc
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '');
report.checks.isolatedSenderCallsProdQueue = /\bsendWhatsappText\b|wasenderapi\.com|enqueue_wasender_message/.test(
  isolatedCodeOnly,
);
report.checks.previewStoreAssertsTarget = storeSrc.includes('assertPreviewSupabaseTarget');
report.checks.runtimeUsesIsolatedForPreview =
  runtimeSrc.includes("adapter === 'preview_isolated'") &&
  runtimeSrc.includes('createIsolatedPreviewSender');

report.pass =
  report.checks.envGitignored &&
  report.checks.secretPresent &&
  report.checks.oldLeakedInvalidated &&
  report.checks.newSecretNotInGit !== false &&
  report.checks.oldSecretNotInGit &&
  report.checks.previewUrlOk &&
  report.checks.previewUrlNotProd &&
  report.checks.previewRefOk &&
  report.checks.realWasenderOff &&
  report.checks.adapterIsolated &&
  report.checks.storePreview &&
  !report.checks.isolatedSenderCallsProdQueue &&
  report.checks.previewStoreAssertsTarget &&
  report.checks.runtimeUsesIsolatedForPreview;

writeFileSync(
  path.join(deployDir, 'security-audit.json'),
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report, null, 2));
process.exit(report.pass ? 0 : 2);
