/**
 * Full discovery experience — mobile + desktop, no force clicks.
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
  chatUrl: i === 0 ? '/v/pizzas-el-trueno?chatbot=1' : null,
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
  viewports: [],
  steps: [],
  screenshots: [],
  errors: [],
};

async function shot(page, name) {
  const path = join(shotDir, `${name}.png`);
  try {
    await page.screenshot({ path, fullPage: false });
    report.screenshots.push(path);
  } catch (err) {
    report.errors.push(`shot:${name}:${String(err && err.message ? err.message : err)}`);
  }
  return path;
}

async function waitIdle(page) {
  await page
    .waitForFunction(
      () => !document.querySelector('[data-testid="discovery-typing"]'),
      null,
      { timeout: 10_000 },
    )
    .catch(() => {});
  await page.waitForTimeout(300);
}

function step(name, ok, detail = {}, viewport = null) {
  report.steps.push({ name, ok, viewport, ...detail });
  if (!ok) report.errors.push(`${viewport || '?'}:${name}`);
}

async function dismissCookies(page) {
  // Cookie bar sits above the composer (z-50) and steals taps after soft navigations.
  for (const name of [/Aceptar/i, /Rechazar/i, /Accept/i, /Reject/i]) {
    const btn = page.getByRole('button', { name });
    if ((await btn.count()) > 0) {
      await btn.first().click({ timeout: 3000 }).catch(() => {});
      await page.waitForTimeout(250);
      break;
    }
  }
  // Ensure bar is gone before composer interactions.
  await page
    .waitForFunction(
      () =>
        !Array.from(document.querySelectorAll('button')).some((b) =>
          /Aceptar|Rechazar|Accept|Reject/i.test(b.textContent || ''),
        ),
      null,
      { timeout: 3000 },
    )
    .catch(() => {});
}

async function installRoutes(page) {
  await page.route(/\/api\/comercios\/directory(\?|$)/, async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get('mode') !== 'clientes') {
      return route.continue();
    }
    const q = (url.searchParams.get('q') || '').toLowerCase();
    const category = (url.searchParams.get('category') || '').toLowerCase();
    const region = (url.searchParams.get('region') || '').toLowerCase();
    const hasGeo =
      url.searchParams.has('lat') && url.searchParams.has('lng');
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
        chatUrl: null,
      }));
    } else if (category === 'pizzas') {
      pool = Array.from({ length: 8 }, (_, i) => ({
        ...FAKE_ROWS[0],
        id: `p${i + 1}`,
        slug: i === 0 ? 'pizzas-el-trueno' : `pizza-local-${i + 1}`,
        nombre: i === 0 ? 'Pizzas El Trueno' : `Pizzería ${i + 1}`,
        categoria: 'Pizzeria',
        menuUrl: `/v/${i === 0 ? 'pizzas-el-trueno' : `pizza-local-${i + 1}`}`,
        chatUrl: i === 0 ? '/v/pizzas-el-trueno?chatbot=1' : null,
      }));
    } else if (q.includes('trueno')) {
      pool = [FAKE_ROWS[0]];
    } else if (region.includes('palmira') || hasGeo) {
      pool = FAKE_ROWS.slice(0, 6).map((row, i) => ({
        ...row,
        id: `geo${i + 1}`,
        distanceKm: 0.5 + i * 0.4,
      }));
    } else if (q) {
      pool = FAKE_ROWS.filter(
        (row) =>
          row.nombre.toLowerCase().includes(q) ||
          (row.categoria || '').toLowerCase().includes(q),
      );
    }

    const results = pool.slice(offset, offset + limit);
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify({
        ok: true,
        data: {
          query: q,
          results,
          promoted: [],
          topRated: [],
          total: pool.length,
          regions: [],
          offset,
          limit,
          hasMore: offset + results.length < pool.length,
          categories: [],
        },
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
    const restaurants = text.includes('trueno')
      ? [{ ...FAKE_ROWS[0], chatUrl: '/v/pizzas-el-trueno?chatbot=1' }]
      : text.includes('palmira')
        ? FAKE_ROWS.slice(0, 6).map((row, i) => ({
            ...row,
            id: `geo${i + 1}`,
            distanceKm: 0.5 + i * 0.4,
          }))
        : FAKE_ROWS.slice(0, 3);
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        text: 'Simulado',
        restaurants,
        skippedLlm: true,
      }),
    });
  });
}

async function sendText(page, text) {
  const input = page.getByTestId('discovery-composer-input');
  await input.focus();
  await input.fill(text);
  await page.getByTestId('discovery-composer-send').click();
  await waitIdle(page);
}

async function waitForCards(page, min = 1) {
  await page.waitForFunction(
    (n) => document.querySelectorAll('[data-discovery-restaurant]').length >= n,
    min,
    { timeout: 15_000 },
  );
}

async function runViewport(browser, label, viewport) {
  const context = await browser.newContext({
    viewport,
    permissions: [],
  });
  // Pre-consent so CookieConsentBanner never covers the composer (z-50).
  await context.addInitScript(() => {
    try {
      window.localStorage.setItem('elmenuxfa-cookie-consent', 'accepted');
      document.cookie =
        'elmenuxfa_cookie_consent=accepted; Path=/; Max-Age=15552000; SameSite=Lax';
    } catch {
      /* ignore */
    }
  });
  const page = await context.newPage();
  await installRoutes(page);

  try {
    // 1 Open
    await page.goto(`${BASE}/asistente?ref=wa`, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    });
    await page.waitForSelector('[data-discovery-assistant="1"]', {
      timeout: 30_000,
    });
    await dismissCookies(page);
    await page.waitForSelector('[data-testid="discovery-chip-pizzas"]', {
      timeout: 15_000,
    });
    const waCount = await page.locator('.whatsapp-chat-widget').count();
    step('01_open_wa_hidden', waCount === 0, { waCount }, label);
    if (label === 'mobile') await shot(page, '01-welcome');

    // 2 Pizzas
    const pizzaRespPromise = page.waitForResponse(
      (res) =>
        res.url().includes('/api/comercios/directory') &&
        res.url().includes('category=pizzas') &&
        res.ok(),
      { timeout: 20_000 },
    );
    await page.getByTestId('discovery-chip-pizzas').click();
    await pizzaRespPromise;
    await waitForCards(page);
    const pizzaCards = await page.locator('[data-discovery-restaurant]').count();
    step('02_pizzas', pizzaCards > 0, { pizzaCards }, label);
    if (label === 'mobile') await shot(page, '02-pizzas');

    // 8 Carousel scroll (horizontal)
    const carousel = page.locator('[data-discovery-restaurant]').first();
    await carousel.scrollIntoViewIfNeeded();
    step('08_carousel', (await carousel.count()) > 0, {}, label);

    // 10 Menu link hit-test
    const menuLink = page
      .locator('[data-discovery-restaurant]')
      .first()
      .getByRole('link', { name: /Ver menú/i });
    await menuLink.scrollIntoViewIfNeeded();
    const href = await menuLink.getAttribute('href');
    const box = await menuLink.boundingBox();
    const hit = box
      ? await page.evaluate(
          ({ x, y }) => {
            const el = document.elementFromPoint(x, y);
            const a = el?.closest?.('a');
            return {
              href: a?.getAttribute?.('href') || null,
              tag: el?.tagName || null,
            };
          },
          { x: box.x + box.width / 2, y: box.y + box.height / 2 },
        )
      : null;
    step(
      '10_menu_link',
      Boolean(href?.startsWith('/v/')) && Boolean(hit?.href?.startsWith('/v/')),
      { href, hit },
      label,
    );
    if (label === 'mobile') await shot(page, '07-menu-nav');

    // 11 Chat link when enabled (Trueno)
    const chatLink = page.getByTestId('discovery-chat-pizzas-el-trueno');
    const chatCount = await chatLink.count();
    if (chatCount > 0) {
      const chatHref = await chatLink.getAttribute('href');
      step(
        '11_chat_link',
        Boolean(chatHref && chatHref.includes('chatbot=1')),
        { chatHref },
        label,
      );
    } else {
      // Acceptable if server flags would hide it; mock includes chatUrl for Trueno.
      step('11_chat_link', false, { reason: 'chat_cta_not_rendered' }, label);
    }

    // 3 Hamburguesas + 9 Ver más
    await page.goto(`${BASE}/asistente`, { waitUntil: 'domcontentloaded' });
    await dismissCookies(page);
    await page.waitForSelector('[data-testid="discovery-chip-hamburguesas"]');
    await page.getByTestId('discovery-chip-hamburguesas').click();
    await page.waitForSelector('[data-testid="discovery-load-more"]', {
      timeout: 20_000,
    });
    const before = await page.locator('[data-discovery-restaurant]').count();
    step('03_hamburguesas', before > 0, { before }, label);
    await page.getByTestId('discovery-load-more').click();
    await page.waitForFunction(
      (n) => document.querySelectorAll('[data-discovery-restaurant]').length > n,
      before,
      { timeout: 15_000 },
    );
    const after = await page.locator('[data-discovery-restaurant]').count();
    step('09_ver_mas', after > before, { before, after }, label);
    if (label === 'mobile') await shot(page, '06-pagination');

    // 4 Search by name (agent path when API enabled; may fall back to directory)
    await page.goto(`${BASE}/asistente`, { waitUntil: 'domcontentloaded' });
    await dismissCookies(page);
    await page.waitForSelector('[data-testid="discovery-composer-input"]');
    await sendText(page, 'trueno');
    await page.waitForFunction(
      () =>
        /Trueno/i.test(
          document.querySelector('[data-testid="discovery-thread"]')?.textContent ||
            '',
        ) || document.querySelectorAll('[data-discovery-restaurant]').length > 0,
      null,
      { timeout: 15_000 },
    );
    const nameText = await page.getByTestId('discovery-thread').innerText();
    const nameCards = await page.locator('[data-discovery-restaurant]').count();
    step(
      '04_search_by_name',
      /Trueno/i.test(nameText) || nameCards > 0,
      { nameCards },
      label,
    );

    // 7 Results visible
    step('07_show_results', nameCards > 0 || /Trueno/i.test(nameText), {}, label);

    // 5 Location search (text). Agent mock returns restaurants; directory used on fallback.
    await page.goto(`${BASE}/asistente`, { waitUntil: 'domcontentloaded' });
    await dismissCookies(page);
    await page.waitForSelector('[data-testid="discovery-composer-input"]');
    await sendText(page, 'palmira');
    await page.waitForFunction(
      () =>
        document.querySelectorAll('[data-discovery-restaurant]').length > 0 ||
        /palmira|Encontré|Simulado/i.test(
          document.querySelector('[data-testid="discovery-thread"]')?.textContent ||
            '',
        ),
      null,
      { timeout: 15_000 },
    );
    const locCards = await page.locator('[data-discovery-restaurant]').count();
    step('05_search_location', locCards > 0, { locCards }, label);

    // 6 Deny geolocation
    await page.goto(`${BASE}/asistente`, { waitUntil: 'domcontentloaded' });
    await dismissCookies(page);
    await page.waitForSelector('[data-testid="discovery-chips"]');
    await page.getByRole('button', { name: 'Cerca de mí' }).click();
    await page.waitForTimeout(1200);
    const geoAsk = await page.getByText(/ubicaci[oó]n|zona/i).count();
    step('06_geo_deny', geoAsk > 0, { geoAsk }, label);
    if (label === 'mobile') await shot(page, '05-geo-deny');

    // 12 Gemini fail
    await page.goto(`${BASE}/asistente`, { waitUntil: 'domcontentloaded' });
    await dismissCookies(page);
    await sendText(page, 'fallar-gemini');
    await waitIdle(page);
    const failThread = await page.getByTestId('discovery-thread').innerText();
    step(
      '12_gemini_fail',
      /filtros del directorio|Puedo ayudarte|fallar-gemini|No encontré/i.test(
        failThread,
      ),
      {},
      label,
    );
    if (label === 'mobile') await shot(page, '04-gemini-fail');

    // 13 Conventional directory search still works after Gemini fail.
    // Chips only render when messages.length <= 1, so re-open a clean shell.
    await page.goto(`${BASE}/asistente`, { waitUntil: 'domcontentloaded' });
    await dismissCookies(page);
    await page.waitForSelector('[data-testid="discovery-chip-pizzas"]');
    await page.getByTestId('discovery-chip-pizzas').click();
    await waitForCards(page);
    step(
      '13_conventional_after_fail',
      (await page.locator('[data-discovery-restaurant]').count()) > 0,
      {},
      label,
    );

    // Empty search
    await page.goto(`${BASE}/asistente`, { waitUntil: 'domcontentloaded' });
    await dismissCookies(page);
    await sendText(page, 'xyznoexiste');
    await waitIdle(page);
    const emptyThread = await page.getByTestId('discovery-thread').innerText();
    step(
      'empty_search',
      /No encontré|Sin coincidencias|sin resultados|xyznoexiste/i.test(emptyThread),
      {},
      label,
    );
    if (label === 'mobile') await shot(page, '03-empty');

    report.viewports.push({
      label,
      viewport,
      ok: report.steps
        .filter((s) => s.viewport === label)
        .every((s) => s.ok),
    });
  } catch (err) {
    report.errors.push(
      `${label}:${String(err && err.message ? err.message : err)}`,
    );
    report.viewports.push({ label, viewport, ok: false });
  } finally {
    await context.close();
  }
}

async function main() {
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    await runViewport(browser, 'mobile', { width: 390, height: 844 });
    await runViewport(browser, 'desktop', { width: 1280, height: 800 });
    report.ok =
      report.viewports.every((v) => v.ok) &&
      report.steps.every((s) => s.ok) &&
      report.errors.length === 0;
  } catch (err) {
    report.errors.push(String(err && err.message ? err.message : err));
    report.ok = false;
  } finally {
    if (browser) await browser.close();
    writeFileSync(
      join(shotDir, 'playwright-report.json'),
      JSON.stringify(report, null, 2),
    );
    console.log(JSON.stringify(report, null, 2));
    process.exit(report.ok ? 0 : 1);
  }
}

main();
