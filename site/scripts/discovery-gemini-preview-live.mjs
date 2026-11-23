/**
 * Controlled Gemini live test against Vercel Preview + Supabase Preview only.
 * Stops if cumulative geminiHttpCalls would exceed 15.
 *
 *   node site/scripts/discovery-gemini-preview-live.mjs --base https://....vercel.app
 */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const PREVIEW_REF = 'gsfxqzvmyzjjgpigrste';
const PROD_REF = 'qqhberaayhohxlbbhdyi';
const HTTP_BUDGET = 15;
const MAX_QUERIES = 5;

function arg(name, fallback = '') {
  const i = process.argv.indexOf(name);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  return fallback;
}

const base = (arg('--base') || process.env.DISCOVERY_PREVIEW_BASE || '')
  .trim()
  .replace(/\/$/, '');
if (!base) {
  console.error('Missing --base <preview-url>');
  process.exit(2);
}
if (/elmenuxfa\.com/i.test(base)) {
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
  base,
  sessionId,
  startedAt: new Date().toISOString(),
  preflight: null,
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

async function getJson(path, init) {
  const t0 = Date.now();
  const res = await fetch(`${base}${path}`, init);
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text.slice(0, 500) };
  }
  return { status: res.status, ms: Date.now() - t0, json };
}

const pre = await getJson('/api/asistente');
report.preflight = pre.json;
if (!pre.json?.liveGemini) {
  console.error('Preview liveGemini is false — abort', pre.json);
  writeFileSync(
    resolve(process.cwd(), '../docs/discovery-gemini-preview-live-checks.json'),
    JSON.stringify(report, null, 2),
  );
  process.exit(1);
}
if (
  Number(pre.json.maxGeminiHttpCallsPerRequest) < 1 ||
  Number(pre.json.geminiHttpBudget) !== HTTP_BUDGET
) {
  console.error('HTTP budget not guaranteed by Preview config', pre.json);
  process.exit(1);
}

for (const p of prompts.slice(0, MAX_QUERIES)) {
  if (report.totals.http >= HTTP_BUDGET) {
    report.aborted = 'http_budget_exhausted_before_query';
    break;
  }
  const remaining = HTTP_BUDGET - report.totals.http;
  if (remaining < 1) {
    report.aborted = 'no_http_slots_left';
    break;
  }

  const body = {
    messages: [{ role: 'user', text: p.text }],
    sessionId,
  };
  if (p.lat != null) body.lat = p.lat;
  if (p.lng != null) body.lng = p.lng;

  const r = await getJson('/api/asistente', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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
    status: r.status,
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
  });

  console.log(
    JSON.stringify({
      id: p.id,
      http,
      cumulativeHttp: report.totals.http,
      model: r.json?.model,
      n: restaurants.length,
      ms: r.ms,
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
  report.totals.http <= HTTP_BUDGET;

const out = resolve(
  import.meta.dirname,
  '../../docs/discovery-gemini-preview-live-checks.json',
);
writeFileSync(out, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ ok: report.ok, totals: report.totals, out }, null, 2));
process.exit(report.ok ? 0 : 1);
