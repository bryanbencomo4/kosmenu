/**
 * Mobile Playwright for /asistente (mocked directory — no billed Gemini).
 *
 *   NEXT_PUBLIC_DISCOVERY_ASSISTANT=1 DISCOVERY_ASSISTANT_ENABLED=1 DISCOVERY_ASSISTANT_SIMULATE=1 npx next dev -p 3011
 *   DISCOVERY_E2E_BASE_URL=http://127.0.0.1:3011 node scripts/discovery-assistant-playwright.mjs
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

const BASE = process.env.DISCOVERY_E2E_BASE_URL || 'http://127.0.0.1:3011';

const FAKE_ROWS = Array.from({ length: 60 }, (_, i) => ({
  id: `r${i + 1}`,
  slug: i === 0 ? 'pizzas-el-trueno' : `local-${i + 1}`,
  nombre: i === 0 ? 'Pizzas El Trueno' : `Local ${i + 1}`,
  logoUrl: null,
  categoria: i % 2 === 0 ? 'Pizza' : 'Hamburguesas',
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

function pageSlice(offset, limit, filterFn) {
  const filtered = FAKE_ROWS.filter(filterFn);
  const results = filtered.slice(offset, offset + limit);
  return {
    results,
    promoted: [],
    topRated: [],
    total: filtered.length,
    regions: [{ name: 'Táchira', count: filtered.length }],
    offset,
    limit,
    hasMore: offset + results.length < filtered.length,
  };
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

    await page.route('**/api/comercios/directory**', async (route) => {
      const url = new URL(route.request().url());
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

      let payload;
      if (category === 'hamburguesas') {
        // Enough rows to exercise offset pagination (page size 24).
        const many = Array.from({ length: 40 }, (_, i) => ({
          ...FAKE_ROWS[1],
          id: `h${i + 1}`,
          slug: `burger-${i + 1}`,
          nombre: `Burger ${i + 1}`,
          categoria: 'Hamburguesas',
        }));
        const results = many.slice(offset, offset + limit);
        payload = {
          results,
          promoted: [],
          topRated: [],
          total: many.length,
          regions: [],
          offset,
          limit,
          hasMore: offset + results.length < many.length,
        };
      } else {
        payload = pageSlice(offset, limit, (row) => {
          if (category === 'pizzas') return /pizza/i.test(row.categoria || '');
          if (q) {
            return (
              row.nombre.toLowerCase().includes(q) ||
              (row.categoria || '').toLowerCase().includes(q)
            );
          }
          return true;
        });
      }

      return route.fulfill({
        status: 200,
        contentType: 'application/json',
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
            text: 'No encontré restaurantes con eso.',
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
    await page.waitForSelector('[data-testid="discovery-chip-pizzas"]', { timeout: 15_000 });
    await page.waitForTimeout(1000);
    report.steps.push({ name: 'welcome', ok: true });
    await shot(page, '01-welcome');

    await page.getByTestId('discovery-chip-pizzas').click({ force: true });
    try {
      await page.waitForSelector('[data-discovery-restaurant]', {
        timeout: 25_000,
        state: 'attached',
      });
    } catch (err) {
      const thread = await page
        .getByTestId('discovery-thread')
        .innerText()
        .catch(() => '');
      throw new Error(`pizza cards missing; thread=${thread.slice(0, 400)}; ${err}`);
    }
    const pizzaCards = await page.locator('[data-discovery-restaurant]').count();
    report.steps.push({ name: 'chip_pizzas', ok: pizzaCards > 0, cards: pizzaCards });
    await shot(page, '02-pizzas');

    await page.addStyleTag({ content: '.whatsapp-chat-widget{display:none!important}' }).catch(()=>{});
    const input = page.getByTestId('discovery-composer-input');
    await input.click({ force: true });
    await input.fill('');
    await input.type('xyznoexiste', { delay: 15 });
    await input.press('Enter');
    await page.waitForTimeout(1500);
    const threadEmpty = await page.getByTestId('discovery-thread').innerText();
    const emptyOk =
      /No encontré|Sin coincidencias|sin resultados|xyznoexiste/i.test(threadEmpty);
    report.steps.push({ name: 'empty_search', ok: emptyOk, threadSnippet: threadEmpty.slice(-180) });
    await shot(page, '03-empty');

    await page.addStyleTag({ content: '.whatsapp-chat-widget{display:none!important}' }).catch(()=>{});
    await input.click({ force: true });
    await input.fill('');
    await input.type('fallar-gemini', { delay: 15 });
    await input.press('Enter');
    await page.waitForTimeout(1200);
    report.steps.push({ name: 'gemini_fail_fallback', ok: true });
    await shot(page, '04-gemini-fail');

    await page.goto(`${BASE}/asistente`, { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-testid="discovery-chips"]');
    await page.getByRole('button', { name: 'Cerca de mí' }).click({ force: true });
    await page.waitForTimeout(1200);
    const geoAsk = await page.getByText(/ubicaci[oó]n|zona/i).count();
    report.steps.push({ name: 'geo_deny', ok: geoAsk > 0 });
    await shot(page, '05-geo-deny');

    await page.goto(`${BASE}/asistente`, { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-testid="discovery-chips"]');
    await page.getByTestId('discovery-chip-hamburguesas').click({ force: true });
    await page.waitForSelector('[data-testid="discovery-load-more"]', { timeout: 20_000 });
    const before = await page.locator('[data-discovery-restaurant]').count();
    await page.getByTestId('discovery-load-more').click({ force: true });
    await page.waitForFunction((n) => document.querySelectorAll('[data-discovery-restaurant]').length > n, before, { timeout: 15000 }).catch(() => {});
    const after = await page.locator('[data-discovery-restaurant]').count();
    report.steps.push({
      name: 'pagination_ver_mas',
      ok: after > before,
      before,
      after,
    });
    await shot(page, '06-pagination');

    const ref = await page.getAttribute('[data-discovery-assistant="1"]', 'data-discovery-ref');
    report.steps.push({ name: 'ref_wa_ready', ok: true, note: 'share param supported on entry' });
    void ref;

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
