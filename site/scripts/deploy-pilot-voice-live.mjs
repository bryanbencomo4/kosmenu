/**
 * Deploy-pilot live voice: ONE turn STT → chat → confirm → checkout.
 * No simulate, no replay. Stops if first turn yields <2 propose_add.
 */
import { createRequire } from 'node:module';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, '.data', 'deploy-pilot');
mkdirSync(join(outDir, 'screenshots'), { recursive: true });

const BASE = process.env.STAGING_BASE_URL || 'http://127.0.0.1:3001';
const VOICE =
  'Buenas noches, quiero dos pizzas Hawaianas, una grande y otra normal, y una Coca-Cola';
const OWNER = 'I_AUTHORIZE_PIZZAS_EL_TRUENO_LIVE';
const COMMERCE = '0aa8c53b-07f1-446e-8b88-66c2b7ae89ea';

const report = {
  label: 'deploy-pilot-voice-live',
  startedAt: new Date().toISOString(),
  base: BASE,
  checks: [],
  transcript: null,
  reply: null,
  proposals: [],
  cartCount: 0,
  checkoutText: null,
  budgetBefore: null,
  budgetAfter: null,
  requestId: null,
  simulate: null,
  verdict: 'NO-GO',
};

function check(name, ok, detail) {
  report.checks.push({ name, ok: Boolean(ok), detail: detail ?? '' });
  console.log(`[pilot-voice] ${ok ? 'OK' : 'FAIL'} ${name} — ${detail ?? ''}`);
}

function loadBudget() {
  const p = process.env.CHATBOT_LIVE_BUDGET_FILE;
  if (!p || !existsSync(p)) return null;
  return JSON.parse(readFileSync(p, 'utf8'));
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
  if (process.env.CHATBOT_OWNER_LIVE_CONFIRM !== OWNER) {
    throw new Error('missing owner confirm');
  }
  if (process.env.CHATBOT_SIMULATE_GEMINI === '1') {
    throw new Error('simulator must be off');
  }
  if (!String(process.env.CHATBOT_LIVE_BUDGET_FILE || '').includes('deploy-pilot-voice')) {
    throw new Error('deploy-pilot-voice budget required');
  }

  report.budgetBefore = loadBudget();
  const left =
    (report.budgetBefore?.maxGeminiHttpCalls || 6) -
    (report.budgetBefore?.geminiHttpCalls || 0);
  if (left < 2) {
    check('budget_headroom', false, `left=${left}`);
    writeFileSync(join(outDir, 'voice-live-report.json'), JSON.stringify(report, null, 2));
    process.exit(2);
  }

  // Auth probe
  const status = await fetch(`${BASE}/api/chat/${COMMERCE}`).then((r) => r.json());
  report.simulate = status;
  check(
    'live_not_sim',
    status.authorized === true && status.simulate !== true,
    JSON.stringify({
      authorized: status.authorized,
      model: status.model,
      quotaBackend: status.quotaBackend,
    }),
  );

  const wav = join(outDir, 'voice-pilot.wav');
  check('voice_wav', synthWav(VOICE, wav), wav);

  // STT via media route (counts as 1 media HTTP)
  const form = new FormData();
  const blob = new Blob([readFileSync(wav)], { type: 'audio/wav' });
  form.set('kind', 'audio');
  form.set('file', blob, 'voice.wav');
  const sttRes = await fetch(`${BASE}/api/chat/${COMMERCE}/media`, {
    method: 'POST',
    body: form,
  });
  const stt = await sttRes.json().catch(() => ({}));
  report.transcript = stt.transcript || null;
  check(
    'stt_live',
    sttRes.status === 200 && stt.mode === 'live' && /hawaiana/i.test(stt.transcript || ''),
    `status=${sttRes.status} mode=${stt.mode} t=${JSON.stringify(stt.transcript)}`,
  );

  if (!report.transcript) {
    report.verdict = 'NO-GO';
    writeFileSync(join(outDir, 'voice-live-report.json'), JSON.stringify(report, null, 2));
    process.exit(1);
  }

  // Playwright: paste transcript as first user turn (same as voice→chat path after STT)
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

  let chatPayload = null;
  await context.route('**/api/chat/**', async (route) => {
    if (route.request().method() === 'GET') return route.continue();
    if (route.request().url().includes('/media')) return route.continue();
    const response = await route.fetch();
    const body = await response.text();
    try {
      chatPayload = JSON.parse(body);
    } catch {
      chatPayload = { raw: body.slice(0, 500) };
    }
    await route.fulfill({
      status: response.status(),
      headers: response.headers(),
      body,
    });
  });

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

  // First turn = exact STT transcript (no spoon-fed "Coca-Cola no existe")
  await page.fill('#chatbot-composer-input', report.transcript);
  await page.locator('button[aria-label="Enviar mensaje"]').click();
  await page.waitForFunction(
    () =>
      document
        .querySelector('[data-chatbot-preview="1"]')
        ?.getAttribute('data-chatbot-typing') === '0',
    null,
    { timeout: 120000 },
  );

  report.reply = chatPayload?.reply || null;
  report.requestId =
    chatPayload?.requestId || chatPayload?.attribution?.requestId || null;
  report.proposals = (chatPayload?.cart_actions || []).filter(
    (a) => a.type === 'propose_add',
  );

  const nCards = await page.locator('[data-chat-cart-action="propose_add"]').count();
  check(
    'first_turn_propose_add',
    report.proposals.length >= 2 && nCards >= 2,
    `api=${report.proposals.length} ui=${nCards} requestId=${report.requestId}`,
  );
  check(
    'not_simulator_response',
    Boolean(report.requestId) &&
      chatPayload?.model !== 'simulated' &&
      (chatPayload?.attribution?.geminiHttpCalls || 0) >= 1,
    `model=${chatPayload?.model} http=${chatPayload?.attribution?.geminiHttpCalls}`,
  );
  check(
    'no_invented_coke_propose',
    !report.proposals.some((p) => /coca/i.test(p.label || '')),
    report.proposals.map((p) => p.label).join(' | '),
  );

  await page.screenshot({
    path: join(outDir, 'screenshots', '01-first-turn-proposals.png'),
    fullPage: true,
  });

  if (report.proposals.length < 2 || nCards < 2) {
    report.budgetAfter = loadBudget();
    report.verdict = 'NO-GO';
    report.finishedAt = new Date().toISOString();
    writeFileSync(join(outDir, 'voice-live-report.json'), JSON.stringify(report, null, 2));
    writeFileSync(join(outDir, 'first-turn-chat.json'), JSON.stringify(chatPayload, null, 2));
    await browser.close();
    console.error('[pilot-voice] STOP — first turn missing propose_add; no extra Gemini calls');
    process.exit(1);
  }

  const pricesOk =
    report.proposals.some((p) => Number(p.unit_price) === 3.5) &&
    report.proposals.some((p) => Number(p.unit_price) === 8.75);
  check('catalog_prices', pricesOk, JSON.stringify(report.proposals.map((p) => ({ label: p.label, unit_price: p.unit_price }))));

  const pending = page.locator(
    '[data-chat-cart-action="propose_add"][data-confirmed="0"] button[data-chat-confirm-action="propose_add"]',
  );
  for (let i = 0; i < 6; i++) {
    if ((await pending.count()) === 0) break;
    await pending.first().click({ force: true });
    await page.waitForTimeout(450);
  }

  report.cartCount = Number(
    (await page.getAttribute('[data-preview="dev-chatbot-trueno"]', 'data-cart-count')) ||
      '0',
  );
  check('cart_mutated', report.cartCount >= 2, `cart=${report.cartCount}`);
  await page.screenshot({
    path: join(outDir, 'screenshots', '02-cart-confirmed.png'),
    fullPage: true,
  });

  await page.getByRole('button', { name: /carrito/i }).click({ force: true });
  await page.waitForSelector('[data-checkout-preview="1"]');
  report.checkoutText = await page
    .locator('[data-checkout-preview="1"]')
    .innerText();
  check(
    'checkout_subtotal',
    /12\.25|12,25/.test(report.checkoutText),
    report.checkoutText.slice(0, 280),
  );
  await page.screenshot({
    path: join(outDir, 'screenshots', '03-checkout.png'),
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
    o.status === 403,
    `${o.status} ${o.body.error}`,
  );

  await browser.close();
  report.budgetAfter = loadBudget();
  const within =
    (report.budgetAfter?.geminiHttpCalls || 99) <= 6 &&
    (report.budgetAfter?.estimatedCostUsd || 99) <= 0.02;
  check(
    'budget_within',
    within,
    `calls=${report.budgetAfter?.geminiHttpCalls} cost=${report.budgetAfter?.estimatedCostUsd}`,
  );

  const failed = report.checks.filter((c) => !c.ok);
  report.verdict = failed.length ? 'NO-GO' : 'GO';
  report.finishedAt = new Date().toISOString();
  writeFileSync(join(outDir, 'voice-live-report.json'), JSON.stringify(report, null, 2));
  writeFileSync(join(outDir, 'first-turn-chat.json'), JSON.stringify(chatPayload, null, 2));
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
