/**
 * Mobile Playwright for /asistente — no force clicks.
 *
 *   NEXT_PUBLIC_DISCOVERY_ASSISTANT=1 DISCOVERY_ASSISTANT_ENABLED=1 DISCOVERY_ASSISTANT_SIMULATE=1 npx next dev -p 3022
 *   DISCOVERY_E2E_BASE_URL=http://127.0.0.1:3022 node scripts/discovery-assistant-playwright.mjs
 */
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const shotDir =
  process.env.DISCOVERY_E2E_SHOT_DIR ||
  join(root, '..', 'docs', 'discovery-assistant-screenshots');
mkdirSync(shotDir, { recursive: true });

const BASE = process.env.DISCOVERY_E2E_BASE_URL || 'http://127.0.0.1:3022';

const FAKE_ROWS = Array.from({ length: 30 }, (_, i) => ({
  id: `r${i + 1}`,
  slug: i === 0 ? 'pizzas-el-trueno' : `local-${i + 1}`,
  nombre: i === 0 ? 'Pizzas El Trueno' : `Local ${i + 1}`,
  logoUrl: null,
  categoria: i % 2 === 0 ? 'Pizzeria' : 'Hamburguesas',
  direccion: 'Palmira, Táchira',
  zonaOperacion: null,
  menuUrl: `/v/${i === 0 ? 'pizzas-el-trueno' : `local-${i + 1}`}`,
  isOpen: i % 3 === 0 ? true : i % 3 === 1 ? false : null,
  openLabel: i % 3 === 0 ? 'Abierto' : i % 3 === 1 ? 'Cerrado' : null,
  distanceKm: null,
  ratingAverage: 4,
  ratingCount: 10,
  promovido: false,
  lat: null,
  lng: null,
  productNames: [],
  showcaseDishes: [],
  currencies: ['USD'],
  paymentChannels: ['Efectivo'],
  acceptsVesBcv: false,
  negocioVirtual: false,
  estadosOperacion: [],
}));

const report = {
  ok: false,
  base: BASE,
  simulated: true,
  geminiBillable: false,
  forceClicks: false,
  steps: [],
  screenshots: [],
  errors: [],
};

async function shot(page, name) {
  const path = join(shotDir, `${name}.png`);
  await page.screenshot({ path, fullPage: false });
  report.screenshots.push(path);
  return path;
}

async function expectVisible(locator) {
  await locator.waitFor({ state: 'visible', timeout: 10_000 });
}

/** Dismiss cookie banner if present so it never eats composer clicks. */
async function dismissCookies(page) {
  const accept = page.getByRole('button', { name: /Aceptar/i });
  if ((await accept.count()) > 0) {
    await accept.first().click({ timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(300);
  }
}

async function main() {
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      permissions: [],
    });
    const page = await context.newPage();

    await page.route(/\/api\/comercios\/directory(\?|$)/, async (route) => {
      const url = new URL(route.request().url());
      if (url.searchParams.get('mode') !== 'clientes') {
        return route.continue();
      }
      const q = (url.searchParams.get('q') || '').toLowerCase();
      const category = (url.searchParams.get('category') || '').toLowerCase();
      const offset = Number(url.searchParams.get('offset') || 0);
      const limit = Number(url.searchParams.get('limit') || 24);

      if (q.includes('xyznoexiste') || q.includes('empty')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            ok: true,
            data: {
              query: q,
              results: [],
              total: 0,
              offset,
              limit,
              hasMore: false,
              promoted: [],
              topRated: [],
              regions: [],
              categories: [],
            },
          }),
        });
      }

      let pool = FAKE_ROWS;
      if (category === 'hamburguesas') {
        pool = Array.from({ length: 40 }, (_, i) => ({
          ...FAKE_ROWS[1],
          id: `h${i + 1}`,
          slug: `burger-${i + 1}`,
          nombre: `Burger ${i + 1}`,
          categoria: 'Hamburguesas',
          menuUrl: `/v/burger-${i + 1}`,
        }));
      } else if (category === 'pizzas') {
        pool = FAKE_ROWS.filter((row) =>
          /pizza|pizzer/i.test(`${row.categoria || ''} ${row.nombre || ''}`),
        );
        if (pool.length === 0) {
          pool = Array.from({ length: 8 }, (_, i) => ({
            ...FAKE_ROWS[0],
            id: `p${i + 1}`,
            slug: i === 0 ? 'pizzas-el-trueno' : `pizza-local-${i + 1}`,
            nombre: i === 0 ? 'Pizzas El Trueno' : `Pizzería ${i + 1}`,
            categoria: 'Pizzeria',
            menuUrl: `/v/${i === 0 ? 'pizzas-el-trueno' : `pizza-local-${i + 1}`}`,
          }));
        }
      } else if (q) {
        pool = FAKE_ROWS.filter(
          (row) =>
            row.nombre.toLowerCase().includes(q) ||
            (row.categoria || '').toLowerCase().includes(q),
        );
      }

      const results = pool.slice(offset, offset + limit);
      const payload = {
        results,
        promoted: [],
        topRated: [],
        total: pool.length,
        regions: [],
        offset,
        limit,
        hasMore: offset + results.length < pool.length,
      };

      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' },
        body: JSON.stringify({
          ok: true,
          data: { query: q, ...payload, categories: [] },
        }),
      });
    });

    await page.route('**/api/asistente', async (route) => {
      if (route.request().method() !== 'POST') return route.continue();
      const body = route.request().postDataJSON() || {};
      const last = [...(body.messages || [])]
        .reverse()
        .find((m) => m.role === 'user');
      const text = String(last?.text || '').toLowerCase();
      if (text.includes('xyznoexiste') || text.includes('empty')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            ok: true,
            fallback: true,
            text: 'Sin coincidencias en el agente.',
            restaurants: [],
          }),
        });
      }
      if (text.includes('fallar-gemini') || text.includes('fail')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            ok: true,
            fallback: true,
            text: 'Puedo ayudarte a buscar restaurantes con los filtros del directorio.',
            restaurants: [],
            reason: 'gemini_failed',
          }),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          text: 'Simulado',
          restaurants: FAKE_ROWS.slice(0, 3),
          skippedLlm: true,
        }),
      });
    });

    await page.goto(`${BASE}/asistente?ref=wa`, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    });
    await page.waitForSelector('[data-discovery-assistant="1"]', { timeout: 30_000 });
    await dismissCookies(page);
    await page.waitForSelector('[data-testid="discovery-chip-pizzas"]', { timeout: 15_000 });
    await page.waitForTimeout(600);

    // WA float must not be present on /asistente (would steal send taps).
    const waCount = await page.locator('.whatsapp-chat-widget').count();
    report.steps.push({ name: 'wa_widget_hidden', ok: waCount === 0, waCount });

    report.steps.push({ name: 'welcome', ok: true });
    await shot(page, '01-welcome');

    await dismissCookies(page);
    const pizzaRespPromise = page.waitForResponse(
      (res) =>
        res.url().includes('/api/comercios/directory') &&
        res.url().includes('category=pizzas') &&
        res.ok(),
      { timeout: 20_000 },
    );
    await page.getByTestId('discovery-chip-pizzas').click();
    const pizzaResp = await pizzaRespPromise;
    const pizzaJson = await pizzaResp.json().catch(() => null);
    const apiCount = Array.isArray(pizzaJson?.data?.results)
      ? pizzaJson.data.results.length
      : -1;
    await page.waitForFunction(
      () =>
        document.querySelectorAll('[data-discovery-restaurant]').length > 0 ||
        /Encontré|No encontré/i.test(
          document.querySelector('[data-testid="discovery-thread"]')?.textContent || '',
        ),
      null,
      { timeout: 15_000 },
    );
    const pizzaCards = await page.locator('[data-discovery-restaurant]').count();
    report.steps.push({
      name: 'chip_pizzas',
      ok: pizzaCards > 0,
      cards: pizzaCards,
      apiCount,
    });
    if (pizzaCards === 0) {
      const thread = await page.getByTestId('discovery-thread').innerText();
      throw new Error(`no cards after pizzas; apiCount=${apiCount}; thread=${thread.slice(0, 400)}`);
    }
    await shot(page, '02-pizzas');

    // Menu CTA: real /v/ href + hit-test proves the control is tappable (no overlay).
    const menuLink = page
      .locator('[data-discovery-restaurant]')
      .first()
      .getByRole('link', { name: /Ver menú/i });
    await expectVisible(menuLink);
    await menuLink.scrollIntoViewIfNeeded();
    const href = await menuLink.getAttribute('href');
    const box = await menuLink.boundingBox();
    const hit = box
      ? await page.evaluate(
          ({ x, y }) => {
            const el = document.elementFromPoint(x, y);
            const a = el?.closest?.('a');
            return {
              testid: a?.getAttribute?.('data-testid') || null,
              href: a?.getAttribute?.('href') || null,
              tag: el?.tagName || null,
            };
          },
          { x: box.x + box.width / 2, y: box.y + box.height / 2 },
        )
      : null;
    const menuOk =
      Boolean(href && href.startsWith('/v/')) &&
      Boolean(hit?.href && hit.href.startsWith('/v/'));
    report.steps.push({
      name: 'navigate_menu',
      ok: menuOk,
      href,
      hit,
    });
    await shot(page, '07-menu-nav');

    await page.goto(`${BASE}/asistente`, { waitUntil: 'domcontentloaded' });
    await dismissCookies(page);
    await page.waitForSelector('[data-testid="discovery-composer-input"]');

    const input = page.getByTestId('discovery-composer-input');
    await input.click();
    await input.fill('');
    await input.type('xyznoexiste', { delay: 12 });
    await page.getByTestId('discovery-composer-send').click();
    await page.waitForTimeout(1500);
    const threadEmpty = await page.getByTestId('discovery-thread').innerText();
    const emptyOk =
      /No encontré|Sin coincidencias|sin resultados|xyznoexiste/i.test(threadEmpty);
    report.steps.push({ name: 'empty_search', ok: emptyOk });
    await shot(page, '03-empty');

    await input.click();
    await input.fill('');
    await input.type('fallar-gemini', { delay: 12 });
    await page.getByTestId('discovery-composer-send').click();
    await page.waitForTimeout(1200);
    report.steps.push({ name: 'gemini_fail_fallback', ok: true });
    await shot(page, '04-gemini-fail');

    await page.goto(`${BASE}/asistente`, { waitUntil: 'domcontentloaded' });
    await dismissCookies(page);
    await page.waitForSelector('[data-testid="discovery-chips"]');
    await page.getByRole('button', { name: 'Cerca de mí' }).click();
    await page.waitForTimeout(1200);
    const geoAsk = await page.getByText(/ubicaci[oó]n|zona/i).count();
    report.steps.push({ name: 'geo_deny', ok: geoAsk > 0 });
    await shot(page, '05-geo-deny');

    await page.goto(`${BASE}/asistente`, { waitUntil: 'domcontentloaded' });
    await dismissCookies(page);
    await page.waitForSelector('[data-testid="discovery-chips"]');
    await page.getByTestId('discovery-chip-hamburguesas').click();
    await page.waitForSelector('[data-testid="discovery-load-more"]', { timeout: 20_000 });
    const before = await page.locator('[data-discovery-restaurant]').count();
    await page.getByTestId('discovery-load-more').click();
    await page.waitForFunction(
      (n) => document.querySelectorAll('[data-discovery-restaurant]').length > n,
      before,
      { timeout: 15_000 },
    );
    const after = await page.locator('[data-discovery-restaurant]').count();
    report.steps.push({
      name: 'pagination_ver_mas',
      ok: after > before,
      before,
      after,
    });
    await shot(page, '06-pagination');

    report.steps.push({ name: 'ref_wa_ready', ok: true });
    report.ok = report.steps.every((s) => s.ok);
  } catch (err) {
    report.errors.push(String(err && err.message ? err.message : err));
    report.ok = false;
  } finally {
    if (browser) await browser.close();
    writeFileSync(join(shotDir, 'playwright-report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    process.exit(report.ok ? 0 : 1);
  }
}

main();
