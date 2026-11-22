/**
 * Staging live full session — Pizzas El Trueno only.
 * Requires Next on BASE_URL with .env.staging.local loaded.
 * Blocks orders server-side; never confirms real pedidos.
 *
 * Usage:
 *   node --env-file=.env.staging.local scripts/staging-live-full-session.mjs
 */
import { createRequire } from 'node:module';
import {
  existsSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const outDir = join(root, '.data', 'staging-live');
mkdirSync(outDir, { recursive: true });
mkdirSync(join(outDir, 'screenshots'), { recursive: true });

const BASE = process.env.STAGING_BASE_URL || 'http://127.0.0.1:3001';
const SLUG = 'pizzas-el-trueno';
const OWNER = 'I_AUTHORIZE_PIZZAS_EL_TRUENO_LIVE';
const VOICE_TEXT =
  'Buenas noches, quiero dos pizzas Hawaianas, una grande y otra normal, y una Coca-Cola';

const report = {
  startedAt: new Date().toISOString(),
  base: BASE,
  previewTrueno: false,
  isolation: {},
  conversation: [],
  voice: null,
  image: null,
  pdf: null,
  location: null,
  budget: null,
  screenshots: [],
  checks: [],
  verdict: 'NO-GO',
};

function check(name, ok, detail) {
  report.checks.push({ name, ok: Boolean(ok), detail: detail ?? '' });
  console.log(`[staging] ${ok ? 'OK' : 'FAIL'} ${name} — ${detail ?? ''}`);
}

function mustAuthorize() {
  if (process.env.CHATBOT_OWNER_LIVE_CONFIRM !== OWNER) {
    console.error('Missing CHATBOT_OWNER_LIVE_CONFIRM');
    process.exit(2);
  }
  if (process.env.CHATBOT_STAGING_MODE !== '1') {
    console.error('CHATBOT_STAGING_MODE must be 1');
    process.exit(2);
  }
  if (process.env.CHATBOT_SIMULATE_GEMINI === '1') {
    console.error('CHATBOT_SIMULATE_GEMINI must be 0 for live');
    process.exit(2);
  }
}

async function postChat(messages, sessionId) {
  const res = await fetch(`${BASE}/api/chat/${encodeURIComponent(SLUG)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages,
      sessionId,
      cart_snapshot: [],
    }),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

async function verifyIsolation() {
  const orderRes = await fetch(`${BASE}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ comercioId: SLUG }),
  });
  const orderBody = await orderRes.json().catch(() => ({}));
  const blocked =
    orderRes.status === 403 &&
    (orderBody.error === 'orders_blocked_staging' ||
      String(orderBody.error || '').includes('blocked'));
  check('server_orders_blocked', blocked, `status=${orderRes.status} err=${orderBody.error}`);
  report.isolation.ordersBlocked = blocked;

  // Readonly probe via chat GET
  const getRes = await fetch(`${BASE}/api/chat/${encodeURIComponent(SLUG)}`);
  const getData = await getRes.json().catch(() => ({}));
  check('chat_status_ok', getRes.status === 200, `authorized=${getData.authorized}`);
  report.isolation.chatStatus = getData;
  return blocked;
}

function synthesizeVoiceWav(text, outPath) {
  const ps = `
Add-Type -AssemblyName System.Speech
$s = New-Object System.Speech.Synthesis.SpeechSynthesizer
$s.Rate = -1
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
  mustAuthorize();
  report.isolation.previewTruenoViable = false;
  report.isolation.strategy =
    'prod_catalog_readonly_wrapper + CHATBOT_BLOCK_ORDERS + staging mode (Preview has 0 Trueno rows)';

  const ordersOk = await verifyIsolation();
  if (!ordersOk) {
    report.blockers = ['orders_not_blocked_server_side'];
    writeFileSync(join(outDir, 'report.json'), JSON.stringify(report, null, 2));
    console.error('SECURITY BLOCK: orders not blocked server-side. Aborting before Gemini.');
    process.exit(3);
  }

  const sessionId = `staging_${Date.now().toString(36)}`;
  const history = [];

  const turns = [
    { role: 'user', text: 'Hola' },
    { role: 'user', text: '¿Qué pizzas tienen disponibles?' },
    { role: 'user', text: '¿Qué me recomiendas para dos personas?' },
    {
      role: 'user',
      text: 'Quiero dos pizzas Hawaianas, una Normal y otra Grande',
    },
  ];

  for (const turn of turns) {
    history.push(turn);
    const { status, data } = await postChat(history, sessionId);
    const reply = (data.reply || data.message || '').trim();
    history.push({ role: 'assistant', text: reply || '(empty)' });
    report.conversation.push({
      user: turn.text,
      status,
      reply,
      cart_actions: data.cart_actions || [],
      product_cards: data.product_cards || [],
      attribution: data.attribution || data.liveBudget || null,
      error: data.error || null,
    });
    console.log(`[turn] user=${turn.text.slice(0, 40)}… status=${status}`);
    if (status === 429 || data.error?.includes('cap') || data.error?.includes('budget')) {
      check('budget_stop_during_text', true, data.error || '429');
      break;
    }
    if (!resOk(status, data)) {
      check(`turn_${turn.text.slice(0, 12)}`, false, data.error || String(status));
    }
  }

  // Confirm proposals if present — client-side only; ask checkout via chat
  const last = report.conversation[report.conversation.length - 1];
  const proposals = last?.cart_actions?.filter((a) => a.type === 'propose_add') || [];
  check('hawaiana_proposals', proposals.length >= 1, `n=${proposals.length}`);

  // Continue: drink, qty, total, checkout
  const more = [
    'Agrega una Coca-Cola',
    'Sube la cantidad de la Hawaiana Normal a 2',
    '¿Cuánto llevo en total?',
    'Quiero continuar al checkout',
  ];
  for (const text of more) {
    history.push({ role: 'user', text });
    const { status, data } = await postChat(history, sessionId);
    const reply = (data.reply || data.message || '').trim();
    history.push({ role: 'assistant', text: reply || '(empty)' });
    report.conversation.push({
      user: text,
      status,
      reply,
      cart_actions: data.cart_actions || [],
      error: data.error || null,
    });
    if (status === 429) break;
  }

  // --- Voice STT ---
  const wavPath = join(outDir, 'voice-order.wav');
  const voiceOk = synthesizeVoiceWav(VOICE_TEXT, wavPath);
  check('voice_wav_synthesized', voiceOk, wavPath);
  if (voiceOk) {
    const wav = readFileSync(wavPath);
    const form = new FormData();
    form.set('kind', 'audio');
    form.set('durationSec', '12');
    form.set('file', new Blob([wav], { type: 'audio/wav' }), 'voice-order.wav');
    const res = await fetch(`${BASE}/api/chat/${encodeURIComponent(SLUG)}/media`, {
      method: 'POST',
      body: form,
    });
    const data = await res.json().catch(() => ({}));
    report.voice = { status: res.status, data };
    check(
      'voice_stt_live',
      Boolean(data.ok && data.transcript),
      `transcript=${JSON.stringify(data.transcript || data.error || '').slice(0, 120)}`,
    );

    if (data.transcript) {
      const vHist = [
        { role: 'user', text: data.transcript },
      ];
      const { status, data: chatData } = await postChat(vHist, `${sessionId}_voice`);
      report.voice.chat = { status, reply: chatData.reply, actions: chatData.cart_actions };
      check(
        'voice_chat_proposals',
        Array.isArray(chatData.cart_actions) && chatData.cart_actions.length > 0,
        `actions=${chatData.cart_actions?.length || 0}`,
      );
    }
  }

  // --- Image ---
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mP8z8BQz0AEYBxVSF+FABJADveWkH6oAAAAAElFTkSuQmCC',
    'base64',
  );
  {
    const form = new FormData();
    form.set('kind', 'image');
    form.set('file', new Blob([png], { type: 'image/png' }), 'sample.png');
    const res = await fetch(`${BASE}/api/chat/${encodeURIComponent(SLUG)}/media`, {
      method: 'POST',
      body: form,
    });
    const data = await res.json().catch(() => ({}));
    report.image = { status: res.status, data };
    check('image_analysis_live', Boolean(data.ok && data.analysis), data.analysis || data.error || '');
  }

  // --- PDF (minimal valid PDF with text stream) ---
  const pdf = Buffer.from(
    `%PDF-1.4
1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj
2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj
3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 144] /Contents 4 0 R /Resources<< /Font<< /F1 5 0 R >> >> >>endobj
4 0 obj<< /Length 55 >>stream
BT /F1 18 Tf 40 90 Td (Pedido: 1 Hawaiana Grande) Tj ET
endstream
endobj
5 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000266 00000 n 
0000000373 00000 n 
trailer<< /Size 6 /Root 1 0 R >>
startxref
450
%%EOF`,
  );
  {
    const form = new FormData();
    form.set('kind', 'file');
    form.set('file', new Blob([pdf], { type: 'application/pdf' }), 'menu.pdf');
    const res = await fetch(`${BASE}/api/chat/${encodeURIComponent(SLUG)}/media`, {
      method: 'POST',
      body: form,
    });
    const data = await res.json().catch(() => ({}));
    report.pdf = { status: res.status, data };
    check('pdf_analysis_live', Boolean(data.ok && data.analysis), data.analysis || data.error || '');
  }

  // Budget file
  const budgetFile = process.env.CHATBOT_LIVE_BUDGET_FILE;
  if (budgetFile && existsSync(budgetFile)) {
    report.budget = JSON.parse(readFileSync(budgetFile, 'utf8'));
  }

  // Playwright UI smoke (emoji + location + screenshots) if chromium available
  try {
    const pw = require('playwright');
    const browser = await pw.chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      geolocation: { latitude: 10.48, longitude: -66.9 },
      permissions: ['geolocation'],
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
      timeout: 60000,
    });
    await page.waitForSelector('[data-chatbot-preview="1"]');
    await page.locator('[data-chat-emoji-toggle="1"]').click();
    await page.waitForSelector('[data-chat-emoji-panel="1"]');
    await page.locator('[data-chat-emoji-panel="1"] button').first().click();
    check('emoji_mobile', true, 'inserted');
    const shot = join(outDir, 'screenshots', 'm390-emoji.png');
    await page.screenshot({ path: shot });
    report.screenshots.push(shot);

    await page.locator('[data-chat-attach-toggle="1"]').click();
    await page.locator('[data-chat-attach-location="1"]').click();
    await page.waitForSelector('[data-checkout-delivery-point="1"]', {
      timeout: 20000,
    });
    report.location = { ok: true };
    check('location_to_checkout', true, 'delivery point seeded');
    const shot2 = join(outDir, 'screenshots', 'm390-location-checkout.png');
    await page.screenshot({ path: shot2 });
    report.screenshots.push(shot2);
    await browser.close();
  } catch (e) {
    check('ui_playwright', false, String(e).slice(0, 200));
  }

  const failed = report.checks.filter((c) => !c.ok);
  const budgetOk =
    !report.budget ||
    (report.budget.geminiHttpCalls <= 28 &&
      (report.budget.estimatedCostUsd || 0) <= 0.1 + 0.01);
  check('budget_within_caps', budgetOk, JSON.stringify(report.budget || {}));

  report.finishedAt = new Date().toISOString();
  report.verdict =
    failed.filter((f) => !['ui_playwright'].includes(f.name)).length === 0
      ? 'GO-STAGING'
      : 'NO-GO';
  writeFileSync(join(outDir, 'report.json'), JSON.stringify(report, null, 2));
  console.log(`[staging] verdict=${report.verdict} failed=${failed.length}`);
  process.exit(failed.length ? 1 : 0);
}

function resOk(status, data) {
  return status === 200 && data.ok !== false;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
