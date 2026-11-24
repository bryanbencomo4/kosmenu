/**
 * Mobile + desktop Playwright for WA handoff → consumer / business assistants.
 *
 * Start Preview or local Next with flags, then:
 *   WA_HANDOFF_E2E_BASE_URL=http://127.0.0.1:3022 node scripts/wa-handoff-assistants-playwright.mjs
 *
 * Does not deploy. Does not hit production WhatsApp.
 */
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium, devices } = require('playwright');

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const shotDir =
  process.env.WA_HANDOFF_E2E_SHOT_DIR ||
  join(root, '..', 'docs', 'wa-handoff-assistant-screenshots');
mkdirSync(shotDir, { recursive: true });

const BASE = (process.env.WA_HANDOFF_E2E_BASE_URL || 'http://127.0.0.1:3022').replace(/\/$/, '');
const APP_ASISTENTE =
  process.env.WA_HANDOFF_E2E_APP_ASISTENTE || 'https://app.elmenuxfa.com/asistente';

const report = {
  ok: false,
  base: BASE,
  appAsistente: APP_ASISTENTE,
  viewports: [],
  steps: [],
  screenshots: [],
  errors: [],
  security: {},
};

function step(name, ok, detail = {}) {
  report.steps.push({ name, ok, ...detail });
  if (!ok) report.errors.push(name);
}

async function shot(page, name) {
  const path = join(shotDir, `${name}.png`);
  try {
    await page.screenshot({ path, fullPage: false });
    report.screenshots.push(path);
  } catch (e) {
    report.errors.push(`shot:${name}`);
  }
}

async function issueHandoff(destination, payload) {
  // In-memory store only works same-process; for remote Preview we exercise UI seeds.
  // Prefer seed query params for consumer; business uses Next fallback page.
  return null;
}

async function runViewport(browser, label, viewport, isMobile) {
  const context = await browser.newContext({
    viewport,
    isMobile,
    hasTouch: isMobile,
    userAgent: isMobile
      ? devices['iPhone 13'].userAgent
      : undefined,
  });
  const page = await context.newPage();
  const tag = label;

  // --- Consumer: prepared search via seed (simulates redeemed peek payload) ---
  try {
    const consumerUrl = `${BASE}/asistente?ref=wa&q=${encodeURIComponent('hamburguesas')}&zone=${encodeURIComponent('Caracas')}`;
    const res = await page.goto(consumerUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    const status = res?.status() ?? 0;
    step(`${tag}:consumer_status`, status >= 200 && status < 400, { status, url: consumerUrl });
    await page.waitForTimeout(4500);
    const body = await page.locator('body').innerText().catch(() => '');
    const not404 = !/404|not found/i.test(body) && status !== 404;
    const hasContext =
      /hamburgues|Caracas|Retomo|búsqueda|WhatsApp|restaurante|menú|menu|elmenuxfa/i.test(body) ||
      (await page.locator('textarea, input').count()) > 0;
    step(`${tag}:consumer_not_empty`, not404 && body.trim().length > 40, {
      bodySnippet: body.slice(0, 180),
    });
    step(`${tag}:consumer_context_or_composer`, hasContext, {});
    let draft = '';
    for (let i = 0; i < 8; i++) {
      draft = await page.locator('textarea').first().inputValue().catch(() => '');
      if (!draft) {
        draft = await page.locator('input[type="text"]').first().inputValue().catch(() => '');
      }
      if (draft || /hamburgues|Caracas|Retomo|encontr/i.test(await page.locator('body').innerText().catch(() => ''))) {
        break;
      }
      await page.waitForTimeout(800);
    }
    const body2 = await page.locator('body').innerText().catch(() => '');
    step(
      `${tag}:consumer_prepared_draft_or_results`,
      Boolean(draft) || /hamburgues|Caracas|Retomo|encontr/i.test(body2),
      { draft: (draft || '').slice(0, 80) },
    );
    await shot(page, `${tag}-consumer`);
  } catch (e) {
    step(`${tag}:consumer_nav`, false, { error: String(e && e.message ? e.message : e) });
  }

  // --- Redeem API security: GET rejected ---
  try {
    const getRes = await page.request.get(`${BASE}/api/wa-handoff/redeem`, { timeout: 15_000 });
    step(`${tag}:redeem_get_405`, getRes.status() === 405, { status: getRes.status() });
    report.security.getRedeem = getRes.status();
  } catch (e) {
    // Fallback: fetch via page.evaluate to avoid hung apiRequestContext
    try {
      const status = await page.evaluate(async (url) => {
        const r = await fetch(url, { method: 'GET' });
        return r.status;
      }, `${BASE}/api/wa-handoff/redeem`);
      step(`${tag}:redeem_get_405`, status === 405, { status });
      report.security.getRedeem = status;
    } catch (e2) {
      step(`${tag}:redeem_get_405`, false, { error: String(e2) });
    }
  }

  // --- Business Next fallback (internal) with hash handoff UI ---
  try {
    const bizUrl = `${BASE}/asistente-negocio`;
    const res = await page.goto(bizUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    const status = res?.status() ?? 0;
    step(`${tag}:biz_next_status`, status >= 200 && status < 500 && status !== 404, { status });
    await page.waitForTimeout(2500);
    const body = await page.locator('body').innerText().catch(() => '');
    const okShell =
      /asistente|negocios|panel|app\.elmenuxfa|sesión|enlace|validar|acceso|disponible/i.test(body) &&
      body.trim().length > 20;
    step(`${tag}:biz_next_shell`, okShell, { snippet: body.slice(0, 160) });
    await shot(page, `${tag}-biz-next`);
  } catch (e) {
    step(`${tag}:biz_next`, false, { error: String(e && e.message ? e.message : e) });
  }

  // --- Canonical Flutter URL reachable (no deploy change; live host check) ---
  try {
    const res = await page.goto(`${APP_ASISTENTE}`, {
      waitUntil: 'domcontentloaded',
      timeout: 45_000,
    });
    const status = res?.status() ?? 0;
    const body = await page.locator('body').innerText().catch(() => '');
    const ok =
      status !== 404 &&
      body.trim().length > 10 &&
      !/cannot GET|nginx|404/i.test(body);
    step(`${tag}:app_asistente_reachable`, ok, {
      status,
      snippet: body.slice(0, 120),
      url: APP_ASISTENTE,
    });
    await shot(page, `${tag}-app-asistente`);
  } catch (e) {
    step(`${tag}:app_asistente_reachable`, false, {
      error: String(e && e.message ? e.message : e),
      note: 'Flutter deploy not modified; route may need rebuild to ship /asistente',
    });
  }

  report.viewports.push(label);
  await context.close();
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  try {
    await runViewport(browser, 'mobile', { width: 390, height: 844 }, true);
    await runViewport(browser, 'desktop', { width: 1280, height: 800 }, false);
    report.ok = report.errors.length === 0;
  } finally {
    await browser.close();
  }
  const out = join(shotDir, 'wa-handoff-assistants-report.json');
  writeFileSync(out, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  console.log(`report:${out}`);
  process.exit(report.ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
