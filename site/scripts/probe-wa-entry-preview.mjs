#!/usr/bin/env node
/**
 * Probe Preview wa-entry webhook via `vercel curl` (handles deployment protection).
 * Does not print webhook secrets.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');
const envPath = path.join(root, 'site/.wa-entry-preview-deploy/vercel-preview.env');
const metaPath = path.join(root, 'site/.wa-entry-preview-deploy/last-deploy.json');

const meta = JSON.parse(readFileSync(metaPath, 'utf8'));
const deployment = (meta.urls && meta.urls[0]) || '';
if (!deployment) {
  console.error('No deployment URL in last-deploy.json');
  process.exit(1);
}

const envMap = Object.fromEntries(
  readFileSync(envPath, 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('='))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i), l.slice(i + 1).trim()];
    }),
);
const secret = envMap.PLATFORM_WA_WEBHOOK_SECRET;
if (!secret) {
  console.error('Missing webhook secret in local deploy env file');
  process.exit(1);
}

function toCurlPath(p) {
  return p.replace(/\\/g, '/');
}

function post({ signature, payload }) {
  const dir = mkdtempSync(path.join(tmpdir(), 'wa-probe-'));
  const bodyFile = path.join(dir, 'body.json');
  const cfgFile = path.join(dir, 'curl.cfg');
  const outFile = path.join(dir, 'out.json');
  const hdrFile = path.join(dir, 'hdr.txt');
  writeFileSync(bodyFile, JSON.stringify(payload));
  const cfgLines = ['header = "content-type: application/json"'];
  if (signature != null) {
    cfgLines.push(`header = "x-webhook-signature: ${signature}"`);
  }
  writeFileSync(cfgFile, `${cfgLines.join('\n')}\n`);

  const r = spawnSync(
    'npx',
    [
      'vercel',
      'curl',
      '/api/wa-entry/webhook',
      '--deployment',
      deployment,
      '--yes',
      '--',
      '-sS',
      '-X',
      'POST',
      '-K',
      toCurlPath(cfgFile),
      '--data-binary',
      `@${toCurlPath(bodyFile)}`,
      '-D',
      toCurlPath(hdrFile),
      '-o',
      toCurlPath(outFile),
    ],
    { cwd: root, encoding: 'utf8', shell: true },
  );

  const bodyText = readFileSync(outFile, 'utf8').trim();
  const hdrText = readFileSync(hdrFile, 'utf8');
  const http = Number(hdrText.match(/HTTP\/\d(?:\.\d)?\s+(\d{3})/i)?.[1] || 0);
  let body = null;
  try {
    body = JSON.parse(bodyText);
  } catch {
    body = { rawPreview: bodyText.slice(0, 160) };
  }
  return { http, body, cliStatus: r.status };
}

function get() {
  const dir = mkdtempSync(path.join(tmpdir(), 'wa-probe-'));
  const outFile = path.join(dir, 'out.json');
  const hdrFile = path.join(dir, 'hdr.txt');
  const r = spawnSync(
    'npx',
    [
      'vercel',
      'curl',
      '/api/wa-entry/webhook',
      '--deployment',
      deployment,
      '--yes',
      '--',
      '-sS',
      '-D',
      toCurlPath(hdrFile),
      '-o',
      toCurlPath(outFile),
    ],
    { cwd: root, encoding: 'utf8', shell: true },
  );
  const bodyText = readFileSync(outFile, 'utf8').trim();
  const hdrText = readFileSync(hdrFile, 'utf8');
  const http = Number(hdrText.match(/HTTP\/\d(?:\.\d)?\s+(\d{3})/i)?.[1] || 0);
  return { http, body: JSON.parse(bodyText), cliStatus: r.status };
}

const results = {
  deployment,
  endpoint: `${deployment}/api/wa-entry/webhook`,
  get: get(),
  noSig: post({ signature: null, payload: { event: 'messages.received' } }),
  forged: post({ signature: 'forged', payload: { event: 'messages.received' } }),
  authOk: post({
    signature: secret,
    payload: {
      event: 'messages.received',
      timestamp: Math.floor(Date.now() / 1000),
      data: {
        messages: {
          key: {
            id: `https-probe-${Date.now()}`,
            fromMe: false,
            remoteJid: '584128880099@s.whatsapp.net',
            cleanedSenderPn: '584128880099',
          },
          messageBody: 'Hola',
          message: { conversation: 'Hola' },
        },
      },
    },
  }),
};

console.log(JSON.stringify(results, null, 2));

const g = results.get.body;
const ok =
  g.ok === true &&
  g.previewProjectRef === 'gsfxqzvmyzjjgpigrste' &&
  g.inboundEnabled === false &&
  g.routerEnabled === false &&
  g.adapter === 'preview_isolated' &&
  g.storeKind === 'supabase_preview' &&
  g.realWasenderEnabled === false &&
  g.webhookSecretConfigured === true &&
  results.noSig.http === 401 &&
  results.forged.http === 401 &&
  results.authOk.http === 200 &&
  results.authOk.body?.reason === 'kill_switch';

console.log(ok ? 'PROBE_PASS' : 'PROBE_FAIL');
process.exit(ok ? 0 : 2);
