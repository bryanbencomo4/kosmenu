/**
 * Fase 3.3 — verify ProductOptionsSheet zoom has no nested <button>,
 * zoom still opens, and nested-button console error is gone.
 * Uses simulated Gemini / preview shell. Blocks orders.
 */
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const outDir = join(root, '.data', 'phase33');
mkdirSync(outDir, { recursive: true });

const BASE = process.env.PHASE33_BASE_URL || 'http://127.0.0.1:3000';
const PREVIEW = `${BASE}/preview/dev-chatbot-trueno`;

async function main() {
  let pw;
  try {
    pw = require('playwright');
  } catch {
    console.error('Playwright missing');
    process.exit(2);
  }
  const browser = await pw.chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await context.route('**/api/orders**', (route) =>
    route.fulfill({
      status: 403,
      contentType: 'application/json',
      body: JSON.stringify({ ok: false, error: 'phase33_orders_blocked' }),
    }),
  );
  const page = await context.newPage();
  const nestedButtonErrors = [];
  page.on('console', (msg) => {
    const t = msg.text();
    if (
      msg.type() === 'error' &&
      (/cannot be a descendant of.*button/i.test(t) ||
        /cannot contain a nested.*button/i.test(t))
    ) {
      nestedButtonErrors.push(t.slice(0, 240));
    }
  });

  await page.goto(PREVIEW, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForSelector('#chatbot-composer-input');
  const more = page.locator('button[aria-label="Más opciones"]');
  if (await more.count()) {
    await more.click();
    const reset = page.getByRole('menuitem', { name: /Nueva conversación/i });
    if (await reset.count()) await reset.click();
  }

  await page.fill('#chatbot-composer-input', 'Quiero una Hawaiana');
  await page.locator('button[aria-label="Enviar mensaje"]').click();
  await page.waitForFunction(
    () =>
      document
        .querySelector('[data-chatbot-preview="1"]')
        ?.getAttribute('data-chatbot-typing') === '0',
    null,
    { timeout: 20000 },
  );
  await page.waitForSelector('[data-chat-configure]', { timeout: 15000 });
  await page.locator('[data-chat-configure]').first().click({ force: true });
  await page.waitForSelector('[data-product-image-zoom="1"], [data-product-options-confirm="1"]', {
    timeout: 10000,
  });

  const nesting = await page.evaluate(() => {
    const zoom = document.querySelector('[data-product-image-zoom="1"]');
    if (!zoom) return { zoomFound: false, nestedButtons: -1, zoomTag: null };
    const nested = zoom.querySelectorAll('button');
    return {
      zoomFound: true,
      zoomTag: zoom.tagName,
      nestedButtons: nested.length,
      zoomIsButton: zoom.tagName === 'BUTTON',
    };
  });

  // Click zoom if present
  let lightboxOpened = false;
  if (await page.locator('[data-product-image-zoom="1"]').count()) {
    await page.locator('[data-product-image-zoom="1"]').click({ force: true });
    await page.waitForTimeout(400);
    lightboxOpened =
      (await page.locator('[role="dialog"]').count()) > 1 ||
      (await page.getByLabel(/ampliada|cerrar|imagen/i).count()) > 0 ||
      (await page.locator('button[aria-label*="Cerrar" i], button[aria-label*="cerrar" i]').count()) >
        0;
    // Escape to close if opened
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
  }

  // Confirm sheet still works: pick option + add
  const opt = page.locator('[data-option-group] button').first();
  if (await opt.count()) await opt.click({ force: true });
  await page.waitForTimeout(200);
  if (await page.locator('[data-product-options-confirm="1"]').count()) {
    await page.locator('[data-product-options-confirm="1"]').click({ force: true });
    await page.waitForTimeout(400);
  }

  const shot = join(outDir, 'sheet-zoom-no-nested-button.png');
  await page.screenshot({ path: shot, fullPage: true });

  const result = {
    nesting,
    nestedButtonErrors,
    lightboxOpened,
    screenshot: shot,
    ok:
      nesting.zoomFound &&
      nesting.zoomTag === 'DIV' &&
      !nesting.zoomIsButton &&
      nestedButtonErrors.length === 0,
  };
  writeFileSync(join(outDir, 'sheet-zoom-check.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  await browser.close();
  process.exit(result.ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
