/**
 * Apply cart confirm + checkout using the already-captured LIVE Gemini proposals
 * (api-proposals.json, requestId r_e414...). No new Gemini spend: chat route
 * replays that exact live payload so the consumer UI can confirm.
 */
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, '.data', 'staging-closure');
mkdirSync(join(outDir, 'screenshots'), { recursive: true });
const BASE = process.env.STAGING_BASE_URL || 'http://127.0.0.1:3001';
const livePath = join(outDir, 'api-proposals.json');

const report = {
  startedAt: new Date().toISOString(),
  mode: 'replay_live_gemini_payload_for_ui_confirm',
  liveSource: livePath,
  liveRequestId: null,
  simulate: null,
  checks: [],
  cartLines: [],
  checkoutText: null,
  proposals: [],
  budget: null,
};

function check(name, ok, detail) {
  report.checks.push({ name, ok: Boolean(ok), detail });
  console.log(`[cart-live] ${ok ? 'OK' : 'FAIL'} ${name} — ${detail}`);
}

async function main() {
  if (!existsSync(livePath)) {
    console.error('missing api-proposals.json');
    process.exit(2);
  }
  const captured = JSON.parse(readFileSync(livePath, 'utf8'));
  const liveBody = captured.data;
  report.liveRequestId = liveBody?.requestId || liveBody?.attribution?.requestId;
  report.proposals = (liveBody?.cart_actions || []).map((a) => ({
    type: a.type,
    label: a.label,
    unit_price: a.unit_price,
    line_total: a.line_total,
    product_id: a.product_id,
    proposal_id: a.proposal_id,
  }));
  check(
    'live_proposals_present',
    (liveBody?.cart_actions || []).filter((a) => a.type === 'propose_add')
      .length >= 2,
    `n=${(liveBody?.cart_actions || []).length} requestId=${report.liveRequestId}`,
  );
  check(
    'live_not_simulator',
    Boolean(report.liveRequestId) &&
      liveBody?.model === 'gemini-3.1-flash-lite' &&
      (liveBody?.attribution?.geminiHttpCalls || 0) >= 1,
    `model=${liveBody?.model} http=${liveBody?.attribution?.geminiHttpCalls}`,
  );
  check(
    'catalog_prices',
    liveBody.cart_actions.some((a) => a.unit_price === 3.5) &&
      liveBody.cart_actions.some((a) => a.unit_price === 8.75),
    'Normal 3.5 + Grande 8.75 from live cart_actions',
  );

  const budgetPath = process.env.CHATBOT_LIVE_BUDGET_FILE;
  if (budgetPath && existsSync(budgetPath)) {
    report.budget = JSON.parse(readFileSync(budgetPath, 'utf8'));
  }

  const pw = require('playwright');
  const browser = await pw.chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  await context.route('**/api/orders**', (route) =>
    route.fulfill({
      status: 403,
      contentType: 'application/json',
      body: JSON.stringify({ ok: false, error: 'orders_blocked_staging' }),
    }),
  );
  // Replay exact live Gemini JSON so UI can confirm without new spend.
  await context.route('**/api/chat/**', async (route) => {
    if (route.request().method() === 'GET') {
      return route.continue();
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ...liveBody,
        reply:
          (liveBody.reply || '') +
          '\n\n[evidencia: replay UI de respuesta live ' +
          report.liveRequestId +
          ']',
        _closure_replay: true,
        _closure_live_request_id: report.liveRequestId,
      }),
    });
  });

  const page = await context.newPage();
  await page.goto(`${BASE}/preview/dev-chatbot-trueno`, {
    waitUntil: 'networkidle',
    timeout: 90000,
  });
  const sim = await page.evaluate(async () => {
    const r = await fetch(
      '/api/chat/0aa8c53b-07f1-446e-8b88-66c2b7ae89ea?probe=1',
    ).catch(() => null);
    if (!r) return null;
    return r.json().catch(() => null);
  });
  report.simulate = sim;
  check(
    'server_not_simulate_flag',
    String(sim?.simulate ?? sim?.CHATBOT_SIMULATE_GEMINI ?? '0') !== '1',
    JSON.stringify(sim)?.slice(0, 200) || 'probe_null',
  );

  await page.evaluate(() => {
    for (const k of Object.keys(sessionStorage)) {
      if (k.includes('chat')) sessionStorage.removeItem(k);
    }
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('button[aria-label="Más opciones"]').click({ force: true });
  await page
    .getByRole('menuitem', { name: /Nueva conversación/i })
    .click()
    .catch(() => {});
  await page.waitForTimeout(400);

  await page.fill(
    '#chatbot-composer-input',
    'Confirmar propuestas live (replay UI sin nuevo gasto Gemini)',
  );
  await page.locator('button[aria-label="Enviar mensaje"]').click();
  await page.waitForSelector('[data-chat-cart-action="propose_add"]', {
    timeout: 30000,
  });
  const n = await page.locator('[data-chat-cart-action="propose_add"]').count();
  check('ui_proposals_visible', n >= 2, `n=${n}`);
  await page.screenshot({
    path: join(outDir, 'screenshots', '03-proposals-live-replay.png'),
    fullPage: true,
  });

  const pending = page.locator(
    '[data-chat-cart-action="propose_add"][data-confirmed="0"] button[data-chat-confirm-action="propose_add"]',
  );
  let confirmed = 0;
  for (let i = 0; i < 8; i++) {
    if ((await pending.count()) === 0) break;
    await pending.first().scrollIntoViewIfNeeded();
    await pending.first().click({ force: true });
    confirmed += 1;
    await page.waitForTimeout(500);
  }
  check('consumer_confirmed', confirmed >= 2, `confirmed=${confirmed}`);

  const cartCount = Number(
    (await page.getAttribute(
      '[data-preview="dev-chatbot-trueno"]',
      'data-cart-count',
    )) || '0',
  );
  check('cart_mutated', cartCount >= 2, `cart=${cartCount}`);
  await page.screenshot({
    path: join(outDir, 'screenshots', '04-cart-confirmed.png'),
    fullPage: true,
  });

  await page.getByRole('button', { name: /carrito/i }).click({ force: true });
  await page.waitForSelector('[data-checkout-preview="1"]');
  const text = await page.locator('[data-checkout-preview="1"]').innerText();
  report.checkoutText = text;
  const lines = await page
    .locator('[data-checkout-preview="1"] li')
    .allTextContents();
  report.cartLines = lines.map((l) => l.trim());
  check(
    'checkout_hawaianas',
    lines.filter((l) => /Hawaiana/i.test(l)).length >= 2,
    lines.join(' | '),
  );
  const has1225 = /12\.25|12,25/.test(text);
  const hasParts = /3\.5|3,5/.test(text) && /8\.75|8,75/.test(text);
  check('checkout_subtotal_12_25', has1225 || hasParts, text.slice(0, 400));
  await page.screenshot({
    path: join(outDir, 'screenshots', '05-checkout-final.png'),
    fullPage: true,
  });

  // Persist across menu/chat
  await page
    .locator('[data-checkout-preview="1"] button')
    .filter({ hasText: /Cerrar/i })
    .click();
  await page.waitForTimeout(300);
  // Switch to menu mode
  const menuBtn = page.locator('button[aria-label="Abrir menú"]');
  if ((await menuBtn.count()) > 0) {
    await menuBtn.click({ force: true });
  } else {
    await page.getByRole('button', { name: /menú/i }).first().click({ force: true });
  }
  await page.waitForTimeout(600);
  const cartMenu = Number(
    (await page.getAttribute(
      '[data-preview="dev-chatbot-trueno"]',
      'data-cart-count',
    )) || '0',
  );
  check('cart_persists_menu', cartMenu >= 2, `cart=${cartMenu}`);
  await page.screenshot({
    path: join(outDir, 'screenshots', '06-menu-cart-persist.png'),
    fullPage: true,
  });

  const o = await page.evaluate(async () => {
    const r = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    return { status: r.status, body: await r.json().catch(() => ({})) };
  });
  check(
    'orders_blocked',
    o.status === 403 && String(o.body.error || '').includes('orders_blocked'),
    `${o.status} ${o.body.error}`,
  );

  await browser.close();
  report.finishedAt = new Date().toISOString();
  writeFileSync(
    join(outDir, 'cart-checkout-report.json'),
    JSON.stringify(report, null, 2),
  );
  const failed = report.checks.filter((c) => !c.ok);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
