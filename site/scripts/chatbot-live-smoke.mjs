/**
 * Controlled live Gemini smoke — Phase 2.2 / conditioned live auth.
 *
 * Authorized test restaurant: Pizzas El Trueno (slug: pizzas-el-trueno).
 *
 * DOES NOT call Gemini unless --authorize-live AND owner confirmation env is set:
 *   CHATBOT_OWNER_LIVE_CONFIRM=I_AUTHORIZE_PIZZAS_EL_TRUENO_LIVE
 *
 * Hard caps (server must be started with the same env):
 *   CHATBOT_LIVE_HARD_CAPS=1
 *   CHATBOT_LIVE_MAX_GEMINI_CALLS=6          # EVERY generateContent (tools/fallback count)
 *   CHATBOT_LIVE_MAX_COST_USD=0.02
 *   CHATBOT_MAX_OUTPUT_TOKENS=256
 *   CHATBOT_MAX_TOOL_ROUNDS=2
 *   CHATBOT_LIVE_BUDGET_RESET=1             # only when starting a NEW authorized smoke
 *   # Counters persist in .data/chatbot-live-budget.json across Next restarts
 *
 * Usage (from site/):
 *   node scripts/chatbot-live-smoke.mjs
 *   node --env-file=.env.local scripts/chatbot-live-smoke.mjs --authorize-live --slug=pizzas-el-trueno
 */

const AUTHORIZED_SLUG = 'pizzas-el-trueno';
const AUTHORIZED_COMMERCE_ID = '0aa8c53b-07f1-446e-8b88-66c2b7ae89ea';
const OWNER_PHRASE = 'I_AUTHORIZE_PIZZAS_EL_TRUENO_LIVE';

const authorize = process.argv.includes('--authorize-live');
const slugArg = process.argv.find((a) => a.startsWith('--slug='));
const slug = (slugArg ? slugArg.slice('--slug='.length) : AUTHORIZED_SLUG)
  .trim()
  .toLowerCase();
const maxArg = process.argv.find((a) => a.startsWith('--max-requests='));
const maxUserTurns = Math.min(
  6,
  Math.max(1, Number(maxArg?.slice('--max-requests='.length) || 6) || 6),
);

const key = (process.env.GEMINI_API_KEY || '').trim();
const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
const service = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const model =
  (process.env.CHATBOT_GEMINI_MODEL || '').trim() || 'gemini-3.1-flash-lite';
const fallback =
  (process.env.CHATBOT_GEMINI_MODEL_FALLBACK || '').trim() ||
  'gemini-2.5-flash-lite';
const priceIn = Number(process.env.CHATBOT_PRICE_INPUT_PER_1M || 0.25);
const priceOut = Number(process.env.CHATBOT_PRICE_OUTPUT_PER_1M || 1.5);
const maxGeminiCalls = Number(process.env.CHATBOT_LIVE_MAX_GEMINI_CALLS || 6);
const maxCost = Number(process.env.CHATBOT_LIVE_MAX_COST_USD || 0.02);
const maxOut = Number(process.env.CHATBOT_MAX_OUTPUT_TOKENS || 256);
const assumedIn = 7000;

function estimateCost(tokensIn, tokensOut) {
  return (tokensIn / 1e6) * priceIn + (tokensOut / 1e6) * priceOut;
}

function canGuaranteeCostCap() {
  const calls = Number.isFinite(maxGeminiCalls) ? maxGeminiCalls : 6;
  const outTok = Number.isFinite(maxOut) ? maxOut : 256;
  const worstCaseUsd =
    calls *
    ((assumedIn / 1_000_000) * priceIn + (outTok / 1_000_000) * priceOut);
  const cap = Number.isFinite(maxCost) ? maxCost : 0.02;
  if (worstCaseUsd > cap) {
    return {
      ok: false,
      worstCaseUsd,
      reason:
        `Worst-case estimate $${worstCaseUsd.toFixed(4)} exceeds cap $${cap.toFixed(2)}. ` +
        `Lower CHATBOT_MAX_OUTPUT_TOKENS and/or CHATBOT_LIVE_MAX_GEMINI_CALLS.`,
    };
  }
  return { ok: true, worstCaseUsd };
}

const guarantee = canGuaranteeCostCap();

console.log('=== chatbot-live-smoke (conditioned live) ===');
console.log('authorize-live:', authorize);
console.log('slug:', slug);
console.log('authorized commerce UUID:', AUTHORIZED_COMMERCE_ID);
console.log('max user turns:', maxUserTurns);
console.log('model:', model);
console.log('fallback:', fallback);
console.log('GEMINI_API_KEY present:', Boolean(key));
console.log('CHATBOT_ENABLED:', process.env.CHATBOT_ENABLED || '(unset)');
console.log('hard caps env:', process.env.CHATBOT_LIVE_HARD_CAPS || '(unset)');
console.log(
  'cost guarantee:',
  guarantee.ok
    ? `OK worst-case ~$${guarantee.worstCaseUsd.toFixed(4)}`
    : `FAIL ${guarantee.reason}`,
);

const prompts = [
  '¿Qué pizzas tienen disponibles?',
  '¿Cuánto cuesta la pizza más económica?',
  '¿Qué ingredientes tiene la Hawaiana?',
  '¿Qué me recomiendas para dos personas?',
  '¿Puedo agregar ingredientes adicionales?',
  '¿Tienen servicio de delivery?',
];

if (!authorize) {
  console.log(`
PREP / dry checklist (no Gemini cost):
  Restaurant: Pizzas El Trueno
  Slug: ${AUTHORIZED_SLUG}
  UUID: ${AUTHORIZED_COMMERCE_ID}

  1. Ensure site/.env.local has (never commit, never paste keys into chat):
       GEMINI_API_KEY=... (local only)
       CHATBOT_ENABLED=1
       CHATBOT_QUOTA_BACKEND=filesystem
       CHATBOT_LIVE_HARD_CAPS=1
       CHATBOT_LIVE_MAX_GEMINI_CALLS=6
       CHATBOT_LIVE_MAX_COST_USD=0.02
       CHATBOT_MAX_OUTPUT_TOKENS=256
       CHATBOT_MAX_TOOL_ROUNDS=2
       CHATBOT_GEMINI_MODEL=gemini-3.1-flash-lite
       CHATBOT_GEMINI_MODEL_FALLBACK=gemini-2.5-flash-lite
       CHATBOT_OWNER_LIVE_CONFIRM=${OWNER_PHRASE}
  2. If commerce is offline: set CHATBOT_ALLOW_OFFLINE_LOCAL=1 on the Next server
     (local/dev only — ignored in production; does not enable pedidos)
  3. Restart local Next (CHATBOT_SMOKE_BASE default http://127.0.0.1:3000)
  4. Owner authorizes billable calls for Pizzas El Trueno in chat
  5. Re-run:
       node --env-file=.env.local scripts/chatbot-live-smoke.mjs --authorize-live --slug=${AUTHORIZED_SLUG}

Planned questions (Pizzas El Trueno only — answers must come from real menu tools):
${prompts.map((p, i) => `  ${i + 1}. ${p}`).join('\n')}

Absolute Gemini HTTP budget: ${maxGeminiCalls} calls (tools + fallback included).
Owner budget: $${maxCost} USD. Thinking: thinkingLevel MINIMAL on 3.1.
`);
  process.exit(guarantee.ok ? 0 : 2);
}

if (!guarantee.ok) {
  console.error('Refusing live run: cannot guarantee USD cost cap.', guarantee.reason);
  process.exit(2);
}

if (slug !== AUTHORIZED_SLUG) {
  console.error(
    `Refusing: only --slug=${AUTHORIZED_SLUG} is authorized for this live test.`,
  );
  process.exit(1);
}

if ((process.env.CHATBOT_OWNER_LIVE_CONFIRM || '').trim() !== OWNER_PHRASE) {
  console.error(
    `Refusing: set CHATBOT_OWNER_LIVE_CONFIRM=${OWNER_PHRASE} after explicit owner approval in chat.`,
  );
  process.exit(1);
}

if ((process.env.CHATBOT_LIVE_HARD_CAPS || '').trim() !== '1') {
  console.error('Refusing: CHATBOT_LIVE_HARD_CAPS=1 required on the Next server process.');
  process.exit(1);
}

if (!key) {
  console.error(`
Refusing: GEMINI_API_KEY missing.

How to add it safely:
  1. Open Google AI Studio → API keys → create/copy key
  2. Edit site/.env.local locally (file is gitignored)
  3. Add a single line: GEMINI_API_KEY=your_key_here
  4. Save. Do not commit. Do not paste the key into Cursor chat or screenshots.
  5. Restart npm run dev so Next.js reloads env
`);
  process.exit(1);
}

if ((process.env.CHATBOT_ENABLED || '').trim() !== '1') {
  console.error('Refusing: CHATBOT_ENABLED must be 1');
  process.exit(1);
}
if (!url || !service) {
  console.error('Refusing: Supabase env missing');
  process.exit(1);
}

const base = process.env.CHATBOT_SMOKE_BASE || 'http://127.0.0.1:3001';
let baseHost;
try {
  baseHost = new URL(base).hostname;
} catch {
  console.error('Refusing: invalid CHATBOT_SMOKE_BASE');
  process.exit(1);
}
if (!['127.0.0.1', 'localhost'].includes(baseHost)) {
  console.error('Refusing: live smoke only against localhost / 127.0.0.1');
  process.exit(1);
}

const { createClient } = await import('@supabase/supabase-js');
const sb = createClient(url, service, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: comercio, error } = await sb
  .from('comercios')
  .select('id,slug,nombre,en_linea')
  .eq('slug', slug)
  .maybeSingle();
if (error || !comercio) {
  console.error('Commerce not found', error?.message);
  process.exit(1);
}

if (String(comercio.id) !== AUTHORIZED_COMMERCE_ID) {
  console.error('Refusing: commerce UUID does not match authorized Pizzas El Trueno id.');
  process.exit(1);
}

if (comercio.en_linea !== true) {
  const offlineOk =
    (process.env.CHATBOT_ALLOW_OFFLINE_LOCAL || '').trim() === '1' ||
    (process.env.CHATBOT_ALLOW_OFFLINE_LOCAL || '').trim().toLowerCase() ===
      'true';
  if (!offlineOk) {
    console.error(
      'Refusing: Pizzas El Trueno is offline. For LOCAL smoke only, set CHATBOT_ALLOW_OFFLINE_LOCAL=1 (never in production; does not enable orders).',
    );
    process.exit(1);
  }
  console.log(
    'NOTE: local offline exception enabled (CHATBOT_ALLOW_OFFLINE_LOCAL=1). Production ignores this.',
  );
}

console.log('Commerce', comercio.nombre, comercio.id, 'online=', comercio.en_linea);

const sessionId = `s_live_${Date.now().toString(36)}`;
const history = [];
let totalIn = 0;
let totalOut = 0;
let totalGeminiHttp = 0;
const report = [];

async function ask(text) {
  const started = Date.now();
  history.push({ role: 'user', text });
  const res = await fetch(`${base}/api/chat/${encodeURIComponent(slug)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId,
      messages: history.slice(-12),
    }),
  });
  const rawText = await res.text();
  let json = {};
  try {
    json = JSON.parse(rawText);
  } catch {
    const row = {
      question: text,
      status: res.status,
      model: null,
      reply: '',
      usage: null,
      error: 'non_json_response',
      ms: Date.now() - started,
    };
    report.push(row);
    console.log('\nQ:', text);
    console.log('HTTP', res.status, 'non_json_response', `${row.ms}ms`);
    console.log('Body preview:', rawText.slice(0, 200));
    return { stop: true };
  }
  const ms = Date.now() - started;
  const row = {
    question: text,
    status: res.status,
    model: json.model || null,
    reply: (json.reply || json.message || '').slice(0, 800),
    usage: json.usage || null,
    error: json.error || null,
    ms,
  };
  report.push(row);
  console.log('\nQ:', text);
  console.log('HTTP', res.status, json.error || 'ok', json.model || '', `${ms}ms`);
  console.log('A:', row.reply.slice(0, 500));
  if (json.usage) {
    console.log('usage', json.usage);
    totalIn += Number(json.usage.tokensInput || 0);
    totalOut += Number(json.usage.tokensOutput || 0);
    totalGeminiHttp += Number(json.usage.geminiHttpCalls || 0);
  }
  if (json.ok && json.reply) {
    history.push({ role: 'assistant', text: String(json.reply) });
  }
  if (totalGeminiHttp >= maxGeminiCalls) {
    console.log('Stopping: reached absolute Gemini HTTP call budget.');
    return { stop: true };
  }
  return { stop: false };
}

for (const p of prompts.slice(0, maxUserTurns)) {
  const { stop } = await ask(p);
  if (stop) break;
}

console.log('\n=== LIVE SUMMARY ===');
console.log(
  JSON.stringify(
    {
      slug,
      commerceId: AUTHORIZED_COMMERCE_ID,
      modelPrimary: model,
      totals: {
        tokensInput: totalIn,
        tokensOutput: totalOut,
        geminiHttpCalls: totalGeminiHttp,
        estimatedCostUsd: estimateCost(totalIn, totalOut),
      },
      turns: report,
    },
    null,
    2,
  ),
);
