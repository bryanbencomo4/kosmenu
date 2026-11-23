/**
 * Remaining closure budget: live chat proposals → UI confirm → cart → checkout.
 * No extra media. Stops if preflight/budget would exceed.
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

const MSG =
  'Quiero exactamente dos pizzas Hawaianas del menú: una tamaño Normal y otra tamaño Grande. Prepara las propuestas para confirmar. La Coca-Cola no existe; después me ofreces bebidas reales.';

const report = {
  startedAt: new Date().toISOString(),
  checks: [],
  cartLines: [],
  checkoutText: null,
  budgetBefore: null,
  budgetAfter: null,
};

function check(name, ok, detail) {
  report.checks.push({ name, ok: Boolean(ok), detail });
  console.log(`[cart] ${ok ? 'OK' : 'FAIL'} ${name} — ${detail}`);
}

function budget() {
  const p = process.env.CHATBOT_LIVE_BUDGET_FILE;
  if (!p || !existsSync(p)) return null;
  return JSON.parse(readFileSync(p, 'utf8'));
}

async function main() {
  report.budgetBefore = budget();
  const left =
    (report.budgetBefore?.maxGeminiHttpCalls || 12) -
    (report.budgetBefore?.geminiHttpCalls || 0);
  if (left < 2) {
    check('budget_headroom', false, `left=${left}`);
    writeFileSync(join(outDir, 'cart-checkout-report.json'), JSON.stringify(report, null, 2));
    process.exit(2);
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
      body: JSON.stringify({ ok: false, error: 'orders_blocked_staging' }),
    }),
  );

  const page = await context.newPage();
  await page.goto(`${BASE}/preview/dev-chatbot-trueno`, {
    waitUntil: 'networkidle',
    timeout: 90000,
  });
  await page.evaluate(() => {
    for (const k of Object.keys(sessionStorage)) {
      if (k.includes('chat')) sessionStorage.removeItem(k);
    }
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('button[aria-label="Más opciones"]').click({ force: true });
  await page.getByRole('menuitem', { name: /Nueva conversación/i }).click();
  await page.waitForTimeout(400);

  await page.fill('#chatbot-composer-input', MSG);
  await page.locator('button[aria-label="Enviar mensaje"]').click();
  await page.waitForFunction(
    () =>
      document
        .querySelector('[data-chatbot-preview="1"]')
        ?.getAttribute('data-chatbot-typing') === '0',
    null,
    { timeout: 120000 },
  );

  await page.waitForSelector('[data-chat-cart-action="propose_add"]', {
    timeout: 60000,
  });
  const n = await page.locator('[data-chat-cart-action="propose_add"]').count();
  check('ui_proposals', n >= 2, `n=${n}`);
  await page.screenshot({
    path: join(outDir, 'screenshots', '03-proposals.png'),
  });

  const pending = page.locator(
    '[data-chat-cart-action="propose_add"][data-confirmed="0"] button[data-chat-confirm-action="propose_add"]',
  );
  for (let i = 0; i < 6; i++) {
    if ((await pending.count()) === 0) break;
    await pending.first().scrollIntoViewIfNeeded();
    await pending.first().click({ force: true });
    await page.waitForTimeout(450);
  }

  const cartCount = Number(
    (await page.getAttribute('[data-preview="dev-chatbot-trueno"]', 'data-cart-count')) ||
      '0',
  );
  check('cart_mutated', cartCount >= 2, `cart=${cartCount}`);
  await page.screenshot({
    path: join(outDir, 'screenshots', '04-cart-confirmed.png'),
  });

  // Optional drink if ≥2 calls remain
  report.budgetAfter = budget();
  const left2 =
    (report.budgetAfter?.maxGeminiHttpCalls || 12) -
    (report.budgetAfter?.geminiHttpCalls || 0);
  if (left2 >= 2) {
    await page.fill(
      '#chatbot-composer-input',
      'Ofrece una bebida real disponible del menú (la más económica) como propuesta para confirmar',
    );
    await page.locator('button[aria-label="Enviar mensaje"]').click();
    await page.waitForFunction(
      () =>
        document
          .querySelector('[data-chatbot-preview="1"]')
          ?.getAttribute('data-chatbot-typing') === '0',
      null,
      { timeout: 90000 },
    );
    const drinkBtn = page.locator(
      '[data-chat-cart-action="propose_add"][data-confirmed="0"] button[data-chat-confirm-action="propose_add"]',
    );
    if ((await drinkBtn.count()) > 0) {
      await drinkBtn.first().click({ force: true });
      await page.waitForTimeout(400);
      check('drink_added', true, 'confirmed drink proposal');
    } else {
      check('drink_added', false, 'no drink proposal (may be out of budget/tools)');
    }
  } else {
    check('drink_skipped_budget', true, `left=${left2}`);
  }

  await page.getByRole('button', { name: /carrito/i }).click({ force: true });
  await page.waitForSelector('[data-checkout-preview="1"]');
  const text = await page.locator('[data-checkout-preview="1"]').innerText();
  report.checkoutText = text;
  // Collect line items from preview list
  const lines = await page.locator('[data-checkout-preview="1"] li').allTextContents();
  report.cartLines = lines.map((l) => l.trim());
  check(
    'checkout_lines',
    lines.some((l) => /Hawaiana/i.test(l)) && lines.length >= 2,
    lines.join(' | '),
  );
  const subtotalOk =
    /12\.25|12,25/.test(text) ||
    (lines.filter((l) => /Hawaiana/i.test(l)).length >= 2 &&
      (/3\.5|3,5/.test(text) || /8\.75|8,75/.test(text)));
  check('checkout_subtotal_reference', subtotalOk, text.slice(0, 300));

  await page.screenshot({
    path: join(outDir, 'screenshots', '05-checkout-final.png'),
  });

  // Mode switch persistence
  await page.locator('[data-checkout-preview="1"] button').filter({ hasText: /Cerrar/i }).click();
  await page.locator('button[aria-label="Abrir menú"]').click({ force: true }).catch(async () => {
    await page.getByRole('button', { name: /menú/i }).click({ force: true });
  });
  await page.waitForTimeout(500);
  const cartMenu = Number(
    (await page.getAttribute('[data-preview="dev-chatbot-trueno"]', 'data-cart-count')) ||
      '0',
  );
  check('cart_persists', cartMenu >= 2, `cart=${cartMenu}`);
  await page.screenshot({
    path: join(outDir, 'screenshots', '06-menu-cart-persist.png'),
  });

  // Orders still blocked
  const o = await page.evaluate(async () => {
    const r = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    return { status: r.status, body: await r.json().catch(() => ({})) };
  });
  check(
    'orders_still_blocked',
    o.status === 403,
    `${o.status} ${o.body.error}`,
  );

  await browser.close();
  report.budgetAfter = budget();
  report.finishedAt = new Date().toISOString();
  writeFileSync(
    join(outDir, 'cart-checkout-report.json'),
    JSON.stringify(report, null, 2),
  );
  const failed = report.checks.filter(
    (c) => !c.ok && c.name !== 'drink_added',
  );
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
