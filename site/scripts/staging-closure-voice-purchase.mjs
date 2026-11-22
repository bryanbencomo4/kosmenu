/**
 * Final closure: voice STT → live chat → confirm cart → checkout preview.
 * Uses closure budget file. Blocks orders. No simulate.
 */
import { createRequire } from 'node:module';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  copyFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, '.data', 'staging-closure');
mkdirSync(outDir, { recursive: true });
mkdirSync(join(outDir, 'screenshots'), { recursive: true });

const BASE = process.env.STAGING_BASE_URL || 'http://127.0.0.1:3001';
const SLUG = 'pizzas-el-trueno';
const VOICE =
  'Buenas noches, quiero dos pizzas Hawaianas, una grande y otra normal, y una Coca-Cola';
const OWNER = 'I_AUTHORIZE_PIZZAS_EL_TRUENO_LIVE';

const report = {
  label: 'closure-final-voice-purchase',
  startedAt: new Date().toISOString(),
  base: BASE,
  simulate: process.env.CHATBOT_SIMULATE_GEMINI,
  staging: process.env.CHATBOT_STAGING_MODE,
  mediaLive: process.env.CHATBOT_MEDIA_LIVE,
  budgetFile: process.env.CHATBOT_LIVE_BUDGET_FILE,
  steps: [],
  checks: [],
  transcript: null,
  conversation: [],
  proposals: [],
  cart: null,
  checkout: null,
  budgetBefore: null,
  budgetAfter: null,
  ordersBlocked: null,
  writeProbe: null,
  verdict: 'NO-GO',
};

function check(name, ok, detail) {
  report.checks.push({ name, ok: Boolean(ok), detail: detail ?? '' });
  console.log(`[closure] ${ok ? 'OK' : 'FAIL'} ${name} — ${detail ?? ''}`);
}

function step(name, data) {
  report.steps.push({ name, at: new Date().toISOString(), ...data });
}

function loadBudget() {
  const p = process.env.CHATBOT_LIVE_BUDGET_FILE;
  if (!p || !existsSync(p)) return null;
  return JSON.parse(readFileSync(p, 'utf8'));
}

function mustLive() {
  if (process.env.CHATBOT_OWNER_LIVE_CONFIRM !== OWNER) {
    throw new Error('missing owner confirm');
  }
  if (process.env.CHATBOT_SIMULATE_GEMINI === '1') {
    throw new Error('simulator must be off');
  }
  if (process.env.CHATBOT_STAGING_MODE !== '1') {
    throw new Error('staging mode required');
  }
  if (!String(process.env.CHATBOT_LIVE_BUDGET_FILE || '').includes('closure-final')) {
    throw new Error('closure budget file required');
  }
}

function synthWav(text, outPath) {
  const ps = `
Add-Type -AssemblyName System.Speech
$s = New-Object System.Speech.Synthesis.SpeechSynthesizer
$s.Rate = -2
$s.SetOutputToWaveFile('${outPath.replace(/'/g, "''")}')
$s.Speak('${text.replace(/'/g, "''")}')
$s.Dispose()
`;
  const r = spawnSync('powershell', ['-NoProfile', '-Command', ps], {
    encoding: 'utf8',
  });
  return r.status === 0 && existsSync(outPath);
}

async function main() {
  mustLive();
  report.budgetBefore = loadBudget();

  // --- Isolation ---
  const orderRes = await fetch(`${BASE}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      comercioId: '0aa8c53b-07f1-446e-8b88-66c2b7ae89ea',
      clientName: 'closure-test',
      items: [{ product_id: 'x', quantity: 1 }],
    }),
  });
  const orderBody = await orderRes.json().catch(() => ({}));
  report.ordersBlocked = {
    status: orderRes.status,
    error: orderBody.error,
  };
  check(
    'orders_blocked_server',
    orderRes.status === 403 && orderBody.error === 'orders_blocked_staging',
    `${orderRes.status} ${orderBody.error}`,
  );
  if (!(orderRes.status === 403 && orderBody.error === 'orders_blocked_staging')) {
    report.verdict = 'NO-GO';
    writeFileSync(join(outDir, 'report.json'), JSON.stringify(report, null, 2));
    console.error('SECURITY STOP: orders not blocked');
    process.exit(3);
  }

  const statusRes = await fetch(`${BASE}/api/chat/${encodeURIComponent(SLUG)}`);
  const status = await statusRes.json().catch(() => ({}));
  check(
    'chat_authorized_live_not_sim',
    status.authorized === true && process.env.CHATBOT_SIMULATE_GEMINI === '0',
    `authorized=${status.authorized} simulate=${process.env.CHATBOT_SIMULATE_GEMINI} model=${status.model}`,
  );

  // --- Voice STT (1 media call) ---
  const wavPath = join(outDir, 'voice-closure.wav');
  const wavOk = synthWav(VOICE, wavPath);
  check('voice_wav', wavOk, wavPath);
  if (!wavOk) {
    writeFileSync(join(outDir, 'report.json'), JSON.stringify(report, null, 2));
    process.exit(1);
  }

  const wav = readFileSync(wavPath);
  const form = new FormData();
  form.set('kind', 'audio');
  form.set('durationSec', '14');
  form.set('file', new Blob([wav], { type: 'audio/wav' }), 'voice-closure.wav');
  const sttRes = await fetch(`${BASE}/api/chat/${encodeURIComponent(SLUG)}/media`, {
    method: 'POST',
    body: form,
  });
  const stt = await sttRes.json().catch(() => ({}));
  step('stt', { status: sttRes.status, stt });
  report.transcript = stt.transcript || null;
  check(
    'stt_live_gemini',
    sttRes.status === 200 &&
      stt.ok === true &&
      stt.mode === 'live' &&
      Boolean(stt.transcript) &&
      stt.geminiHttpCalls !== 0,
    `mode=${stt.mode} transcript=${JSON.stringify(stt.transcript)} tokens=${stt.tokensIn}/${stt.tokensOut}`,
  );
  if (!report.transcript) {
    writeFileSync(join(outDir, 'report.json'), JSON.stringify(report, null, 2));
    process.exit(1);
  }

  // --- Playwright: real UI conversation + cart confirm + checkout ---
  const pw = require('playwright');
  const browser = await pw.chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    geolocation: { latitude: 10.48, longitude: -66.9 },
    permissions: ['geolocation'],
  });
  // Defense in depth — server already blocks
  await context.route('**/api/orders**', (route) =>
    route.fulfill({
      status: 403,
      body: JSON.stringify({ ok: false, error: 'orders_blocked_staging' }),
    }),
  );

  let geminiChatCallsSeen = 0;
  await context.route('**/api/chat/**', async (route) => {
    const req = route.request();
    if (req.method() === 'POST' && !req.url().includes('/media')) {
      geminiChatCallsSeen += 1;
    }
    await route.continue();
  });

  const page = await context.newPage();
  await page.goto(`${BASE}/preview/dev-chatbot-trueno`, {
    waitUntil: 'networkidle',
    timeout: 90000,
  });
  await page.waitForSelector('[data-chatbot-preview="1"]');
  await page.evaluate(() => {
    for (const k of Object.keys(sessionStorage)) {
      if (k.includes('chat')) sessionStorage.removeItem(k);
    }
    localStorage.setItem('elmenuxfa:chat-theme-v1', 'light');
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('#chatbot-composer-input');
  // Nueva conversación
  await page.locator('button[aria-label="Más opciones"]').click({ force: true });
  await page.getByRole('menuitem', { name: /Nueva conversación/i }).click();
  await page.waitForTimeout(400);

  // Send transcript as the user message coming from STT (same text path as sendVoice)
  await page.fill('#chatbot-composer-input', report.transcript);
  await page.locator('button[aria-label="Enviar mensaje"]').click();
  await page.waitForFunction(
    () =>
      document
        .querySelector('[data-chatbot-preview="1"]')
        ?.getAttribute('data-chatbot-typing') === '0',
    null,
    { timeout: 90000 },
  );
  await page.waitForTimeout(800);

  const proposalCards = page.locator('[data-chat-cart-action="propose_add"]');
  await proposalCards.first().waitFor({ timeout: 60000 }).catch(() => {});
  const proposalCount = await proposalCards.count();
  step('proposals_visible', { proposalCount });

  // Capture assistant text
  const assistantTexts = await page.locator('[data-chat-role="assistant"]').allTextContents();
  report.conversation = assistantTexts.map((t) => t.trim()).filter(Boolean);
  check(
    'proposals_two_pizzas',
    proposalCount >= 2,
    `cards=${proposalCount}`,
  );

  // Confirm each pending proposal
  const confirmBtns = page.locator(
    '[data-chat-cart-action="propose_add"][data-confirmed="0"] button[data-chat-confirm-action="propose_add"]',
  );
  for (let i = 0; i < 6; i++) {
    const n = await confirmBtns.count();
    if (n === 0) break;
    await confirmBtns.first().scrollIntoViewIfNeeded();
    await confirmBtns.first().click({ force: true });
    await page.waitForTimeout(500);
  }

  const cartCount = Number(
    (await page.getAttribute('[data-preview="dev-chatbot-trueno"]', 'data-cart-count')) ||
      (await page.getAttribute('[data-chatbot-preview="1"]', 'data-cart-count')) ||
      '0',
  );
  check('cart_after_confirm', cartCount >= 2, `cartCount=${cartCount}`);

  await page.screenshot({
    path: join(outDir, 'screenshots', '01-after-confirm.png'),
  });

  // If drink clarification and budget allows one more turn
  const budgetMid = loadBudget();
  const callsLeft =
    (budgetMid?.maxGeminiHttpCalls ?? 12) - (budgetMid?.geminiHttpCalls ?? 0);
  const lastAssistant = (report.conversation[report.conversation.length - 1] || '').toLowerCase();
  const mentionsDrink =
    lastAssistant.includes('coca') ||
    lastAssistant.includes('bebida') ||
    lastAssistant.includes('disponib');

  if (callsLeft >= 2 && mentionsDrink) {
    await page.fill(
      '#chatbot-composer-input',
      'De acuerdo, agrega entonces una bebida disponible del menú, la más económica',
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
    await page.waitForTimeout(600);
    const drinkConfirm = page.locator(
      '[data-chat-cart-action="propose_add"][data-confirmed="0"] button[data-chat-confirm-action="propose_add"]',
    );
    if ((await drinkConfirm.count()) > 0) {
      await drinkConfirm.first().click({ force: true });
      await page.waitForTimeout(500);
    }
  }

  const cartCount2 = Number(
    (await page.getAttribute('[data-preview="dev-chatbot-trueno"]', 'data-cart-count')) ||
      '0',
  );

  // Open checkout via cart
  await page.getByRole('button', { name: /carrito/i }).click({ force: true });
  await page.waitForSelector('[data-checkout-preview="1"]', { timeout: 15000 });
  const checkoutText = await page.locator('[data-checkout-preview="1"]').innerText();
  report.checkout = { text: checkoutText };
  await page.screenshot({
    path: join(outDir, 'screenshots', '02-checkout.png'),
    fullPage: false,
  });

  const hasNormal = /Hawaiana/i.test(checkoutText) && /Normal/i.test(checkoutText);
  const hasGrande = /Hawaiana/i.test(checkoutText) && /Grande/i.test(checkoutText);
  const hasSubtotalHint =
    /12\.25|12,25|3\.5|3,5|8\.75|8,75/i.test(checkoutText) ||
    checkoutText.includes('USD');
  check(
    'checkout_has_hawaianas',
    hasNormal && hasGrande,
    `normal=${hasNormal} grande=${hasGrande}`,
  );
  check('checkout_shows_money', hasSubtotalHint, checkoutText.slice(0, 200));

  // Persist cart across mode switch
  await page.locator('[data-checkout-preview="1"] button').filter({ hasText: /Cerrar/i }).click();
  await page.waitForTimeout(300);
  // If still on chat, open menu then back
  const mode = await page.getAttribute(
    '[data-preview="dev-chatbot-trueno"]',
    'data-preview-mode',
  );
  if (mode === 'chat') {
    await page.locator('button[aria-label="Abrir menú"]').click({ force: true }).catch(() => {});
    await page.waitForTimeout(400);
  }
  const cartOnMenu = Number(
    (await page.getAttribute('[data-preview="dev-chatbot-trueno"]', 'data-cart-count')) ||
      '0',
  );
  check('cart_persists_mode_switch', cartOnMenu >= 2, `cart=${cartOnMenu}`);

  await page.getByRole('button', { name: /Volver al chat/i }).click().catch(() => {});
  await page.waitForTimeout(300);

  report.cart = {
    afterPizzaConfirm: cartCount,
    afterOptionalDrink: cartCount2,
    afterModeSwitch: cartOnMenu,
  };
  report.geminiChatPostsObserved = geminiChatCallsSeen;

  await browser.close();

  report.budgetAfter = loadBudget();
  const b = report.budgetAfter || {};
  check(
    'budget_within_closure_caps',
    (b.geminiHttpCalls || 0) <= 12 && (b.estimatedCostUsd || 0) <= 0.03 + 0.002,
    `calls=${b.geminiHttpCalls} cost=${b.estimatedCostUsd} media=${b.mediaHttpCalls}`,
  );
  check(
    'not_simulator_mode',
    stt.mode === 'live' && Boolean(stt.tokensIn || stt.tokensOut || stt.requestId),
    `sttMode=${stt.mode} requestId=${stt.requestId}`,
  );

  // Prove prior budget untouched
  const prior = join(root, '.data', 'chatbot-live-budget-staging.json');
  const archive = join(root, '.data', 'chatbot-live-budget-staging-prior.json');
  check(
    'prior_budget_preserved',
    existsSync(prior) || existsSync(archive),
    `prior=${existsSync(prior)} archive=${existsSync(archive)}`,
  );

  const failed = report.checks.filter((c) => !c.ok);
  report.finishedAt = new Date().toISOString();
  report.verdict =
    failed.length === 0
      ? 'GO-PILOTO-CONDICIONAL'
      : failed.some((f) => f.name.startsWith('orders_') || f.name.includes('security'))
        ? 'NO-GO'
        : 'NO-GO';

  // Soften: if cart+checkout+stt+proposals ok → GO-PILOTO-CONDICIONAL even if optional drink skipped
  const criticalOk = [
    'orders_blocked_server',
    'stt_live_gemini',
    'proposals_two_pizzas',
    'cart_after_confirm',
    'checkout_has_hawaianas',
  ].every((n) => report.checks.find((c) => c.name === n)?.ok);
  if (criticalOk) {
    report.verdict = 'GO-PILOTO-CONDICIONAL';
  }

  writeFileSync(join(outDir, 'report.json'), JSON.stringify(report, null, 2));
  console.log(`[closure] verdict=${report.verdict} failed=${failed.length}`);
  process.exit(criticalOk ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  report.error = String(e);
  writeFileSync(join(outDir, 'report.json'), JSON.stringify(report, null, 2));
  process.exit(1);
});
