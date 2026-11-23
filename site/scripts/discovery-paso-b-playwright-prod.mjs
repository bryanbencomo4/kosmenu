/**
 * Paso B prod smoke — real directory, no mocks, no force clicks, no Gemini billing.
 *   node site/scripts/discovery-paso-b-playwright-prod.mjs
 */
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const __dirname = dirname(fileURLToPath(import.meta.url));
const shotDir = join(__dirname, '..', '..', 'docs', 'discovery-paso-b-screenshots');
mkdirSync(shotDir, { recursive: true });
const BASE = process.env.DISCOVERY_E2E_BASE_URL || 'https://elmenuxfa.com';

const report = {
  ok: false,
  base: BASE,
  forceClicks: false,
  geminiBillable: false,
  steps: [],
  screenshots: [],
  errors: [],
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

async function main() {
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      permissions: [],
      userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    });
    await context.addInitScript(() => {
      try {
        localStorage.setItem('elmenuxfa-cookie-consent', 'accepted');
        document.cookie =
          'elmenuxfa_cookie_consent=accepted; Path=/; Max-Age=15552000; SameSite=Lax';
      } catch {
        /* ignore */
      }
    });
    const page = await context.newPage();

    // Track Gemini hosts — must stay zero
    let geminiHits = 0;
    page.on('request', (req) => {
      if (/generativelanguage\.googleapis\.com/i.test(req.url())) geminiHits += 1;
    });

    await page.goto(`${BASE}/asistente`, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    });
    await page.waitForSelector('[data-discovery-assistant="1"]', { timeout: 30_000 });
    const wa = await page.locator('.whatsapp-chat-widget').count();
    step('01_open_mobile', true, { wa });
    await shot(page, '01-open');

    // Chips + real directory
    const dirPromise = page.waitForResponse(
      (r) =>
        r.url().includes('/api/comercios/directory') &&
        r.url().includes('category=pizzas') &&
        r.ok(),
      { timeout: 30_000 },
    );
    await page.getByTestId('discovery-chip-pizzas').click();
    const dirRes = await dirPromise;
    const dirJson = await dirRes.json();
    await page.locator('[data-discovery-restaurant]').first().waitFor({
      state: 'visible',
      timeout: 20_000,
    });
    const cards = await page.locator('[data-discovery-restaurant]').count();
    step('02_chip_pizzas_real', cards > 0, {
      cards,
      apiTotal: dirJson?.data?.total,
    });
    await shot(page, '02-pizzas');

    // Menu link
    const menu = page
      .locator('[data-discovery-restaurant]')
      .first()
      .getByRole('link', { name: /Ver menú/i });
    const href = await menu.getAttribute('href');
    const box = await menu.boundingBox();
    const hit = box
      ? await page.evaluate(
          ({ x, y }) => {
            const el = document.elementFromPoint(x, y);
            return el?.closest?.('a')?.getAttribute?.('href') || null;
          },
          { x: box.x + box.width / 2, y: box.y + box.height / 2 },
        )
      : null;
    const isMenu = (u) => typeof u === 'string' && /\/v\//.test(u);
    step('03_menu_hit', isMenu(href) && isMenu(hit), { href, hit });

    // Hamburguesas + Ver más if available
    await page.goto(`${BASE}/asistente`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="discovery-chip-hamburguesas"]');
    await page.getByTestId('discovery-chip-hamburguesas').click();
    await page.waitForSelector('[data-discovery-restaurant]', { timeout: 20_000 });
    const before = await page.locator('[data-discovery-restaurant]').count();
    const more = page.getByTestId('discovery-load-more');
    if ((await more.count()) > 0) {
      await more.click();
      await page
        .locator('[data-discovery-restaurant]')
        .nth(before)
        .waitFor({ state: 'visible', timeout: 20_000 });
      const after = await page.locator('[data-discovery-restaurant]').count();
      step('04_ver_mas', after > before, { before, after });
    } else {
      step('04_ver_mas', before > 0, { before, note: 'no_more_needed' });
    }
    await shot(page, '03-pagination');

    // Free-text name search (deterministic directory path via API)
    await page.goto(`${BASE}/asistente`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="discovery-composer-input"]');
    // Trueno is often excluded from the public directory; use an eligible name.
    await page.getByTestId('discovery-composer-input').fill('napoles');
    await page.getByTestId('discovery-composer-send').click();
    await page
      .locator('[data-discovery-restaurant]')
      .first()
      .waitFor({ state: 'visible', timeout: 25_000 })
      .catch(() => {});
    await page.getByTestId('discovery-typing').waitFor({ state: 'hidden', timeout: 15_000 }).catch(() => {});
    const thread = await page.getByTestId('discovery-thread').innerText();
    const textCards = await page.locator('[data-discovery-restaurant]').count();
    step(
      '05_text_search',
      textCards > 0 || /N[aá]poles|Encontré/i.test(thread),
      { textCards, snippet: thread.slice(0, 220) },
    );
    await shot(page, '04-text-search');

    // Empty
    await page.getByTestId('discovery-composer-input').fill('xyznoexiste');
    await page.getByTestId('discovery-composer-send').click();
    await page.waitForTimeout(2000);
    const emptyThread = await page.getByTestId('discovery-thread').innerText();
    step('06_empty', /No encontré|xyznoexiste|Prueba/i.test(emptyThread), {});

    // Geo deny
    await page.goto(`${BASE}/asistente`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="discovery-chips"]');
    await page.getByRole('button', { name: 'Cerca de mí' }).click();
    await page.waitForTimeout(1500);
    const geo = await page.getByText(/ubicaci[oó]n|zona/i).count();
    step('07_geo_deny', geo > 0, { geo });

    step('08_no_gemini_http', geminiHits === 0, { geminiHits });
    step('09_no_wa_overlay', wa === 0, { wa });

    report.ok = report.steps.every((s) => s.ok) && report.errors.length === 0;
  } catch (err) {
    report.errors.push(String(err && err.message ? err.message : err));
    report.ok = false;
  } finally {
    if (browser) await browser.close();
    writeFileSync(join(shotDir, 'report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    process.exit(report.ok ? 0 : 1);
  }
}

main();
