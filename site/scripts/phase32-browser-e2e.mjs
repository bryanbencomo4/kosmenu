/**
 * Fase 3.2 — real browser E2E with Playwright (Chromium).
 * Gemini: simulated only. Blocks POST /api/orders. No deploy.
 *
 * Usage (from site/):
 *   node scripts/phase32-browser-e2e.mjs
 */
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const outDir = join(root, '.data', 'phase32-screenshots');
mkdirSync(outDir, { recursive: true });

const BASE = process.env.PHASE32_BASE_URL || 'http://127.0.0.1:3000';
const PREVIEW = `${BASE}/preview/dev-chatbot-trueno`;

function log(step, msg) {
  console.log(`[phase32] ${step}: ${msg}`);
}

async function loadPlaywright() {
  try {
    return require('playwright');
  } catch {
    try {
      return require('@playwright/test');
    } catch {
      return null;
    }
  }
}

async function sendChat(page, text) {
  const input = page.locator('#chatbot-composer-input');
  await input.click();
  await input.fill(text);
  await page.locator('button[aria-label="Enviar mensaje"]').click();
  await page
    .waitForFunction(
      () =>
        document
          .querySelector('[data-chatbot-preview="1"]')
          ?.getAttribute('data-chatbot-typing') === '1',
      null,
      { timeout: 5000 },
    )
    .catch(() => {});
  await page.waitForFunction(
    () =>
      document
        .querySelector('[data-chatbot-preview="1"]')
        ?.getAttribute('data-chatbot-typing') === '0',
    null,
    { timeout: 20000 },
  );
  await page.waitForTimeout(250);
}

async function confirmAllPending(page) {
  const buttons = page.locator('button[data-chat-confirm-action="propose_add"]');
  const n = await buttons.count();
  for (let i = 0; i < n; i++) {
    // Always click the first remaining unconfirmed button
    const btn = page.locator('button[data-chat-confirm-action="propose_add"]').first();
    if ((await btn.count()) === 0) break;
    await btn.click({ force: true });
    await page.waitForTimeout(350);
  }
  return n;
}

async function main() {
  const pw = await loadPlaywright();
  if (!pw) {
    console.error(
      'BLOQUEO: Playwright no está instalado. Ejecuta: npm i -D playwright && npx playwright install chromium',
    );
    process.exit(2);
  }

  const { chromium } = pw;
  const browser = await chromium.launch({ headless: true });
  const results = {
    startedAt: new Date().toISOString(),
    base: PREVIEW,
    ordersBlocked: 0,
    ordersAttempted: 0,
    steps: [],
    screenshots: [],
    cartAfterConfirm: null,
    checkoutLines: null,
    errors: [],
    consoleErrors: [],
  };

  const record = (name, ok, detail) => {
    results.steps.push({ name, ok, detail });
    log(name, ok ? `OK — ${detail}` : `FAIL — ${detail}`);
  };

  async function shot(page, name) {
    const path = join(outDir, `${name}.png`);
    await page.screenshot({ path, fullPage: true });
    results.screenshots.push(path);
    return path;
  }

  // Desktop run
  {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
    });
    await context.route('**/api/orders**', async (route) => {
      results.ordersAttempted += 1;
      results.ordersBlocked += 1;
      await route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: false,
          error: 'phase32_orders_blocked',
          message: 'Pedidos bloqueados en prueba Fase 3.2',
        }),
      });
    });
    const page = await context.newPage();
    page.on('pageerror', (err) => results.errors.push(String(err)));
    page.on('console', (msg) => {
      if (msg.type() === 'error') results.consoleErrors.push(msg.text());
    });

    await page.goto(PREVIEW, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForSelector('[data-chatbot-preview="1"]', { timeout: 30000 });
    // Ensure React hydrated: composer should be editable
    await page.waitForSelector('#chatbot-composer-input:not([disabled])', {
      timeout: 15000,
    });
    const runtime = await page.getAttribute(
      '[data-chatbot-preview="1"]',
      'data-chatbot-runtime',
    );
    record('open_preview', runtime === '1', `runtime=${runtime}`);
    await shot(page, '01-desktop-welcome');

    // Clear stale history via overflow menu → Nueva conversación
    const more = page.locator('button[aria-label="Más opciones"]');
    if (await more.count()) {
      await more.click();
      const reset = page.getByRole('menuitem', { name: /Nueva conversación/i });
      if (await reset.count()) await reset.click();
      await page.waitForTimeout(300);
    }

    await sendChat(
      page,
      'Quiero dos pizzas Hawaianas, una Normal y otra Grande',
    );
    await page.waitForSelector('[data-chat-cart-action="propose_add"]', {
      timeout: 20000,
    });
    const cards = await page.locator('[data-chat-cart-action="propose_add"]').count();
    record('scenario_a_cards', cards >= 2, `propose_add cards=${cards}`);
    await shot(page, '02-desktop-two-hawaianas-proposals');

    const confirmed = await confirmAllPending(page);
    await page.waitForTimeout(500);
    const cartCount = Number(
      (await page.getAttribute('[data-chatbot-preview="1"]', 'data-cart-count')) ||
        '0',
    );
    record(
      'confirm_proposals',
      confirmed >= 2 && cartCount >= 2,
      `clicks=${confirmed} cartCount=${cartCount}`,
    );
    await shot(page, '03-desktop-after-confirm');

    // Drink
    await sendChat(page, 'Agrega una bebida');
    await page.waitForTimeout(900);
    const drinkText = await page.locator('[data-chat-role="assistant"]').last().innerText();
    record('scenario_b_drink', /cuál|Coca|Agua|bebida/i.test(drinkText), drinkText.slice(0, 120));

    // Prefer an Agregar button on a drink card; else ask for Agua (exists in Trueno).
    const addSimple = page.locator('[data-chat-product-card] button:has-text("Agregar")');
    if ((await addSimple.count()) > 0) {
      await addSimple.first().click({ force: true });
      await page.waitForTimeout(400);
    } else {
      await sendChat(page, 'Agrega un Agua 200');
      await page.waitForTimeout(600);
      const drinkAdds = page.locator(
        'button[data-chat-confirm-action="propose_add"]',
      );
      if ((await drinkAdds.count()) > 0) {
        await drinkAdds.first().click({ force: true });
        await page.waitForTimeout(400);
      }
    }
    const cartAfterDrink = Number(
      (await page.getAttribute('[data-chatbot-preview="1"]', 'data-cart-count')) ||
        '0',
    );
    record('add_drink', cartAfterDrink >= 3, `cartCount=${cartAfterDrink}`);
    await shot(page, '04-desktop-after-drink');

    // Remove Grande
    await sendChat(page, 'Quita la pizza Grande');
    await page.waitForTimeout(800);
    const rm = page.locator('button[data-chat-confirm-action="propose_remove"]');
    if ((await rm.count()) > 0) {
      await rm.first().click({ force: true });
      await page.waitForTimeout(400);
    }
    const cartAfterRm = Number(
      (await page.getAttribute('[data-chatbot-preview="1"]', 'data-cart-count')) ||
        '0',
    );
    record('remove_grande', cartAfterRm >= 1 && cartAfterRm < cartAfterDrink, `cartCount=${cartAfterRm}`);

    // Switch to traditional menu
    await page.getByRole('button', { name: /Ver menú|Menú/i }).first().click();
    await page.waitForSelector('[data-preview-mode="menu"]', { timeout: 10000 });
    const menuLines = await page.locator('[data-cart-key]').count();
    record('traditional_menu', menuLines >= 1, `lines=${menuLines}`);
    await shot(page, '05-desktop-traditional-menu');

    // Modify quantity (+ on first line)
    const inc = page.locator('[data-cart-inc]').first();
    if ((await inc.count()) > 0) {
      const before = Number(
        (await page.locator('[data-cart-key]').first().getAttribute('data-cart-qty')) ||
          '0',
      );
      await inc.click();
      await page.waitForTimeout(200);
      const after = Number(
        (await page.locator('[data-cart-key]').first().getAttribute('data-cart-qty')) ||
          '0',
      );
      record('modify_qty', after === before + 1, `qty ${before}→${after}`);
    } else {
      record('modify_qty', false, 'no inc button');
    }

    // Back to chat — history + cart preserved
    await page.getByRole('button', { name: /Volver al chat/i }).click();
    await page.waitForSelector('[data-chatbot-preview="1"]', { timeout: 10000 });
    const hist = await page.locator('[data-chat-role="user"]').count();
    const cartBack = Number(
      (await page.getAttribute('[data-chatbot-preview="1"]', 'data-cart-count')) ||
        '0',
    );
    record('back_to_chat', hist >= 1 && cartBack >= 1, `users=${hist} cart=${cartBack}`);
    results.cartAfterConfirm = cartBack;
    await shot(page, '06-desktop-back-chat');

    // Checkout via header cart or Continuar pedido / menú tradicional
    let checkoutVisible = false;
    const openCartHeader = page.locator('[data-open-cart="1"]');
    if ((await openCartHeader.count()) > 0) {
      await openCartHeader.first().click({ force: true });
      await page
        .waitForSelector('[data-checkout-preview="1"]', { timeout: 5000 })
        .catch(() => {});
    }
    if ((await page.locator('[data-checkout-preview="1"]').count()) === 0) {
      const continuar = page.getByRole('button', { name: /^Continuar pedido$/i });
      if ((await continuar.count()) > 0) {
        await continuar.first().click({ force: true });
        await page.waitForTimeout(500);
      }
    }
    if ((await page.locator('[data-checkout-preview="1"]').count()) === 0) {
      // Fall back: traditional menu → open checkout
      const verMenu = page.getByRole('button', { name: /Ver menú|Menú/i });
      if ((await verMenu.count()) > 0) {
        await verMenu.first().click({ force: true });
        await page.waitForSelector('[data-preview-mode="menu"]', {
          timeout: 8000,
        });
      }
      if ((await page.locator('[data-open-checkout="1"]').count()) > 0) {
        await page.locator('[data-open-checkout="1"]').click({ force: true });
        await page
          .waitForSelector('[data-checkout-preview="1"]', { timeout: 8000 })
          .catch(() => {});
      }
    }
    checkoutVisible =
      (await page.locator('[data-checkout-preview="1"]').count()) > 0;
    record('open_checkout', checkoutVisible, `visible=${checkoutVisible}`);
    if (checkoutVisible) {
      results.checkoutLines = await page
        .locator('[data-checkout-preview="1"] li')
        .allTextContents();
      await shot(page, '07-desktop-checkout');
      await page.locator('[data-checkout-preview="1"] button').last().click({
        force: true,
      });
      await page.waitForTimeout(300);
    }

    // Try to hit orders API (must be blocked)
    const orderProbe = await page.evaluate(async () => {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ probe: true }),
      });
      return { status: res.status, body: await res.text() };
    });
    record(
      'orders_blocked',
      orderProbe.status === 403 && /phase32_orders_blocked/.test(orderProbe.body),
      `status=${orderProbe.status}`,
    );

    // Sheet direct-add: open configure from a needs_options product if any
    // Use chat to request Hawaiana without size → configure in sheet
    await page.keyboard.press('Escape').catch(() => {});
    if ((await page.locator('[data-preview-mode="menu"]').count()) > 0) {
      await page.getByRole('button', { name: /Volver al chat/i }).click();
      await page.waitForSelector('[data-chatbot-preview="1"]');
    }
    const cartBeforeSheet = Number(
      (await page.getAttribute('[data-chatbot-preview="1"]', 'data-cart-count')) ||
        '0',
    );
    await sendChat(page, 'Quiero una Hawaiana');
    const cfgBtn = page.locator('[data-chat-configure]').first();
    await page.waitForTimeout(400);
    if ((await cfgBtn.count()) > 0) {
      await cfgBtn.click({ force: true });
      await page.waitForSelector('[data-product-options-confirm="1"]', {
        timeout: 10000,
      });
      const opt = page
        .locator('[data-option-group] button, [data-option-group] [role="button"], [data-option-group] label')
        .first();
      if ((await opt.count()) > 0) await opt.click({ force: true });
      await page.waitForTimeout(250);
      const confirmBtn = page.locator('[data-product-options-confirm="1"]');
      // Retry once if still disabled (selection pending)
      if (await confirmBtn.isDisabled()) {
        const alt = page.locator('[data-option-group] button').nth(0);
        if ((await alt.count()) > 0) await alt.click({ force: true });
        await page.waitForTimeout(200);
      }
      await confirmBtn.click({ force: true });
      await page.waitForTimeout(600);
      const cartAfterSheet = Number(
        (await page.getAttribute('[data-chatbot-preview="1"]', 'data-cart-count')) ||
          '0',
      );
      const secondConfirm = await page
        .getByText(/revisa la configuración y confirma/i)
        .count();
      const appliedNotice = await page
        .locator('[data-chat-applied="1"]')
        .count();
      record(
        'sheet_direct_add',
        cartAfterSheet > cartBeforeSheet && secondConfirm === 0,
        `cart ${cartBeforeSheet}→${cartAfterSheet} secondConfirm=${secondConfirm} applied=${appliedNotice}`,
      );
      await shot(page, '08-desktop-sheet-direct-add');
    } else {
      record(
        'sheet_direct_add',
        false,
        'no data-chat-configure button (Hawaiana may have been auto-proposed)',
      );
    }

    await context.close();
  }

  // Mobile viewport
  {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    await context.route('**/api/orders**', async (route) => {
      results.ordersAttempted += 1;
      results.ordersBlocked += 1;
      await route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({ ok: false, error: 'phase32_orders_blocked' }),
      });
    });
    const page = await context.newPage();
    await page.goto(PREVIEW, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForSelector('#chatbot-composer-input', { timeout: 30000 });
    const moreM = page.locator('button[aria-label="Más opciones"]');
    if (await moreM.count()) {
      await moreM.click();
      const reset = page.getByRole('menuitem', { name: /Nueva conversación/i });
      if (await reset.count()) await reset.click();
    }
    await sendChat(
      page,
      'Quiero dos pizzas Hawaianas, una Normal y otra Grande',
    );
    await page.waitForSelector('[data-chat-cart-action="propose_add"]', {
      timeout: 20000,
    });
    await confirmAllPending(page);
    await page.waitForTimeout(400);
    const cartCount = Number(
      (await page.getAttribute('[data-chatbot-preview="1"]', 'data-cart-count')) ||
        '0',
    );
    record('mobile_confirm', cartCount >= 2, `cartCount=${cartCount}`);
    await shot(page, '09-mobile-390-after-confirm');

    // Smaller phone
    await page.setViewportSize({ width: 360, height: 740 });
    await page.waitForTimeout(200);
    const composerBox = await page.locator('#chatbot-composer-input').boundingBox();
    record(
      'mobile_composer_visible',
      Boolean(composerBox && composerBox.y + composerBox.height <= 740),
      `composerY=${composerBox?.y}`,
    );
    await shot(page, '10-mobile-360-composer');
    await context.close();
  }

  await browser.close();

  const reportPath = join(outDir, 'report.json');
  writeFileSync(reportPath, JSON.stringify(results, null, 2));
  log('report', reportPath);

  const failed = results.steps.filter((s) => !s.ok);
  if (failed.length) {
    console.error('[phase32] FAILED steps:', failed.map((f) => f.name).join(', '));
    process.exit(1);
  }
  console.log('[phase32] ALL STEPS PASSED');
  console.log(
    `[phase32] ordersBlocked=${results.ordersBlocked} screenshots=${results.screenshots.length}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
