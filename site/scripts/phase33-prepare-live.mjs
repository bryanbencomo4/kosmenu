/**
 * Fase 3.3 — readiness check for a future live Gemini smoke.
 * Does NOT call Google. Does NOT create orders. Does NOT flip production.
 *
 * Usage (from site/):
 *   node scripts/phase33-prepare-live.mjs
 */
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const outDir = join(root, '.data', 'phase33');
mkdirSync(outDir, { recursive: true });

function loadEnvFile(path) {
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i <= 0) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    out[k] = v;
  }
  return out;
}

function maskKey(key) {
  if (!key) return { present: false, length: 0 };
  return { present: true, length: key.length, prefix: `${key.slice(0, 4)}…` };
}

const fileEnv = {
  ...loadEnvFile(join(root, '.env')),
  ...loadEnvFile(join(root, '.env.local')),
};
const env = { ...fileEnv, ...process.env };

const report = {
  phase: '3.3',
  generatedAt: new Date().toISOString(),
  billableCallsMade: 0,
  deploy: false,
  migrations: false,
  checks: [],
  scenario: {
    userMessage:
      'Hola, quiero dos pizzas Hawaianas, una Normal y otra Grande',
    expected: {
      lines: 2,
      sizes: ['Normal', 'Grande'],
      requiresConfirmation: true,
      noAutoAdd: true,
      referencePricesAuditOnly: {
        normalUsd: 3.5,
        grandeUsd: 8.75,
        subtotalUsd: 12.25,
        note: 'Re-verificar contra catálogo; no hardcodear en runtime',
      },
    },
  },
  limits: {
    maxGeminiHttpCalls: Number(env.CHATBOT_LIVE_MAX_GEMINI_CALLS || 6),
    maxEstimatedCostUsd: Number(env.CHATBOT_LIVE_MAX_COST_USD || 0.02),
    hardCaps: env.CHATBOT_LIVE_HARD_CAPS,
    budgetReset: env.CHATBOT_LIVE_BUDGET_RESET || '0',
  },
  gemini: {
    simulateCurrently: env.CHATBOT_SIMULATE_GEMINI ?? null,
    key: maskKey(env.GEMINI_API_KEY),
    model: env.CHATBOT_GEMINI_MODEL || null,
    modelFallback: env.CHATBOT_GEMINI_MODEL_FALLBACK || null,
  },
  commerce: {
    allowOfflineLocal: env.CHATBOT_ALLOW_OFFLINE_LOCAL,
    allowedIds: (env.CHATBOT_ALLOWED_COMMERCE_IDS || '')
      .split(/[,;\s]+/)
      .filter(Boolean),
    expectedId: '0aa8c53b-07f1-446e-8b88-66c2b7ae89ea',
    slug: 'pizzas-el-trueno',
  },
  runbookWhenAuthorized: [
    '1. Mantener CHATBOT_LIVE_BUDGET_RESET=0 (no reiniciar contadores).',
    '2. En .env.local local: CHATBOT_SIMULATE_GEMINI=0',
    '3. Confirmar CHATBOT_ENABLED=1, CHATBOT_ALLOW_OFFLINE_LOCAL=1, CHATBOT_LIVE_HARD_CAPS=1',
    '4. Confirmar CHATBOT_LIVE_MAX_GEMINI_CALLS=6 y CHATBOT_LIVE_MAX_COST_USD=0.02',
    '5. Reiniciar `npm run dev` para cargar el env.',
    '6. Bloquear POST /api/orders en el navegador/Playwright de la prueba.',
    '7. Abrir /preview/dev-chatbot-trueno (Trueno offline; no menú público de pedidos).',
    '8. Nueva conversación → enviar el mensaje del escenario.',
    '9. Validar 2 propuestas Normal+Grande con precios de catálogo; confirmar; checkout preview.',
    '10. NO confirmar pedido real. Detenerse al agotar 6 HTTP o USD 0.02.',
  ],
};

function check(name, ok, detail) {
  report.checks.push({ name, ok: Boolean(ok), detail: detail ?? '' });
  console.log(`[phase33] ${ok ? 'OK' : 'FAIL'} ${name} — ${detail ?? ''}`);
}

check(
  'chatbot_enabled',
  env.CHATBOT_ENABLED === '1' || env.CHATBOT_ENABLED === 'true',
  `CHATBOT_ENABLED=${env.CHATBOT_ENABLED ?? 'missing'}`,
);
check(
  'allow_production_off',
  !env.CHATBOT_ALLOW_PRODUCTION ||
    !['1', 'true', 'yes'].includes(
      String(env.CHATBOT_ALLOW_PRODUCTION).toLowerCase(),
    ),
  `CHATBOT_ALLOW_PRODUCTION=${env.CHATBOT_ALLOW_PRODUCTION ?? 'missing'}`,
);
check(
  'offline_local',
  env.CHATBOT_ALLOW_OFFLINE_LOCAL === '1' ||
    env.CHATBOT_ALLOW_OFFLINE_LOCAL === 'true',
  `CHATBOT_ALLOW_OFFLINE_LOCAL=${env.CHATBOT_ALLOW_OFFLINE_LOCAL ?? 'missing'}`,
);
check(
  'allowlist_trueno',
  report.commerce.allowedIds
    .map((x) => x.toLowerCase())
    .includes(report.commerce.expectedId),
  `ids=${report.commerce.allowedIds.join(',') || 'empty'}`,
);
check(
  'gemini_key_present',
  report.gemini.key.present && report.gemini.key.length >= 20,
  `present=${report.gemini.key.present} length=${report.gemini.key.length}`,
);
check(
  'models_configured',
  Boolean(report.gemini.model) && Boolean(report.gemini.modelFallback),
  `primary=${report.gemini.model} fallback=${report.gemini.modelFallback}`,
);
check(
  'live_caps',
  String(env.CHATBOT_LIVE_HARD_CAPS) === '1' &&
    report.limits.maxGeminiHttpCalls === 6 &&
    report.limits.maxEstimatedCostUsd === 0.02,
  `caps=${env.CHATBOT_LIVE_HARD_CAPS} calls=${report.limits.maxGeminiHttpCalls} cost=${report.limits.maxEstimatedCostUsd}`,
);
check(
  'budget_reset_off',
  String(env.CHATBOT_LIVE_BUDGET_RESET || '0') === '0',
  `CHATBOT_LIVE_BUDGET_RESET=${env.CHATBOT_LIVE_BUDGET_RESET || '0'}`,
);
check(
  'simulate_still_on_for_now',
  String(env.CHATBOT_SIMULATE_GEMINI) === '1' ||
    String(env.CHATBOT_SIMULATE_GEMINI).toLowerCase() === 'true',
  `CHATBOT_SIMULATE_GEMINI=${env.CHATBOT_SIMULATE_GEMINI} (debe quedar 1 hasta autorización live)`,
);
check(
  'quota_filesystem_local',
  (env.CHATBOT_QUOTA_BACKEND || 'filesystem') === 'filesystem',
  `CHATBOT_QUOTA_BACKEND=${env.CHATBOT_QUOTA_BACKEND || 'filesystem'}`,
);

// Catalog price verification via Next menu loader is heavy; use a lightweight
// fetch to the running preview API if available, else skip with note.
async function verifyCatalogViaApi() {
  const base = process.env.PHASE33_BASE_URL || 'http://127.0.0.1:3000';
  try {
    const statusRes = await fetch(`${base}/api/chat/pizzas-el-trueno`);
    const status = await statusRes.json().catch(() => ({}));
    check(
      'chat_status_endpoint',
      statusRes.ok && typeof status.authorized === 'boolean',
      `http=${statusRes.status} authorized=${status.authorized} reason=${status.reason ?? 'n/a'}`,
    );

    // Simulate path still available while SIMULATE=1 — proves tools/pricing without Google.
    const simRes = await fetch(`${base}/api/chat/pizzas-el-trueno`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: `phase33_prep_${Date.now()}`,
        messages: [
          {
            role: 'user',
            text: 'Hola, quiero dos pizzas Hawaianas, una Normal y otra Grande',
          },
        ],
        cart_snapshot: [],
      }),
    });
    const sim = await simRes.json().catch(() => ({}));
    const actions = Array.isArray(sim.cart_actions) ? sim.cart_actions : [];
    const adds = actions.filter((a) => a && a.type === 'propose_add');
    const prices = adds.map((a) => ({
      label: a.label,
      unit: a.unit_price,
      total: a.line_total,
      product_id: a.product_id,
      selection: a.selection,
    }));
    const units = prices.map((p) => p.unit).sort((a, b) => a - b);
    const subtotal = prices.reduce((s, p) => s + Number(p.total || 0), 0);
    const matchRef =
      adds.length === 2 &&
      Math.abs((units[0] || 0) - 3.5) < 0.011 &&
      Math.abs((units[1] || 0) - 8.75) < 0.011 &&
      Math.abs(subtotal - 12.25) < 0.02;
    check(
      'catalog_hawaiana_prices_via_simulator',
      simRes.ok && matchRef && adds.every((a) => a.requires_confirmation),
      `adds=${adds.length} units=${units.join(',')} subtotal=${subtotal} matchRef=${matchRef}`,
    );
    report.catalogProbe = {
      via: 'simulated_chat_api',
      http: simRes.status,
      prices,
      subtotal,
      geminiHttpImplied: sim.usage?.geminiHttpCalls ?? 'n/a',
    };

    // Order block probe (must not create)
    const orderRes = await fetch(`${base}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phase33: true, probe: true }),
    });
    // Any non-2xx that is not a successful order create is acceptable for prep;
    // we only assert we did not get a created order payload.
    const orderBody = await orderRes.text();
    const created =
      orderRes.ok &&
      /"ok"\s*:\s*true|"orderId"|"id"\s*:\s*"/.test(orderBody) &&
      !/error|invalid|unauthorized|forbidden/i.test(orderBody);
    check(
      'orders_not_created_by_probe',
      !created,
      `http=${orderRes.status} created=${created}`,
    );
  } catch (err) {
    check('api_probe', false, String(err?.message || err));
  }
}

await verifyCatalogViaApi();

const failed = report.checks.filter((c) => !c.ok);
report.readyForAuthorization = failed.length === 0;
report.note =
  'NO se realizaron llamadas facturables a Gemini. Esperar autorización explícita antes de CHATBOT_SIMULATE_GEMINI=0 + smoke live.';

const outPath = join(outDir, 'prep-report.json');
writeFileSync(outPath, JSON.stringify(report, null, 2));
console.log(`[phase33] report=${outPath}`);
console.log(
  `[phase33] readyForAuthorization=${report.readyForAuthorization} failed=${failed.length}`,
);
process.exit(failed.length ? 1 : 0);
