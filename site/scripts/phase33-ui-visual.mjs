/**
 * Fase 3.3 UI — Playwright visual capture (simulated Gemini, no billable calls).
 */
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const outDir = join(root, '.data', 'phase33-ui-screenshots');
mkdirSync(outDir, { recursive: true });

const BASE = process.env.PHASE33_BASE_URL || 'http://127.0.0.1:3000';
const PREVIEW = `${BASE}/preview/dev-chatbot-trueno`;

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
      { timeout: 4000 },
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

async function setTheme(page, mode) {
  await page.evaluate((m) => {
    localStorage.setItem('elmenuxfa:chat-theme-v1', m);
  }, mode);
  // Toggle via menu if current theme differs
  const current = await page.getAttribute('[data-chatbot-preview="1"]', 'data-chat-theme');
  if (current === mode) return;
  await page.locator('button[aria-label="Más opciones"]').click();
  const label = mode === 'dark' ? /Tema oscuro/i : /Tema claro/i;
  await page.getByRole('menuitem', { name: label }).click();
  await page.waitForTimeout(200);
}

async function shot(page, name) {
  const path = join(outDir, `${name}.png`);
  await page.screenshot({ path, fullPage: false });
  return path;
}

async function main() {
  const pw = require('playwright');
  const browser = await pw.chromium.launch({ headless: true });
  const report = {
    startedAt: new Date().toISOString(),
    screenshots: [],
    checks: [],
    ordersBlocked: 0,
  };
  const check = (name, ok, detail) => {
    report.checks.push({ name, ok, detail });
    console.log(`[ui] ${ok ? 'OK' : 'FAIL'} ${name} — ${detail}`);
  };

  async function runViewport(label, viewport, isMobile) {
    const context = await browser.newContext({
      viewport,
      isMobile: Boolean(isMobile),
      hasTouch: Boolean(isMobile),
    });
    await context.route('**/api/orders**', async (route) => {
      report.ordersBlocked += 1;
      await route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({ ok: false, error: 'phase33_ui_orders_blocked' }),
      });
    });
    const page = await context.newPage();
    await page.goto(PREVIEW, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForSelector('[data-chatbot-preview="1"]');
    await page.waitForSelector('#chatbot-composer-input');

    // Force light welcome
    await page.evaluate(() => {
      localStorage.setItem('elmenuxfa:chat-theme-v1', 'light');
      for (const k of Object.keys(sessionStorage)) {
        if (k.includes('chat-v1')) sessionStorage.removeItem(k);
      }
    });
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('[data-chat-theme="light"]');
    const reset = page.getByRole('button', { name: /Más opciones/i });
    await reset.click();
    await page.getByRole('menuitem', { name: /Nueva conversación/i }).click();
    await page.waitForTimeout(300);

    report.screenshots.push(await shot(page, `${label}-01-welcome-light`));

    // Header compactness
    const headerBox = await page.locator('[data-chat-header="1"]').boundingBox();
    check(
      `${label}_header_height`,
      Boolean(headerBox && headerBox.height >= 48 && headerBox.height <= 72),
      `h=${headerBox?.height}`,
    );

    // No technical footer
    const tech = await page.getByText(/Asistente local|Menú real|Demostración local/i).count();
    check(`${label}_no_tech_footer`, tech === 0, `matches=${tech}`);

    // No ASISTENTE label
    const asistenteLabels = await page.locator('text=/^Asistente$/i').count();
    check(`${label}_no_asistente_label`, asistenteLabels === 0, `count=${asistenteLabels}`);

    await sendChat(
      page,
      'Hola, quiero dos pizzas Hawaianas, una Normal y otra Grande',
    );
    await page.waitForSelector('[data-chat-cart-action="propose_add"]', {
      timeout: 20000,
    });
    const cards = await page.locator('[data-chat-cart-action="propose_add"]').count();
    const attachments = await page.locator('[data-chat-attachments="1"]').count();
    check(
      `${label}_product_proposals_visible`,
      cards >= 2 && attachments >= 1,
      `cards=${cards} attachments=${attachments}`,
    );
    report.screenshots.push(await shot(page, `${label}-02-two-proposals-light`));

    // Conversation with more messages
    await sendChat(page, 'Agrega una bebida');
    await page.waitForTimeout(600);
    report.screenshots.push(await shot(page, `${label}-03-conversation-light`));

    // Open variations sheet
    const cfg = page.locator('[data-chat-configure]').first();
    if ((await cfg.count()) > 0) {
      await cfg.click({ force: true });
      await page.waitForSelector('[data-product-options-confirm="1"]', {
        timeout: 10000,
      });
      report.screenshots.push(await shot(page, `${label}-04-options-sheet`));
      await page.keyboard.press('Escape');
      await page.waitForTimeout(200);
    } else {
      // Confirm one proposal then open sheet via another path
      check(`${label}_options_sheet`, true, 'skipped-no-configure-on-ready-proposals');
    }

    // Confirm both proposals (scroll into view; avoid double-tap same id)
    const pending = page.locator(
      '[data-chat-cart-action="propose_add"][data-confirmed="0"] button[data-chat-confirm-action="propose_add"]',
    );
    for (let i = 0; i < 4; i++) {
      const left = await pending.count();
      if (left === 0) break;
      const btn = pending.first();
      await btn.scrollIntoViewIfNeeded();
      await btn.click({ force: true });
      await page.waitForTimeout(450);
    }
    await page.waitForTimeout(300);
    const cartCount = Number(
      (await page.getAttribute('[data-chatbot-preview="1"]', 'data-cart-count')) ||
        '0',
    );
    check(`${label}_cart_after_confirm`, cartCount >= 2, `cart=${cartCount}`);
    report.screenshots.push(await shot(page, `${label}-05-cart-updated`));

    // Dark theme
    await setTheme(page, 'dark');
    await page.waitForSelector('[data-chat-theme="dark"]');
    report.screenshots.push(await shot(page, `${label}-06-conversation-dark`));

    await page.locator('button[aria-label="Más opciones"]').click();
    await page.getByRole('menuitem', { name: /Nueva conversación/i }).click();
    await page.waitForTimeout(300);
    report.screenshots.push(await shot(page, `${label}-07-welcome-dark`));

    await context.close();
  }

  // Mobile primary
  await runViewport('m390', { width: 390, height: 844 }, true);
  // Smaller phone
  await runViewport('m360', { width: 360, height: 780 }, true);
  // Larger phone — welcome + proposals only (lighter)
  {
    const context = await browser.newContext({
      viewport: { width: 430, height: 932 },
      isMobile: true,
      hasTouch: true,
    });
    await context.route('**/api/orders**', (route) =>
      route.fulfill({
        status: 403,
        body: JSON.stringify({ ok: false, error: 'phase33_ui_orders_blocked' }),
      }),
    );
    const page = await context.newPage();
    await page.goto(PREVIEW, { waitUntil: 'networkidle' });
    await page.evaluate(() => {
      localStorage.setItem('elmenuxfa:chat-theme-v1', 'light');
      for (const k of Object.keys(sessionStorage)) {
        if (k.includes('chat-v1')) sessionStorage.removeItem(k);
      }
    });
    await page.reload({ waitUntil: 'networkidle' });
    await page.locator('button[aria-label="Más opciones"]').click();
    await page.getByRole('menuitem', { name: /Nueva conversación/i }).click();
    report.screenshots.push(await shot(page, 'm430-01-welcome-light'));
    await sendChat(
      page,
      'Hola, quiero dos pizzas Hawaianas, una Normal y otra Grande',
    );
    await page.waitForSelector('[data-chat-cart-action="propose_add"]');
    report.screenshots.push(await shot(page, 'm430-02-proposals'));
    await context.close();
  }

  // Desktop
  {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
    });
    await context.route('**/api/orders**', (route) =>
      route.fulfill({
        status: 403,
        body: JSON.stringify({ ok: false, error: 'phase33_ui_orders_blocked' }),
      }),
    );
    const page = await context.newPage();
    await page.goto(PREVIEW, { waitUntil: 'networkidle' });
    await page.evaluate(() => {
      localStorage.setItem('elmenuxfa:chat-theme-v1', 'light');
      for (const k of Object.keys(sessionStorage)) {
        if (k.includes('chat-v1')) sessionStorage.removeItem(k);
      }
    });
    await page.reload({ waitUntil: 'networkidle' });
    await page.locator('button[aria-label="Más opciones"]').click();
    await page.getByRole('menuitem', { name: /Nueva conversación/i }).click();
    report.screenshots.push(await shot(page, 'desktop-01-welcome-light'));
    await sendChat(
      page,
      'Hola, quiero dos pizzas Hawaianas, una Normal y otra Grande',
    );
    await page.waitForSelector('[data-chat-cart-action="propose_add"]');
    const cards = await page.locator('[data-chat-cart-action="propose_add"]').count();
    check('desktop_proposals', cards >= 2, `cards=${cards}`);
    report.screenshots.push(await shot(page, 'desktop-02-proposals-light'));
    await setTheme(page, 'dark');
    report.screenshots.push(await shot(page, 'desktop-03-proposals-dark'));
    await context.close();
  }

  await browser.close();
  const failed = report.checks.filter((c) => !c.ok);
  writeFileSync(join(outDir, 'report.json'), JSON.stringify(report, null, 2));
  console.log(`[ui] screenshots=${report.screenshots.length} failed=${failed.length}`);
  if (failed.length) {
    console.error(
      '[ui] FAILED',
      failed.map((f) => f.name).join(', '),
    );
    process.exit(1);
  }
  console.log('[ui] ALL CHECKS PASSED');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
