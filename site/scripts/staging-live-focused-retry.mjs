/**
 * Focused retry after tool_round_limit diagnosis (MAX_TOOL_ROUNDS=4).
 * Does not reset budget unless CHATBOT_LIVE_BUDGET_RESET=1 on server.
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, '.data', 'staging-live');
mkdirSync(outDir, { recursive: true });
const BASE = process.env.STAGING_BASE_URL || 'http://127.0.0.1:3001';
const SLUG = 'pizzas-el-trueno';

const report = {
  startedAt: new Date().toISOString(),
  checks: [],
  turns: [],
};

function check(name, ok, detail) {
  report.checks.push({ name, ok: Boolean(ok), detail });
  console.log(`[retry] ${ok ? 'OK' : 'FAIL'} ${name} — ${detail}`);
}

async function postChat(messages, sessionId) {
  const res = await fetch(`${BASE}/api/chat/${encodeURIComponent(SLUG)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, sessionId, cart_snapshot: [] }),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

async function main() {
  const sessionId = `retry_${Date.now().toString(36)}`;
  const history = [];

  const msgs = [
    'Quiero dos pizzas Hawaianas, una Normal y otra Grande',
    'Buenas noches, quiero dos pizzas Hawaianas, una grande y otra normal, y una Coca-Cola',
  ];

  for (const text of msgs) {
    history.length = 0;
    history.push({ role: 'user', text });
    const { status, data } = await postChat(history, `${sessionId}_${history.length}`);
    const actions = data.cart_actions || [];
    const adds = actions.filter((a) => a.type === 'propose_add');
    report.turns.push({
      text,
      status,
      reply: data.reply,
      error: data.error,
      actions: adds.map((a) => ({
        label: a.label,
        product_id: a.product_id,
        quantity: a.quantity,
        selection: a.selection,
        unit_price: a.unit_price,
      })),
      openCheckout: actions.some((a) => a.type === 'open_checkout'),
      attribution: data.attribution || null,
    });
    check(
      `proposals_${text.slice(0, 24)}`,
      adds.length >= 2,
      `status=${status} adds=${adds.length} err=${data.error || ''} reply=${(data.reply || '').slice(0, 100)}`,
    );
  }

  // UI emoji force
  try {
    const pw = require('playwright');
    const browser = await pw.chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.goto(`${BASE}/preview/dev-chatbot-trueno`, {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });
    await page.waitForSelector('[data-chat-emoji-toggle="1"]', { timeout: 30000 });
    await page.locator('[data-chat-emoji-toggle="1"]').click({ force: true });
    await page.waitForSelector('[data-chat-emoji-panel="1"]', { timeout: 10000 });
    await page.locator('[data-chat-emoji-panel="1"] button').first().click({ force: true });
    const val = await page.inputValue('#chatbot-composer-input');
    check('emoji_force_click', val.length > 0, `draft=${val}`);
    const shot = join(outDir, 'screenshots', 'm390-emoji-retry.png');
    mkdirSync(join(outDir, 'screenshots'), { recursive: true });
    await page.screenshot({ path: shot });
    await browser.close();
  } catch (e) {
    check('emoji_force_click', false, String(e).slice(0, 200));
  }

  if (existsSync(process.env.CHATBOT_LIVE_BUDGET_FILE || '')) {
    report.budget = JSON.parse(
      readFileSync(process.env.CHATBOT_LIVE_BUDGET_FILE, 'utf8'),
    );
  }

  writeFileSync(join(outDir, 'retry-report.json'), JSON.stringify(report, null, 2));
  const failed = report.checks.filter((c) => !c.ok);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
