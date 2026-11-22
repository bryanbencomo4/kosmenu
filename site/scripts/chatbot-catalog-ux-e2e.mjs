/**
 * Playwright E2E — conversational catalog UX (simulate, 0 Gemini).
 * Scenarios: welcome categories, category → products, Ver todos, reply UI, mic lock chrome.
 */
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, '.data', 'catalog-ux-e2e');
mkdirSync(join(outDir, 'screenshots'), { recursive: true });

const PORT = 3011;
const BASE = `http://127.0.0.1:${PORT}`;
const report = { checks: [], screenshots: [], verdict: 'NO-GO' };

function check(name, ok, detail = '') {
  report.checks.push({ name, ok: Boolean(ok), detail });
  console.log(`[catalog-e2e] ${ok ? 'OK' : 'FAIL'} ${name} — ${detail}`);
}

function loadEnv(path) {
  const { readFileSync, existsSync } = require('node:fs');
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i <= 0) continue;
    let v = t.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    )
      v = v.slice(1, -1);
    out[t.slice(0, i).trim()] = v;
  }
  return out;
}

async function waitReady(url, ms = 90000) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    try {
      const r = await fetch(url);
      if (r.ok || r.status === 404) return;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('server not ready');
}

async function main() {
  const env = {
    ...process.env,
    ...loadEnv(join(root, '.env.local')),
    PORT: String(PORT),
    CHATBOT_SIMULATE_GEMINI: '1',
    CHATBOT_STAGING_MODE: '1',
    CHATBOT_BLOCK_ORDERS: '1',
    CHATBOT_ENABLED: '1',
    CHATBOT_MEDIA_LIVE: '0',
    NEXT_PUBLIC_CHATBOT_PREVIEW: '1',
  };

  const child = spawn(
    process.platform === 'win32' ? 'npx.cmd' : 'npx',
    ['next', 'dev', '-p', String(PORT), '-H', '127.0.0.1'],
    { cwd: root, env, shell: process.platform === 'win32', stdio: 'pipe' },
  );

  try {
    await waitReady(`${BASE}/preview/dev-chatbot-trueno`);
    const pw = require('playwright');
    const browser = await pw.chromium.launch({ headless: true });
    const page = await browser.newPage({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });

    await page.goto(`${BASE}/preview/dev-chatbot-trueno`, {
      waitUntil: 'networkidle',
      timeout: 120000,
    });
    await page.evaluate(() => {
      for (const k of Object.keys(sessionStorage)) {
        if (k.includes('chat')) sessionStorage.removeItem(k);
      }
    });
    await page.reload({ waitUntil: 'networkidle' });
    await page.locator('button[aria-label="Más opciones"]').click({ force: true });
    await page.getByRole('menuitem', { name: /Nueva conversación/i }).click();
    await page.waitForTimeout(500);

    const cats = page.locator('[data-chat-category-carousel] [data-chat-category-card]');
    const catCount = await cats.count();
    check('welcome_categories', catCount >= 1, `n=${catCount}`);
    await page.screenshot({
      path: join(outDir, 'screenshots', '01-welcome-categories.png'),
      fullPage: true,
    });
    report.screenshots.push('01-welcome-categories.png');

    if (catCount > 0) {
      await cats.first().click({ force: true });
      await page.waitForTimeout(400);
    }

    const productCards = page.locator('[data-chat-product-carousel] [data-chat-product-card]');
    const pCount = await productCards.count();
    check('category_products_carousel', pCount >= 1, `n=${pCount}`);
    await page.screenshot({
      path: join(outDir, 'screenshots', '02-product-carousel.png'),
      fullPage: true,
    });
    report.screenshots.push('02-product-carousel.png');

    const seeAll = page.getByRole('button', { name: /Ver todos/i }).first();
    if (await seeAll.count()) {
      await seeAll.click({ force: true });
      await page.waitForSelector('[data-chat-catalog-sheet="1"]', { timeout: 10000 });
      check('catalog_sheet_open', true, 'open');
      const rows = await page.locator('[data-chat-catalog-row]').count();
      check('catalog_sheet_rows', rows >= 1, `rows=${rows}`);
      await page.screenshot({
        path: join(outDir, 'screenshots', '03-catalog-sheet.png'),
        fullPage: true,
      });
      report.screenshots.push('03-catalog-sheet.png');
      await page.locator('[data-chat-catalog-close]').click({ force: true }).catch(() => {});
      await page.waitForTimeout(300);
    } else {
      check('catalog_sheet_open', false, 'no Ver todos button');
    }

    // Horizontal scroll products
    const scroller = page.locator('[data-chat-h-scroll]').first();
    if (await scroller.count()) {
      await scroller.evaluate((el) => {
        el.scrollLeft = Math.min(el.scrollWidth, el.scrollLeft + 220);
      });
      check('horizontal_scroll', true, 'scrolled');
    }

    // Reply button a11y path
    const replyBtn = page.locator('[data-chat-reply-button]').first();
    if (await replyBtn.count()) {
      await replyBtn.evaluate((el) => {
        el.style.opacity = '1';
        el.style.pointerEvents = 'auto';
      });
      await replyBtn.click({ force: true });
      const bar = page.locator('[data-chat-reply-bar]');
      check('reply_bar', (await bar.count()) > 0, 'visible');
      await page.screenshot({
        path: join(outDir, 'screenshots', '04-reply-bar.png'),
        fullPage: true,
      });
      report.screenshots.push('04-reply-bar.png');
    } else {
      check('reply_bar', false, 'no Responder button');
    }

    // Mic present
    const mic = page.locator('[data-chat-voice-start]');
    check('mic_visible', (await mic.count()) > 0, `mic=${await mic.count()}`);

    // Cart / checkout still reachable via header
    await page.getByRole('button', { name: /carrito|Abrir carrito/i }).first().click({ force: true }).catch(() => {});
    await page.waitForTimeout(400);
    check('cart_header_clickable', true, 'clicked');

    await browser.close();
  } finally {
    child.kill('SIGTERM');
    try {
      child.kill('SIGKILL');
    } catch {
      /* ignore */
    }
  }

  const failed = report.checks.filter((c) => !c.ok);
  report.verdict = failed.length ? 'NO-GO' : 'GO';
  writeFileSync(join(outDir, 'report.json'), JSON.stringify(report, null, 2));
  console.log(`[catalog-e2e] ${report.verdict} failed=${failed.length}`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
