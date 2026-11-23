/**
 * Controlled Gemini live test against Vercel Preview + Supabase Preview only.
 * Uses `vercel curl` to bypass deployment protection.
 * Stops if cumulative geminiHttpCalls would exceed 15.
 *
 *   node site/scripts/discovery-gemini-preview-live.mjs --deployment https://....vercel.app
 */
import { writeFileSync, unlinkSync, mkdtempSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const HTTP_BUDGET = 15;
const MAX_QUERIES = 5;
const siteDir = dirname(fileURLToPath(import.meta.url)); // .../site/scripts
const siteRoot = resolve(siteDir, '..');
const docsOut = resolve(siteDir, '../../docs/discovery-gemini-preview-live-checks.json');

function arg(name, fallback = '') {
  const i = process.argv.indexOf(name);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  return fallback;
}

const deployment = (
  arg('--deployment') ||
  process.env.DISCOVERY_PREVIEW_DEPLOYMENT ||
  ''
)
  .trim()
  .replace(/\/$/, '');
if (!deployment) {
  console.error('Missing --deployment <preview-url-or-id>');
  process.exit(2);
}
if (/elmenuxfa\.com/i.test(deployment)) {
  console.error('Refused: production hostname');
  process.exit(2);
}

const prompts = [
  {
    id: 1,
    text: 'Quiero comer pizza cerca de mí',
    lat: 7.8167,
    lng: -72.2167,
    note: 'Táriba/Táchira coords near Nápoles',
  },
  { id: 2, text: '¿Qué restaurantes tienen hamburguesas?' },
  { id: 3, text: 'Busco un restaurante económico' },
  { id: 4, text: 'Muéstrame el menú de Auto Pizzas Nápoles' },
  { id: 5, text: 'xyznoexiste999discovery' },
];

const sessionId = `preview-gemini-live-${Date.now()}`;
const report = {
  deployment,
  sessionId,
  startedAt: new Date().toISOString(),
  preflight: null,
  directoryProbe: null,
  queries: [],
  totals: {
    http: 0,
    tokensIn: 0,
    tokensOut: 0,
    estimatedCostUsd: 0,
  },
  aborted: null,
  ok: false,
};

function vercelCurl(path, init) {
  const args = ['vercel', 'curl', path, '--deployment', deployment, '--yes'];
  let tmpFile = null;
  if (init?.method === 'POST') {
    const dir = mkdtempSync(join(tmpdir(), 'discovery-live-'));
    tmpFile = join(dir, 'body.json');
    writeFileSync(tmpFile, init.body, 'utf8');
    // Use @file so Windows/PowerShell cannot mangle JSON / unicode.
    args.push(
      '--',
      '-X',
      'POST',
      '-H',
      'Content-Type: application/json',
      '--data-binary',
      `@${tmpFile}`,
    );
  }
  const t0 = Date.now();
  const res = spawnSync('npx', args, {
    cwd: siteRoot,
    encoding: 'utf8',
    shell: true,
    maxBuffer: 4 * 1024 * 1024,
  });
  if (tmpFile) {
    try {
      unlinkSync(tmpFile);
    } catch {
      // ignore
    }
  }
  const combined = `${res.stdout || ''}\n${res.stderr || ''}`;
  // Find last JSON object in output (vercel curl prints progress + body)
  let json = null;
  const matches = combined.match(/\{[\s\S]*\}/g);
  if (matches?.length) {
    for (let i = matches.length - 1; i >= 0; i--) {
      try {
        json = JSON.parse(matches[i]);
        break;
      } catch {
        // continue
      }
    }
  }
  return { ms: Date.now() - t0, status: res.status, json, rawTail: combined.slice(-800) };
}

const pre = vercelCurl('/api/asistente');
report.preflight = pre.json;
if (!pre.json?.liveGemini) {
  console.error('Preview liveGemini is false — abort', pre.json || pre.rawTail);
  writeFileSync(docsOut, JSON.stringify(report, null, 2));
  process.exit(1);
}
if (
  Number(pre.json.maxGeminiHttpCallsPerRequest) !== 3 ||
  Number(pre.json.geminiHttpBudget) !== HTTP_BUDGET
) {
  console.error('HTTP budget not guaranteed by Preview config', pre.json);
  writeFileSync(docsOut, JSON.stringify(report, null, 2));
  process.exit(1);
}

const dir = vercelCurl('/api/comercios/directory?mode=clientes&q=preview-demo&limit=5');
report.directoryProbe = {
  total: dir.json?.data?.total ?? null,
  sample: (dir.json?.data?.results || []).slice(0, 3).map((r) => ({
    slug: r.slug,
    nombre: r.nombre,
  })),
};

for (const p of prompts.slice(0, MAX_QUERIES)) {
  if (report.totals.http >= HTTP_BUDGET) {
    report.aborted = 'http_budget_exhausted_before_query';
    break;
  }

  const body = {
    messages: [{ role: 'user', text: p.text }],
    sessionId,
  };
  if (p.lat != null) body.lat = p.lat;
  if (p.lng != null) body.lng = p.lng;

  const r = vercelCurl('/api/asistente', {
    method: 'POST',
    body: JSON.stringify(body),
  });

  const http = Number(r.json?.geminiHttpCalls ?? 0) || 0;
  const tin = Number(r.json?.tokensInput ?? 0) || 0;
  const tout = Number(r.json?.tokensOutput ?? 0) || 0;
  const cost = Number(r.json?.estimatedCostUsd ?? 0) || 0;

  report.totals.http += http;
  report.totals.tokensIn += tin;
  report.totals.tokensOut += tout;
  report.totals.estimatedCostUsd += cost;

  const restaurants = Array.isArray(r.json?.restaurants) ? r.json.restaurants : [];
  report.queries.push({
    id: p.id,
    prompt: p.text,
    note: p.note || null,
    ms: r.ms,
    model: r.json?.model ?? null,
    text: r.json?.text ?? null,
    toolCalls: r.json?.toolCalls ?? null,
    skippedLlm: r.json?.skippedLlm ?? null,
    fallback: r.json?.fallback ?? null,
    stopReason: r.json?.stopReason ?? null,
    geminiHttpCalls: http,
    tokensInput: tin,
    tokensOutput: tout,
    estimatedCostUsd: cost,
    requestId: r.json?.requestId ?? null,
    restaurants: restaurants.map((x) => ({
      slug: x.slug,
      nombre: x.nombre,
      menuUrl: x.menuUrl,
    })),
    cumulativeHttp: report.totals.http,
    parseOk: Boolean(r.json?.ok),
    rawTail: r.json ? null : r.rawTail,
  });

  console.log(
    JSON.stringify({
      id: p.id,
      http,
      cumulativeHttp: report.totals.http,
      model: r.json?.model,
      n: restaurants.length,
      ms: r.ms,
      stopReason: r.json?.stopReason ?? null,
    }),
  );

  if (report.totals.http > HTTP_BUDGET) {
    report.aborted = 'http_budget_exceeded';
    break;
  }
}

report.finishedAt = new Date().toISOString();
report.ok =
  !report.aborted &&
  report.queries.length === MAX_QUERIES &&
  report.totals.http <= HTTP_BUDGET &&
  report.queries.every((q) => q.parseOk);

writeFileSync(docsOut, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ ok: report.ok, totals: report.totals, out: docsOut }, null, 2));
process.exit(report.ok ? 0 : 1);
