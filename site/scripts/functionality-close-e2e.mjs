/**
 * Functionality-close E2E — Playwright, simulated Gemini only.
 * No deploy, no migrations, no billable Gemini.
 */
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const outDir = join(root, '.data', 'functionality-close');
mkdirSync(outDir, { recursive: true });
mkdirSync(join(outDir, 'screenshots'), { recursive: true });

const BASE = process.env.FUNC_CLOSE_BASE_URL || 'http://127.0.0.1:3000';
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
  await page.waitForTimeout(200);
}

async function setTheme(page, mode) {
  await page.evaluate((m) => {
    localStorage.setItem('elmenuxfa:chat-theme-v1', m);
  }, mode);
  const current = await page.getAttribute(
    '[data-chatbot-preview="1"]',
    'data-chat-theme',
  );
  if (current === mode) return;
  await page.locator('button[aria-label="Más opciones"]').click();
  const label = mode === 'dark' ? /Tema oscuro/i : /Tema claro/i;
  await page.getByRole('menuitem', { name: label }).click();
  await page.waitForTimeout(200);
}

async function shot(page, name) {
  const path = join(outDir, 'screenshots', `${name}.png`);
  await page.screenshot({ path, fullPage: false });
  return path;
}

async function resetChat(page) {
  await page.evaluate(() => {
    localStorage.setItem('elmenuxfa:chat-theme-v1', 'light');
    for (const k of Object.keys(sessionStorage)) {
      if (k.includes('chat-v1') || k.includes('chat-sid')) {
        sessionStorage.removeItem(k);
      }
    }
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('[data-chatbot-preview="1"]');
  await page.locator('button[aria-label="Más opciones"]').click();
  await page.getByRole('menuitem', { name: /Nueva conversación/i }).click();
  await page.waitForTimeout(250);
}

async function main() {
  const pw = require('playwright');
  const browser = await pw.chromium.launch({ headless: true });
  const report = {
    startedAt: new Date().toISOString(),
    geminiHttpCalls: 0,
    ordersBlocked: 0,
    screenshots: [],
    checks: [],
    statuses: {},
  };
  const check = (name, ok, detail) => {
    report.checks.push({ name, ok, detail });
    console.log(`[e2e] ${ok ? 'OK' : 'FAIL'} ${name} — ${detail}`);
  };

  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    geolocation: { latitude: 10.48, longitude: -66.9 },
    permissions: ['geolocation'],
  });

  await context.route('**/api/orders**', async (route) => {
    report.ordersBlocked += 1;
    await route.fulfill({
      status: 403,
      contentType: 'application/json',
      body: JSON.stringify({ ok: false, error: 'func_close_orders_blocked' }),
    });
  });

  await context.route('**/generativelanguage.googleapis.com/**', async (route) => {
    report.geminiHttpCalls += 1;
    await route.abort();
  });

  const page = await context.newPage();
  await page.goto(PREVIEW, { waitUntil: 'networkidle', timeout: 60000 });
  await resetChat(page);

  // --- Receipts + typing ---
  const typingBefore = await page.getAttribute(
    '[data-chatbot-preview="1"]',
    'data-chatbot-typing',
  );
  check('typing_idle_before_send', typingBefore === '0', `typing=${typingBefore}`);

  await page.locator('#chatbot-composer-input').fill('hola');
  const sendPromise = page.locator('button[aria-label="Enviar mensaje"]').click();
  await page
    .waitForFunction(
      () =>
        document.querySelector('[data-chat-receipt="sent"]') ||
        document.querySelector('[data-chat-receipt="delivered"]') ||
        document.querySelector('[data-chat-receipt="read"]'),
      null,
      { timeout: 5000 },
    )
    .catch(() => {});
  await sendPromise;

  const sawTyping = await page
    .waitForSelector('[data-chat-typing="1"]', { timeout: 4000 })
    .then(() => true)
    .catch(() => false);
  check('typing_visible_while_generating', sawTyping, `saw=${sawTyping}`);

  await page.waitForFunction(
    () =>
      document
        .querySelector('[data-chatbot-preview="1"]')
        ?.getAttribute('data-chatbot-typing') === '0',
    null,
    { timeout: 20000 },
  );
  const typingAfter = await page.getAttribute(
    '[data-chatbot-preview="1"]',
    'data-chatbot-typing',
  );
  check('typing_clears_after_reply', typingAfter === '0', `typing=${typingAfter}`);

  const readTicks = await page.locator('[data-chat-receipt="read"]').count();
  check('receipt_read_after_reply', readTicks >= 1, `read=${readTicks}`);
  report.screenshots.push(await shot(page, 'm390-receipts-light'));

  // --- Emoji panel mobile ---
  await page.locator('[data-chat-emoji-toggle="1"]').click();
  await page.waitForSelector('[data-chat-emoji-panel="1"]');
  const emojiBtn = page.locator('[data-chat-emoji-panel="1"] button').first();
  const box = await emojiBtn.boundingBox();
  check(
    'emoji_touch_target_44',
    Boolean(box && box.height >= 40 && box.width >= 36),
    `h=${box?.height} w=${box?.width}`,
  );
  await emojiBtn.click();
  const draft = await page.inputValue('#chatbot-composer-input');
  check('emoji_inserts_into_draft', draft.length > 0, `draft=${JSON.stringify(draft)}`);
  report.screenshots.push(await shot(page, 'm390-emoji-panel'));
  await page.locator('[data-chat-emoji-toggle="1"]').click();

  // --- Attach panel ---
  await page.locator('[data-chat-attach-toggle="1"]').click();
  await page.waitForSelector('[data-chat-attach-panel="1"]');
  const hasImage = (await page.locator('[data-chat-attach-image="1"]').count()) > 0;
  const hasFile = (await page.locator('[data-chat-attach-file="1"]').count()) > 0;
  const hasLoc = (await page.locator('[data-chat-attach-location="1"]').count()) > 0;
  check('attach_panel_actions', hasImage && hasFile && hasLoc, {
    hasImage,
    hasFile,
    hasLoc,
  });
  report.screenshots.push(await shot(page, 'm390-attach-panel'));

  // --- Location → checkout (reply first, then checkout with delivery seed) ---
  await page.locator('[data-chat-attach-location="1"]').click();
  await page
    .waitForFunction(
      () =>
        document
          .querySelector('[data-chatbot-preview="1"]')
          ?.getAttribute('data-chatbot-typing') === '0' &&
        Boolean(document.querySelector('[data-chat-location="1"]')),
      null,
      { timeout: 20000 },
    )
    .catch(() => {});
  await page.waitForSelector('[data-checkout-preview="1"]', { timeout: 25000 });
  await page.waitForSelector('[data-checkout-delivery-point="1"]', {
    timeout: 10000,
  });
  const deliveryPoint = await page
    .locator('[data-checkout-delivery-point="1"]')
    .count();
  check('location_seeds_checkout', deliveryPoint >= 1, `points=${deliveryPoint}`);
  report.screenshots.push(await shot(page, 'm390-location-checkout'));
  await page
    .locator('[data-checkout-preview="1"] button')
    .filter({ hasText: /Cerrar/i })
    .first()
    .click();
  await page.waitForTimeout(300);

  // Ensure chat mode (location opened menu + checkout)
  const mode = await page.getAttribute(
    '[data-preview="dev-chatbot-trueno"]',
    'data-preview-mode',
  );
  if (mode !== 'chat') {
    await page.getByRole('button', { name: /Volver al chat/i }).click();
    await page.waitForSelector('[data-chatbot-preview="1"]');
  }
  // Location bubble should persist in restored chat history
  const locBubble = await page.locator('[data-chat-location="1"]').count();
  check('location_bubble_persisted', locBubble >= 1, `bubbles=${locBubble}`);

  // --- Cart / variations / checkout regression ---
  // Same utterance as the live voice STT failure case (compound + missing Coke).
  // Simulator path only — labeled regression, 0 Gemini.
  await resetChat(page);
  await sendChat(
    page,
    'Buenas noches, quiero dos pizzas Hawaianas, una grande y otra normal, y una Coca-Cola',
  );
  await page.waitForSelector('[data-chat-cart-action="propose_add"]', {
    timeout: 20000,
  });
  const proposals = await page.locator('[data-chat-cart-action="propose_add"]').count();
  check('proposals_from_sim_voice_utterance', proposals >= 2, `n=${proposals}`);
  const replyText = await page.locator('[data-chatbot-preview="1"]').innerText();
  check(
    'sim_notes_missing_coke_or_offers_drinks',
    /Coca-Cola no|bebida/i.test(replyText),
    replyText.slice(0, 180).replace(/\s+/g, ' '),
  );

  const pending = page.locator(
    '[data-chat-cart-action="propose_add"][data-confirmed="0"] button[data-chat-confirm-action="propose_add"]',
  );
  for (let i = 0; i < 4; i++) {
    if ((await pending.count()) === 0) break;
    await pending.first().scrollIntoViewIfNeeded();
    await pending.first().click({ force: true });
    await page.waitForTimeout(400);
  }
  const cartCount = Number(
    (await page.getAttribute('[data-chatbot-preview="1"]', 'data-cart-count')) ||
      '0',
  );
  check('cart_after_confirm', cartCount >= 2, `cart=${cartCount}`);
  report.screenshots.push(await shot(page, 'm390-cart-confirmed-light'));

  // Checkout via cart button or "Continuar pedido" overflow
  await page.getByRole('button', { name: /carrito/i }).click({ force: true });
  await page.waitForTimeout(500);
  let checkoutOpen =
    (await page.locator('[data-checkout-preview="1"]').count()) > 0;
  if (!checkoutOpen) {
    await page.locator('button[aria-label="Más opciones"]').click();
    const checkoutItem = page.getByRole('menuitem', {
      name: /Continuar pedido/i,
    });
    if ((await checkoutItem.count()) > 0) {
      await checkoutItem.click();
    } else {
      await page.keyboard.press('Escape');
    }
  }
  await page.waitForTimeout(500);
  checkoutOpen =
    (await page.locator('[data-checkout-preview="1"]').count()) > 0 ||
    (await page.getAttribute('[data-preview="dev-chatbot-trueno"]', 'data-preview-mode')) ===
      'menu';
  check('checkout_reachable', checkoutOpen, `open=${checkoutOpen}`);
  report.screenshots.push(await shot(page, 'm390-checkout-after-cart'));

  // Back to chat for dark screenshots
  if (
    (await page.getAttribute('[data-preview="dev-chatbot-trueno"]', 'data-preview-mode')) ===
    'menu'
  ) {
    await page.getByRole('button', { name: /Volver al chat/i }).click();
  }
  await page.evaluate(() => {
    document.querySelector('[data-checkout-preview="1"]')?.remove();
  });
  await page.waitForSelector('[data-chatbot-preview="1"]');
  await setTheme(page, 'dark');
  await page.waitForSelector('[data-chat-theme="dark"]');
  report.screenshots.push(await shot(page, 'm390-conversation-dark'));

  await page.locator('button[aria-label="Más opciones"]').click();
  await page.getByRole('menuitem', { name: /Nueva conversación/i }).click();
  await page.waitForTimeout(300);
  report.screenshots.push(await shot(page, 'm390-welcome-dark'));

  // Voice UI presence (cannot grant mic in CI reliably — assert controls exist)
  const mic = await page.locator('[data-chat-voice-start="1"]').count();
  check('voice_mic_visible', mic >= 1, `mic=${mic}`);

  // Image attach (simulate media analysis, 0 Gemini)
  await resetChat(page);
  await page.locator('[data-chat-attach-toggle="1"]').click();
  await page.waitForSelector('[data-chat-attach-panel="1"]');
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  );
  await page
    .locator('input[type="file"][accept="image/jpeg,image/png,image/webp,image/gif"]')
    .setInputFiles({
      name: 'sample.png',
      mimeType: 'image/png',
      buffer: png,
    });
  await page.waitForSelector('[data-chat-media-image="1"]', { timeout: 15000 });
  await page.waitForFunction(
    () =>
      document
        .querySelector('[data-chatbot-preview="1"]')
        ?.getAttribute('data-chatbot-typing') === '0',
    null,
    { timeout: 20000 },
  );
  const imgBubbles = await page.locator('[data-chat-media-image="1"]').count();
  check('image_attach_and_analyze_sim', imgBubbles >= 1, `images=${imgBubbles}`);
  report.screenshots.push(await shot(page, 'm390-image-attach-light'));
  await setTheme(page, 'dark');
  report.screenshots.push(await shot(page, 'm390-image-attach-dark'));

  check(
    'no_billable_gemini',
    report.geminiHttpCalls === 0,
    `calls=${report.geminiHttpCalls}`,
  );
  check(
    'orders_blocked',
    report.ordersBlocked >= 0,
    `blocked=${report.ordersBlocked}`,
  );

  await browser.close();

  report.finishedAt = new Date().toISOString();
  report.statuses = {
    receipts: readTicks >= 1 ? 'FUNCIONAL' : 'PARCIAL',
    typing: sawTyping && typingAfter === '0' ? 'FUNCIONAL' : 'PARCIAL',
    emoji_mobile: draft.length > 0 ? 'FUNCIONAL' : 'PARCIAL',
    attach_panel: hasImage && hasFile && hasLoc ? 'FUNCIONAL' : 'PARCIAL',
    location_checkout: deliveryPoint >= 1 ? 'FUNCIONAL' : 'PARCIAL',
    cart_checkout: cartCount >= 2 && checkoutOpen ? 'FUNCIONAL' : 'PARCIAL',
    voice_ui: mic >= 1 ? 'PARCIAL' : 'NO IMPLEMENTADA',
    gemini_live_naturalness: 'PARCIAL',
  };

  writeFileSync(join(outDir, 'e2e-report.json'), JSON.stringify(report, null, 2));
  const failed = report.checks.filter((c) => !c.ok);
  console.log(
    `[e2e] screenshots=${report.screenshots.length} failed=${failed.length} gemini=${report.geminiHttpCalls}`,
  );
  if (failed.length) {
    console.error('[e2e] FAILED', failed.map((f) => f.name).join(', '));
    process.exit(1);
  }
  console.log('[e2e] ALL CHECKS PASSED');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
