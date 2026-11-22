/**
 * Playwright E2E closure for Trueno pilot (simulated Gemini only).
 * Covers normal pizza, mitad/mitad, size, flavored drink, cart, FX, checkout,
 * human handoff, and chat↔menu switch. Does NOT create real orders.
 *
 * Usage (from site/):
 *   CHATBOT_SIMULATE_GEMINI=1 npx next dev -p 3000
 *   node --env-file=.env.local scripts/chatbot-pilot-closure-e2e.mjs
 */
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const outDir = join(root, '.data', 'qa-validation');
const shotDir = join(outDir, 'screenshots-closure');
mkdirSync(shotDir, { recursive: true });

const BASE = process.env.COMBO_E2E_BASE_URL || 'http://127.0.0.1:3000';
const PREVIEW = `${BASE}/preview/dev-chatbot-trueno`;

const report = {
  ok: false,
  base: BASE,
  simulated: true,
  geminiBillable: false,
  ordersCreated: false,
  steps: [],
  screenshots: [],
  errors: [],
};

function step(name, ok, extra = {}) {
  report.steps.push({ name, ok, ...extra });
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
    { timeout: 45000 },
  );
  await page.waitForTimeout(350);
}

async function shot(page, name) {
  const path = join(shotDir, `${name}.png`);
  await page.screenshot({ path, fullPage: false });
  report.screenshots.push(path);
  return path;
}

function unconfirmedProposals(page) {
  return page.locator(
    '[data-chat-cart-action="propose_add"][data-confirmed="0"]',
  );
}

async function confirmFirstProposal(page) {
  const propose = unconfirmedProposals(page);
  if ((await propose.count()) === 0) return false;
  const btn = propose
    .first()
    .locator('button:has-text("Agregar"), button:has-text("Confirmar")');
  if ((await btn.count()) === 0) return false;
  await btn.first().click();
  await page.waitForTimeout(700);
  return true;
}

async function waitUnconfirmed(page, { textRe = null, timeout = 20000 } = {}) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const nodes = unconfirmedProposals(page);
    const n = await nodes.count();
    for (let i = 0; i < n; i += 1) {
      const text = await nodes.nth(i).innerText();
      if (!textRe || textRe.test(text)) {
        return { ok: true, index: i, text };
      }
    }
    await page.waitForTimeout(250);
  }
  return { ok: false, index: -1, text: '' };
}

async function pickSizeOrType(page, label = 'Grande') {
  const chip = page.locator(
    `[data-chat-suggested-chip="size-${label}"], [data-chat-suggested-chip]:has-text("${label}")`,
  );
  if ((await chip.count()) > 0) {
    await chip.first().click();
    const waited = await waitUnconfirmed(page, {
      textRe: /Combinaci[oó]n|Campesina|Granjera|Confirmar/i,
      timeout: 12000,
    });
    if (waited.ok) return 'chip';
  }
  await sendChat(page, label);
  return 'typed';
}

async function main() {
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({
      viewport: { width: 390, height: 844 },
    });

    await page.goto(PREVIEW, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForSelector('[data-chatbot-preview="1"]', { timeout: 30000 });
    step('open_preview', true);

    await page.locator('button[aria-label="Más opciones"]').click();
    await page.getByRole('menuitem', { name: /Nueva conversación/i }).click();
    await page.waitForTimeout(400);

    // 1) Normal pizza
    await sendChat(page, 'Quiero una Campesina Grande');
    await shot(page, '01-normal-pizza');
    let proposeCount = await unconfirmedProposals(page).count();
    if (proposeCount === 0) {
      await pickSizeOrType(page, 'Grande');
      proposeCount = await unconfirmedProposals(page).count();
    }
    const normalText =
      proposeCount > 0
        ? await unconfirmedProposals(page).first().innerText()
        : '';
    step('normal_pizza_proposal', proposeCount === 1 && /Campesina/i.test(normalText), {
      proposeCount,
      snippet: normalText.slice(0, 240),
    });
    step('normal_pizza_confirmed', await confirmFirstProposal(page));

    // 2–3) Mitad/mitad + size
    await sendChat(
      page,
      'Quiero una pizza mitad Granjera y mitad Campesina',
    );
    await shot(page, '02-ask-size-combo');
    const askedSize = /pizza combinada Granjera \+ Campesina/i.test(
      await page.locator('[data-chat-shell]').innerText(),
    );
    step('combo_asked_size', askedSize);
    await pickSizeOrType(page, 'Grande');
    const comboWait = await waitUnconfirmed(page, {
      textRe: /Combinaci[oó]n/i,
      timeout: 20000,
    });
    await shot(page, '03-combo-proposal');
    step(
      'combo_single_line',
      comboWait.ok &&
        /Granjera/i.test(comboWait.text) &&
        /Campesina/i.test(comboWait.text) &&
        /10[,.]91|US\$\s*10/i.test(comboWait.text),
      { snippet: comboWait.text.slice(0, 300) },
    );
    step('combo_confirmed', await confirmFirstProposal(page));

    // 4) Product with selectable flavor
    await sendChat(page, 'Quiero un Refresco de 2 Lt Coca-Cola');
    const drinkWait = await waitUnconfirmed(page, {
      textRe: /Refresco/i,
      timeout: 20000,
    });
    await shot(page, '04-refresco-flavor');
    step(
      'refresco_flavor',
      drinkWait.ok && /Coca/i.test(drinkWait.text),
      { snippet: drinkWait.text.slice(0, 240) },
    );
    // Confirm the Refresco card specifically (may not be first if another pending).
    let refrescoConfirmed = false;
    const pendingDrinks = unconfirmedProposals(page);
    const pendingN = await pendingDrinks.count();
    for (let i = 0; i < pendingN; i += 1) {
      const t = await pendingDrinks.nth(i).innerText();
      if (!/Refresco/i.test(t)) continue;
      const btn = pendingDrinks
        .nth(i)
        .locator('button:has-text("Agregar"), button:has-text("Confirmar")');
      if ((await btn.count()) > 0) {
        await btn.first().click();
        await page.waitForTimeout(700);
        refrescoConfirmed = true;
        break;
      }
    }
    step('refresco_confirmed', refrescoConfirmed);

    // 5–6) Cart confirm + subtotal
    const cartCount =
      (await page.getAttribute(
        '[data-preview="dev-chatbot-trueno"]',
        'data-cart-count',
      )) || '0';
    step('cart_has_items', Number(cartCount) >= 3, { cartCount });

    await sendChat(page, '¿Cuánto llevo de subtotal?');
    await shot(page, '05-subtotal');
    const subText = await page.locator('[data-chat-shell]').innerText();
    const subReply = subText.split('¿Cuánto llevo de subtotal?').pop() || '';
    step('subtotal_answer', /Subtotal|ítem|item|US\$|USD/i.test(subReply), {
      snippet: subReply.slice(0, 300),
    });

    // 7) FX
    await sendChat(page, '¿A cómo tienen el dólar?');
    await shot(page, '06-fx');
    const fxText = await page.locator('[data-chat-shell]').innerText();
    const fxReply = fxText.split('¿A cómo tienen el dólar?').pop() || '';
    step('fx_rate', /3\.?200|3200/i.test(fxReply), {
      snippet: fxReply.slice(0, 300),
    });

    // 8) Open checkout (preview sheet — no order submit)
    const checkoutChip = page.locator(
      'button:has-text("Continuar con mi pedido"), button:has-text("Estoy listo para pagar"), [data-chat-cart-action="open_checkout"] button',
    );
    if ((await checkoutChip.count()) > 0) {
      await checkoutChip.first().click();
      await page.waitForTimeout(600);
    } else {
      await page.locator('button[aria-label="Abrir carrito"], [data-cart-count]').first().click().catch(() => {});
      await page.waitForTimeout(400);
      // Fallback: open menu then checkout button
      await page.locator('button[aria-label="Abrir menú"], button:has-text("Menú")').first().click().catch(() => {});
    }
    // Prefer explicit preview checkout open via bag → or mode switch
    const bag = page.locator('[data-preview="dev-chatbot-trueno"] button').filter({ hasText: /carrito|bag/i });
    // Use chat open checkout action if present in last reply
    const openCheckoutBtn = page.locator(
      '[data-chat-cart-action="open_checkout"] button, button:has-text("Continuar con mi pedido")',
    );
    if ((await openCheckoutBtn.count()) > 0) {
      await openCheckoutBtn.first().click();
      await page.waitForTimeout(700);
    }
    let checkoutVisible =
      (await page.locator('[data-checkout-preview="1"]').count()) > 0;
    if (!checkoutVisible) {
      // Switch to menu and open checkout from shared cart
      await page.evaluate(() => {
        const btn = [...document.querySelectorAll('button')].find((b) =>
          /menú|menu|Abrir menú/i.test(b.getAttribute('aria-label') || b.textContent || ''),
        );
        btn?.click();
      });
      await page.waitForTimeout(500);
      if ((await page.locator('[data-open-checkout="1"]').count()) > 0) {
        await page.locator('[data-open-checkout="1"]').click();
        await page.waitForTimeout(600);
      }
      checkoutVisible =
        (await page.locator('[data-checkout-preview="1"]').count()) > 0;
    }
    await shot(page, '07-checkout');
    step('checkout_opened', checkoutVisible);
    if (checkoutVisible) {
      await page.locator('button:has-text("Cerrar")').first().click().catch(() => {});
      await page.waitForTimeout(300);
    }

    // Ensure chat mode for remaining steps
    if ((await page.locator('[data-chatbot-preview="1"]').count()) === 0) {
      await page.getByRole('button', { name: /Volver al chat/i }).click();
      await page.waitForSelector('[data-chatbot-preview="1"]', { timeout: 15000 });
    }

    // 9) Human attention
    await sendChat(page, 'Quiero hablar con un humano');
    await shot(page, '08-human');
    const humanText = await page.locator('[data-chat-shell]').innerText();
    const humanReply =
      humanText.split('Quiero hablar con un humano').pop() || '';
    step(
      'human_handoff',
      /whatsapp|wa\.me|atenci[oó]n|local|no tiene/i.test(humanReply),
      { snippet: humanReply.slice(0, 300) },
    );

    // 10) Chat ↔ menu switch
    await page.locator('button[aria-label="Abrir menú"]').click().catch(async () => {
      await page.evaluate(() => {
        const el = document.querySelector('[data-chat-open-menu], button[aria-label*="menú" i], button[aria-label*="menu" i]');
        el?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
    });
    await page.waitForTimeout(600);
    const onMenu =
      (await page.getByText(/Menú tradicional/i).count()) > 0 ||
      (await page.locator('[data-open-checkout="1"]').count()) > 0;
    await shot(page, '09-menu-mode');
    if (onMenu) {
      await page.getByRole('button', { name: /Volver al chat/i }).click();
      await page.waitForSelector('[data-chatbot-preview="1"]', { timeout: 15000 });
    }
    const backChat = (await page.locator('[data-chatbot-preview="1"]').count()) > 0;
    await shot(page, '10-back-chat');
    step('chat_menu_switch', onMenu && backChat, { onMenu, backChat });

    report.ok = report.steps.every((s) => s.ok);
  } catch (err) {
    report.errors.push(String(err?.stack || err));
    report.ok = false;
  } finally {
    if (browser) await browser.close();
    const out = join(outDir, 'pilot-closure-e2e-report.json');
    writeFileSync(out, JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    process.exit(report.ok ? 0 : 1);
  }
}

main();
