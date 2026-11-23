/**
 * Playwright validation: Trueno mitad/mitad + FX (simulated Gemini only).
 * No deploy, no migrations, no billable Gemini, no real orders.
 *
 * Usage (from site/):
 *   CHATBOT_SIMULATE_GEMINI=1 npx next dev -p 3000
 *   node --env-file=.env.local scripts/chatbot-combo-playwright-validation.mjs
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
const shotDir = join(outDir, 'screenshots');
mkdirSync(shotDir, { recursive: true });

const BASE = process.env.COMBO_E2E_BASE_URL || 'http://127.0.0.1:3000';
const PREVIEW = `${BASE}/preview/dev-chatbot-trueno`;
const EXPECTED_COMBINED = 10.91;

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
  await page.waitForTimeout(300);
}

async function shot(page, name) {
  const path = join(shotDir, `${name}.png`);
  await page.screenshot({ path, fullPage: false });
  return path;
}

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

async function main() {
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({
      viewport: { width: 390, height: 844 },
    });

    await page.goto(PREVIEW, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForSelector('[data-chatbot-preview="1"]', { timeout: 30000 });
    report.steps.push({ name: 'open_preview', ok: true });

    // Nueva conversación
    await page.locator('button[aria-label="Más opciones"]').click();
    await page.getByRole('menuitem', { name: /Nueva conversación/i }).click();
    await page.waitForTimeout(400);

    await sendChat(
      page,
      'Quiero una pizza mitad Granjera y mitad Campesina',
    );
    report.screenshots.push(await shot(page, '01-ask-size'));

    const bodyText = await page.locator('[data-chat-shell]').innerText();
    const askedSize = /Normal|Grande/i.test(bodyText);
    report.steps.push({ name: 'asked_size', ok: askedSize, snippet: bodyText.slice(-400) });

    // Prefer chip (stable pending-size context); always fall back to typing.
    const grandeChip = page.locator(
      '[data-chat-suggested-chip="size-Grande"], [data-chat-suggested-chip]:has-text("Grande")',
    );
    let usedChip = false;
    if ((await grandeChip.count()) > 0) {
      await grandeChip.first().click();
      usedChip = true;
      await page
        .waitForFunction(
          () =>
            document
              .querySelector('[data-chatbot-preview="1"]')
              ?.getAttribute('data-chatbot-typing') === '0',
          null,
          { timeout: 45000 },
        )
        .catch(() => {});
      await page.waitForTimeout(600);
    }
    const shellAfterChip = await page.locator('[data-chat-shell]').innerText();
    const chipProducedProposal =
      /Combinaci[oó]n|propose_add|Confirmar|Agregar/i.test(shellAfterChip) ||
      (await page.locator('[data-chat-cart-action="propose_add"]').count()) > 0;
    if (!chipProducedProposal) {
      await sendChat(page, 'Grande');
      report.steps.push({
        name: usedChip ? 'chip_then_typed_grande' : 'typed_grande',
        ok: true,
      });
    } else {
      report.steps.push({ name: 'picked_grande_chip', ok: true });
    }

    report.screenshots.push(await shot(page, '02-combined-proposal'));

    const proposeAdds = page.locator(
      '[data-chat-cart-action="propose_add"]',
    );
    const proposeCount = await proposeAdds.count();
    report.steps.push({
      name: 'single_propose_add',
      ok: proposeCount === 1,
      proposeCount,
    });

    const proposalText =
      proposeCount > 0 ? await proposeAdds.first().innerText() : '';
    const looksCombined = /Combinaci[oó]n|Granjera|Campesina/i.test(
      proposalText,
    );
    const priceMatch = proposalText.match(/10[,.]91|US\$\s*10/);
    report.steps.push({
      name: 'proposal_content',
      ok: looksCombined && Boolean(priceMatch),
      proposalText: proposalText.slice(0, 500),
      expectedUnit: EXPECTED_COMBINED,
    });

    if (proposeCount > 0) {
      const confirm = proposeAdds
        .first()
        .locator('button:has-text("Agregar"), button:has-text("Confirmar")');
      if ((await confirm.count()) > 0) {
        await confirm.first().click();
        await page.waitForTimeout(800);
      }
    }
    report.screenshots.push(await shot(page, '03-after-confirm'));

    const cartCount =
      (await page.getAttribute(
        '[data-preview="dev-chatbot-trueno"]',
        'data-cart-count',
      )) || '0';
    report.steps.push({
      name: 'cart_count_one',
      ok: Number(cartCount) === 1,
      cartCount,
    });

    // FX questions
    await sendChat(page, '¿A cómo tienen el dólar?');
    report.screenshots.push(await shot(page, '04-fx-rate'));
    const fxText = await page.locator('[data-chat-shell]').innerText();
    report.steps.push({
      name: 'fx_rate_answer',
      ok: /3200|3\.200|COP/i.test(fxText),
      snippet: fxText.slice(-500),
    });

    await sendChat(page, '¿Cuántos COP son 10 USD?');
    report.screenshots.push(await shot(page, '05-fx-10usd'));
    const fx10 = await page.locator('[data-chat-shell]').innerText();
    report.steps.push({
      name: 'fx_10_usd',
      ok: /32\.?000|32000/i.test(fx10),
      snippet: fx10.slice(-500),
    });

    await sendChat(page, '¿Cuánto cuesta la pizza en pesos?');
    report.screenshots.push(await shot(page, '06-fx-pesos'));
    const fxPesos = await page.locator('[data-chat-shell]').innerText();
    const pesosReply = fxPesos.split('¿Cuánto cuesta la pizza en pesos?').pop() || '';
    report.steps.push({
      name: 'fx_pizza_pesos',
      ok: /3\.?200|34\.?912|34912|referencial/i.test(pesosReply),
      snippet: pesosReply.slice(0, 500),
    });

    await sendChat(page, '¿Puedo pagar en dólares?');
    report.screenshots.push(await shot(page, '07-fx-pay-usd'));
    const fxPay = await page.locator('[data-chat-shell]').innerText();
    const payReply = fxPay.split('¿Puedo pagar en dólares?').pop() || '';
    report.steps.push({
      name: 'fx_pay_usd',
      ok: /3\.?200|USD|dólar|dolar|checkout/i.test(payReply),
      snippet: payReply.slice(0, 500),
    });

    report.ok = report.steps.every((s) => s.ok);
  } catch (err) {
    report.errors.push(String(err?.stack || err));
    report.ok = false;
  } finally {
    if (browser) await browser.close();
    const out = join(outDir, 'combo-playwright-report.json');
    writeFileSync(out, JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    process.exit(report.ok ? 0 : 1);
  }
}

main();
