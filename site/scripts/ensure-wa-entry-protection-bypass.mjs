#!/usr/bin/env node
/**
 * Create a dedicated Vercel Protection Bypass secret for wa-entry Wasender tests.
 * Stores secret only under site/.wa-entry-preview-deploy/ (gitignored). Never prints it.
 *
 *   CONFIRM_WA_ENTRY_BYPASS=1 node site/scripts/ensure-wa-entry-protection-bypass.mjs
 */
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');
const deployDir = path.join(root, 'site/.wa-entry-preview-deploy');
const bypassPath = path.join(deployDir, 'vercel-protection-bypass.env');
const metaPath = path.join(deployDir, 'last-deploy.json');
const projectPath = path.join(root, '.vercel/project.json');

if (process.env.CONFIRM_WA_ENTRY_BYPASS !== '1') {
  console.error('Refused: set CONFIRM_WA_ENTRY_BYPASS=1');
  process.exit(1);
}

mkdirSync(deployDir, { recursive: true });

function fp(v) {
  return createHash('sha256').update(v).digest('hex').slice(0, 12);
}

function readToken() {
  if (process.env.VERCEL_TOKEN) return process.env.VERCEL_TOKEN.trim();
  const candidates = [
    path.join(homedir(), 'AppData/Roaming/com.vercel.cli/Data/auth.json'),
    path.join(homedir(), 'AppData/Local/com.vercel.cli/Data/auth.json'),
    path.join(homedir(), '.local/share/com.vercel.cli/auth.json'),
    path.join(homedir(), '.vercel/auth.json'),
  ];
  for (const p of candidates) {
    if (!existsSync(p)) continue;
    try {
      const j = JSON.parse(readFileSync(p, 'utf8'));
      if (j.token) return String(j.token);
      if (j.accessToken) return String(j.accessToken);
    } catch {
      /* continue */
    }
  }
  return '';
}

function loadExisting() {
  if (!existsSync(bypassPath)) return null;
  const line = readFileSync(bypassPath, 'utf8')
    .split(/\r?\n/)
    .find((l) => l.startsWith('VERCEL_AUTOMATION_BYPASS_SECRET='));
  return line ? line.slice('VERCEL_AUTOMATION_BYPASS_SECRET='.length).trim() : null;
}

let secret = loadExisting();
let created = false;

if (!secret) {
  const token = readToken();
  if (!token) {
    writeFileSync(
      path.join(deployDir, 'bypass-setup-failed.txt'),
      'No Vercel token available. In Dashboard → kosmenu → Settings → Deployment Protection → Protection Bypass for Automation → Create (note: wa-entry-wasender-preview). Save to vercel-protection-bypass.env as VERCEL_AUTOMATION_BYPASS_SECRET=<value>\n',
    );
    console.error('BYPASS_SETUP_FAILED — dashboard create required (no CLI token)');
    process.exit(2);
  }

  const project = JSON.parse(readFileSync(projectPath, 'utf8'));
  const projectId = project.projectId;
  const teamId = project.orgId;
  // Vercel requires exactly 32 [a-zA-Z0-9]
  secret = randomBytes(16).toString('hex');

  const url = new URL(`https://api.vercel.com/v1/projects/${projectId}/protection-bypass`);
  url.searchParams.set('teamId', teamId);

  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      generate: {
        secret,
        note: 'wa-entry-wasender-preview',
      },
    }),
  });

  const text = await res.text();
  if (!res.ok) {
    writeFileSync(
      path.join(deployDir, 'bypass-setup-failed.txt'),
      `API ${res.status}: create labeled bypass in dashboard (wa-entry-wasender-preview).\n`,
    );
    console.error(`BYPASS_SETUP_FAILED status=${res.status}`);
    process.exit(2);
  }

  // Prefer returned secret if API echoes it under a known key; otherwise use generated.
  try {
    const data = JSON.parse(text);
    if (typeof data.protectionBypass === 'string' && data.protectionBypass.length >= 16) {
      secret = data.protectionBypass;
    } else if (data.protectionBypass && typeof data.protectionBypass === 'object') {
      // map of id -> meta; keep generated secret we sent
    }
  } catch {
    /* keep generated */
  }

  created = true;
  writeFileSync(
    bypassPath,
    [
      '# Gitignored. Dedicated WaSender Preview bypass. Revoke after limited test.',
      '# Dashboard note: wa-entry-wasender-preview',
      `VERCEL_AUTOMATION_BYPASS_SECRET=${secret}`,
      '',
    ].join('\n'),
    { encoding: 'utf8', mode: 0o600 },
  );
}

const meta = existsSync(metaPath) ? JSON.parse(readFileSync(metaPath, 'utf8')) : {};
const base = (meta.urls && meta.urls[0]) || '';
const webhookPath = meta.webhookPath || '/api/wa-entry/webhook';
const usableUrl = base
  ? `${base}${webhookPath}?x-vercel-protection-bypass=${encodeURIComponent(secret)}`
  : null;

writeFileSync(
  path.join(deployDir, 'wasender-webhook-url.local.txt'),
  [
    '# Gitignored — paste ONLY into WaSender SECONDARY session webhook URL.',
    '# Do not commit. Rotate/revoke bypass after the limited reception test.',
    usableUrl || '(missing deployment URL)',
    '',
  ].join('\n'),
  { encoding: 'utf8', mode: 0o600 },
);

writeFileSync(
  path.join(deployDir, 'bypass-meta.json'),
  JSON.stringify(
    {
      created,
      fingerprint: fp(secret),
      note: 'wa-entry-wasender-preview',
      scope:
        'Vercel automation bypass is project-wide for protected deployments (Preview vercel.app). Production custom domains use all_except_custom_domains (not SSO-gated). Revoke this dedicated secret after the test.',
      wasenderDelivery: 'query_param',
      reasonQueryParam: 'Wasender webhooks do not support custom Vercel bypass headers',
      publicEndpointBase: base ? `${base}${webhookPath}` : null,
      localUrlFile: 'site/.wa-entry-preview-deploy/wasender-webhook-url.local.txt',
    },
    null,
    2,
  ),
);

console.log(
  JSON.stringify(
    {
      ok: true,
      created,
      fingerprint: fp(secret),
      note: 'wa-entry-wasender-preview',
      publicEndpointBase: base ? `${base}${webhookPath}` : null,
      localUrlFile: 'site/.wa-entry-preview-deploy/wasender-webhook-url.local.txt',
    },
    null,
    2,
  ),
);
