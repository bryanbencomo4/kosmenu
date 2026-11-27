/**
 * Consumer chatbot orchestrator: one decision step (`planTurn`) separates
 *   A) searching RESTAURANTS (directory, names only unless asked),
 *   B) querying ONE menu,
 *   C) COMPARING several menus,
 *   D) delivery (only when asked),
 * and the memory (task / exclusions / investigated / last search) follows the LAST explicit intent.
 *
 * Isolated QA world (tests/fixtures/wa-qa-world.ts): burger + pizza shops built from the real public-menu
 * payload; the directory tool is the real tool contract (region/category/paging/total/hasMore).
 * Expectations are computed from the raw fixture, never through the code under test.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import fixture from './fixtures/qa-bladi-menu.json';
import {
  createEmptyMemory,
  loadWaMasterConfig,
  resolveWaMasterIdentity,
  runWaMasterOrchestrator,
  type WaMasterMemory,
} from '../app/api/wa-master/_lib';
import { createMemoryWaHandoffStore } from '../app/api/_lib/wa-handoff';
import { planTurn } from '../app/api/wa-master/_lib/brain/plan';
import { sameRestaurantName } from '../app/api/wa-master/_lib/brain/task';
import { classifyCentralTopic } from '../app/api/wa-master/_lib/brain/topics';
import {
  deliveryLoads,
  directory,
  directoryCalls,
  loadQaDelivery,
  loadQaMenuTracked,
  menuLoads,
  qaDiscovery,
  QA_SHOPS,
} from './fixtures/wa-qa-world';

vi.mock('../app/api/_lib/geocode', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../app/api/_lib/geocode')>();
  const world = await import('./fixtures/wa-qa-world');
  return { ...actual, geocodeAddress: async (text: string) => world.qaGeocode(text) };
});

const USER = '584120077799';
const cfg = () =>
  loadWaMasterConfig({
    PLATFORM_WA_MASTER: '1',
    PLATFORM_WA_MASTER_RECEPTIONIST: '1',
    PLATFORM_WA_MASTER_BRAIN: '1',
  } as unknown as NodeJS.ProcessEnv);

async function say(text: string, memory: WaMasterMemory) {
  const identity = resolveWaMasterIdentity({ fromDigits: USER, catalog: [] });
  return runWaMasterOrchestrator(
    { fromDigits: USER, text, messageId: `m_${Math.random().toString(36).slice(2)}`, nowMs: Date.now(), identity, memory },
    cfg(),
    {
      executeDiscovery: qaDiscovery,
      loadShopDelivery: loadQaDelivery,
      loadPublicMenu: loadQaMenuTracked,
      handoffStore: createMemoryWaHandoffStore(),
      compose: async () => ['(compuesto por IA)'],
    },
  );
}
const fresh = () => createEmptyMemory(USER, Date.now(), 86_400_000);
const body = (r: { replies: string[] }) => r.replies.join('\n');
const numbered = (text: string) =>
  text
    .split('\n')
    .filter((l) => /^\d+\.\s/.test(l))
    .map((l) => /\*(.+?)\*/.exec(l)![1]);

/** Runs a scripted conversation and returns every turn's reply, tool traffic and memory. */
async function talk(script: string[], start: WaMasterMemory = fresh()) {
  let m = start;
  const turns: Array<{ text: string; body: string; dir: Array<Record<string, unknown>>; menus: string[]; deliveries: string[]; memory: WaMasterMemory }> = [];
  for (const text of script) {
    directoryCalls.length = 0;
    menuLoads.length = 0;
    deliveryLoads.length = 0;
    const r = await say(text, m);
    m = r.memory;
    turns.push({ text, body: body(r), dir: directoryCalls.map((d) => d.args), menus: [...menuLoads], deliveries: [...deliveryLoads], memory: m });
  }
  return turns;
}

beforeEach(() => {
  directoryCalls.length = 0;
  menuLoads.length = 0;
  deliveryLoads.length = 0;
  directory.pageCap = 120;
});
afterEach(() => {
  directory.pageCap = 120;
});

// ---------------------------------------------------------------------------
// Independent expectations (raw fixture)
// ---------------------------------------------------------------------------
type RawProduct = { nombre: string; precio: number; categoria_id: string; disponible: boolean };
const RAW = fixture as unknown as { categorias: Array<{ id: string; nombre: string }>; productos: RawProduct[] };
const BURGER_CAT = RAW.categorias.find((c) => c.nombre === 'HAMBURGUESAS')!.id;
const fmt = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const cop = (n: number) => `${fmt(n)} COP`;
/** Price of the margarita pizza at a shop (the QA pizza menus rename the burger category). */
const margarita = (mult: number) => {
  const villa = RAW.productos.find((p) => p.categoria_id === BURGER_CAT && p.nombre === 'VILLA')!;
  return Math.round(villa.precio * mult);
};
const shopMult = (key: string) => QA_SHOPS.find((s) => s.key === key)!.mult;
const PRICE_OR_FEE = /\d\.\d{3} COP|\$\d|delivery \d|Subtotal|Total estimado|desde \d/;

const CARACAS_BURGERS = ['TORO BRAVO', 'QA Smash House', 'QA Burger Altamira', 'QA Grill Chacao'];
const CARACAS_PIZZAS = ['QA Pizza Palos', 'QA Pizza Chacao', 'QA Pizza Altamira', 'QA Pizza Dólar'];

// ---------------------------------------------------------------------------
// The regression that failed in production
// ---------------------------------------------------------------------------
describe('regression: leaving the TORO BRAVO menu for a fresh full-directory search', () => {
  const LONG =
    'No quiero consultar el menú de TORO BRAVO. Quiero que abandones esa consulta y ejecutes una búsqueda nueva en el directorio completo de ElMenúXFA. ' +
    'Busca todos los restaurantes de Caracas que tengan hamburguesas disponibles. Primero dame sus nombres, sin consultar delivery todavía. No me muestres productos ni precios.';

  it('runs a NEW directory search, shows only names, opens no menu and asks no delivery', async () => {
    const turns = await talk(['Busco hamburguesas en Caracas', 'Me interesa TORO BRAVO', LONG]);
    expect(turns[1].memory.summary.activeRestaurant?.nombre).toBe('TORO BRAVO'); // state: viewing TORO BRAVO's menu
    const t = turns[2];

    // A real directory search, whole directory (paged at the tool's maximum), Caracas + burgers.
    expect(t.dir).toHaveLength(1);
    expect(t.dir[0]).toMatchObject({ region: 'Caracas', category: 'hamburguesas', limit: 120, offset: 0 });
    // The TORO BRAVO menu was NOT consulted again, nor any other menu, nor any delivery tariff.
    expect(t.menus).toEqual([]);
    expect(t.deliveries).toEqual([]);

    // Every burger shop of Caracas, by name; no sold-out shop, no pizza shop, no other city.
    expect(numbered(t.body).sort()).toEqual([...CARACAS_BURGERS].sort());
    expect(t.body).not.toMatch(/Agotado|Pizza|Maracaibo/);
    // No products, no prices, no delivery figures, no composer rewrite.
    expect(t.body).not.toMatch(PRICE_OR_FEE);
    expect(t.body).not.toMatch(/\bCOP\b|VILLA|BEBIDAS|\(compuesto por IA\)/);
    expect(t.body).toMatch(/directorio completo/);

    // Memory: the old task is gone; the new one is a search with the investigated scope.
    const sum = t.memory.summary;
    expect(sum.activeRestaurant ?? null).toBeNull();
    expect(sum.lastMenuView ?? null).toBeNull();
    expect(sum.task?.op).toBe('search');
    expect(sum.task?.excluded).toEqual([]); // "no quiero consultar el menú" is NOT "excluye TORO BRAVO"
    expect(sum.task?.lastSearch).toMatchObject({ total: 4, complete: true, shown: 4 });
    expect(sum.lastRestaurants.map((r) => r.nombre)).toContain('TORO BRAVO');
  });

  it('works the same from a seeded "viewing the TORO BRAVO menu" state', async () => {
    const toro = (await talk(['Me interesa TORO BRAVO']))[0];
    const seeded = toro.memory;
    const [t] = await talk([LONG], seeded);
    expect(t.dir[0]).toMatchObject({ region: 'Caracas', category: 'hamburguesas' });
    expect(t.menus).toEqual([]);
    expect(numbered(t.body)).toHaveLength(4);
    expect(t.body).not.toMatch(PRICE_OR_FEE);
  });
});

// ---------------------------------------------------------------------------
// The 10-step sequence the owner asked to verify
// ---------------------------------------------------------------------------
describe('sequence: burgers → pizzas → three restaurants → three menus → compare → cheapest → switch → exclude → restart → total', () => {
  it('follows the last explicit intent at every step', async () => {
    const turns = await talk([
      'Busco hamburguesas en Los Palos Grandes, Caracas', // 0
      'Mejor quiero pizzas en Caracas', // 1 — switch burgers → pizzas
      'Dame tres restaurantes', // 2 — three restaurants
      'Revisa los menús de esos tres', // 3 — review the three menus
      'Compara sus precios', // 4 — compare prices
      '¿Cuál es el más económico?', // 5 — cheapest
      'Cambia de restaurante', // 6 — change restaurant
      'No quiero QA Pizza Palos', // 7 — exclude an establishment
      'Empecemos de nuevo, pizzas', // 8 — restart keeping the location
      'Me interesa QA Pizza Palos', // 9 (pick)
      '¿Cuánto sería el total de dos margarita con delivery?', // 10 — order total with delivery
    ]);

    // 1. The food switch replaces the task: pizza shops only, no burger leftovers.
    expect(numbered(turns[1].body).sort()).toEqual([...CARACAS_PIZZAS].sort());
    expect(turns[1].body).not.toMatch(/TORO BRAVO|Smash|Burger|Grill/);
    expect(turns[1].dir[0]).toMatchObject({ region: 'Caracas', category: 'pizzas' });
    expect(turns[1].memory.summary.task?.food?.category).toBe('pizzas');
    expect(turns[1].body).not.toMatch(PRICE_OR_FEE);

    // 2. "tres restaurantes" is three PLACES (not a dish), and the answer admits there are more.
    expect(numbered(turns[2].body)).toHaveLength(3);
    expect(turns[2].body).toMatch(/3 de los 4/);
    expect(turns[2].menus).toEqual([]);
    expect(turns[2].deliveries).toEqual([]);

    // 3–5. The three shown menus are opened (all three, not just the last one) and only pizzas are compared.
    // Near Los Palos Grandes the three closest are Palos, Dólar (USD) and Chacao.
    const shown = numbered(turns[2].body);
    expect(shown).toEqual(['QA Pizza Palos', 'QA Pizza Dólar', 'QA Pizza Chacao']);
    expect([...turns[3].menus].sort()).toEqual(['qa-pizza-chacao', 'qa-pizza-palos', 'qa-pizza-usd']);
    for (const n of shown) expect(turns[3].body).toContain(`*${n}*`);
    expect(turns[3].body).toMatch(/PIZZA MARGARITA/);
    expect(turns[3].body).not.toMatch(/SALCHI|PERROS|BEBIDAS|PAPAS|HAMBURGUESA|JUGO|MALTA|AGUA/);
    expect(turns[3].deliveries).toEqual([]); // comparing is not a delivery request
    expect(turns[3].memory.summary.task?.op).toBe('compare');
    expect(turns[3].memory.summary.task?.investigated).toHaveLength(3);
    expect(turns[3].body).toMatch(/COP y USD/); // two currencies are announced, never mixed

    // Prices come from the real menus: shop blocks (step 3) and the per-product ranking (step 4).
    const price = (key: string) => cop(margarita(shopMult(key)));
    expect(turns[3].body).toContain(`PIZZA MARGARITA — ${price('qa-pizza-palos')}`);
    expect(turns[3].body).toContain(`PIZZA MARGARITA — ${price('qa-pizza-chacao')}`);
    expect(turns[3].body).toMatch(/PIZZA MARGARITA — \$\d/); // the USD shop keeps its own currency
    expect(turns[4].body).toContain(
      `PIZZA MARGARITA: QA Pizza Chacao ${price('qa-pizza-chacao')} · QA Pizza Palos ${price('qa-pizza-palos')}`,
    );
    expect(turns[4].dir).toEqual([]); // the comparison re-used the three restaurants, no new search
    expect(turns[4].body).not.toMatch(/SALCHI|PERROS|BEBIDAS|PAPAS|HAMBURGUESA|Altamira/);

    // 6. Cheapest among those three, per currency (no verifiable rate), never a re-query of one shop.
    expect(turns[5].body).toContain(`${price('qa-pizza-chacao')} en *QA Pizza Chacao*`);
    expect(turns[5].body).toMatch(/\$3 en \*QA Pizza Dólar\*/);
    expect(turns[5].body).not.toMatch(/Altamira|TORO BRAVO/);
    expect(turns[5].dir).toEqual([]);
    // 7. "Cambia de restaurante": a NEW directory search (never a re-query of one shop). No single restaurant
    //    was in focus (two currencies, no winner), so nothing is excluded and the pizza list comes back.
    expect(turns[6].dir).toHaveLength(1);
    expect(turns[6].dir[0]).toMatchObject({ region: 'Caracas', category: 'pizzas' });
    expect(numbered(turns[6].body).sort()).toEqual([...CARACAS_PIZZAS].sort());
    expect(turns[6].menus).toEqual([]);

    // 8. Excluding a named establishment removes exactly that one (not "QA Pizza Chacao" by shared words).
    expect(numbered(turns[7].body)).not.toContain('QA Pizza Palos');
    expect(numbered(turns[7].body)).toContain('QA Pizza Chacao'); // only the exclusion of THIS task counted
    expect(turns[7].memory.summary.task?.excluded).toContain('qa pizza palos');

    // 9. Restart: exclusions wiped, location kept, same food asked → full pizza list again.
    expect(turns[8].body).toMatch(/empezamos de nuevo/i);
    expect(numbered(turns[8].body).sort()).toEqual([...CARACAS_PIZZAS].sort());
    expect(turns[8].memory.summary.task?.excluded).toEqual([]);
    expect(turns[8].memory.summary.placeText).toBe('Los Palos Grandes, Caracas');

    // 10. Order total with delivery for the chosen restaurant: 2 × margarita, real price, honest about the place.
    const unit = margarita(shopMult('qa-pizza-palos'));
    expect(turns[10].body).toContain(`2 × PIZZA MARGARITA — ${cop(unit)}`);
    expect(turns[10].body).toContain(`Subtotal: ${cop(2 * unit)}`);
    expect(turns[10].body).toMatch(/Total estimado|Delivery hasta/);
    expect(turns[10].body).not.toMatch(/Chacao|Altamira|Dólar/);
  });

  it('a total with delivery and NO restaurant chosen asks which one instead of guessing or quoting plans', async () => {
    const turns = await talk(['Busco pizzas en Caracas', '¿Cuánto cuesta un pedido de dos margarita con delivery?']);
    const t = turns[1];
    expect(t.body).toMatch(/cuál restaurante/);
    expect(t.body).toContain('QA Pizza Palos');
    expect(t.body).not.toMatch(/\bplan(es)?\b|suscripci|\(compuesto por IA\)/i);
    expect(t.menus).toEqual([]);
    expect(t.deliveries).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Completeness, honesty and currencies
// ---------------------------------------------------------------------------
describe('search completeness and honesty', () => {
  it('walks every directory page for an exhaustive search (never stops at the first page)', async () => {
    directory.pageCap = 2;
    const [t] = await talk(['Dame todos los restaurantes de Caracas con hamburguesas, solo los nombres']);
    expect(t.dir.length).toBeGreaterThanOrEqual(2);
    expect(t.dir.map((d) => d.offset)).toEqual(t.dir.map((_, i) => i * 2));
    expect(numbered(t.body).sort()).toEqual([...CARACAS_BURGERS].sort());
    expect(t.memory.summary.task?.lastSearch).toMatchObject({ total: 4, complete: true });
  });

  it('three requested but only one exists: says so, with the scope checked and where else it exists', async () => {
    const [t] = await talk(['Dame tres restaurantes de hamburguesas en Maracaibo']);
    expect(numbered(t.body)).toEqual(['QA Burger Maracaibo']);
    expect(t.body).toMatch(/Me pediste 3, pero .*solo hay \*1\* restaurante/);
    expect(t.body).toMatch(/lo revisé completo|revisé el directorio/i);
    expect(t.body).not.toMatch(PRICE_OR_FEE);
  });

  it('never claims a city has no restaurants when the directory has them elsewhere', async () => {
    const [t] = await talk(['Dame tres restaurantes de pizza en Valencia']);
    expect(t.body).toMatch(/No encontré restaurantes/);
    expect(t.body).toMatch(/Caracas|Maracaibo/); // names the real alternatives
  });

  it('a pizza comparison keeps the USD shop apart from the COP ones', async () => {
    const [, t] = await talk(['Busco pizzas en Caracas', 'Compara los precios de todas las pizzerías de Caracas']);
    expect(t.body).toMatch(/Más económica en COP/);
    expect(t.body).toMatch(/Más económica en USD/);
    const usdBlock = t.body.split('*QA Pizza Dólar*')[1]?.split('\n\n')[0] ?? '';
    expect(usdBlock).toMatch(/\$\d/);
    expect(usdBlock).not.toMatch(/COP/);
    expect(t.body).not.toMatch(/Maracaibo|TORO BRAVO/);
    expect(t.body).not.toMatch(/SALCHI|PERROS|BEBIDAS|PAPAS/);
  });

  it('asking for prices of restaurants never answers with ElMenúXFA plans', async () => {
    const turns = await talk(['Busco pizzas en Caracas', 'Dame tres restaurantes y compárame los precios']);
    expect(turns[1].body).not.toMatch(/\bplan(es)? (básico|pro|premium|gratis)|suscripci|mensualidad/i);
    expect(turns[1].body).toMatch(/PIZZA MARGARITA/);
  });
});

// ---------------------------------------------------------------------------
// Unit: the decision step and the name matching
// ---------------------------------------------------------------------------
describe('planTurn (pure decision step)', () => {
  const plan = (text: string, over: Partial<Parameters<typeof planTurn>[0]> = {}) => {
    const t = text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
    const tr = classifyCentralTopic({ text, hasShops: false });
    return planTurn({
      text,
      t,
      tr,
      known: [],
      active: null,
      listed: [],
      task: null,
      foodHint: null,
      hasCoords: false,
      hasPlace: false,
      deliveryQuestion: false,
      ...over,
    } as Parameters<typeof planTurn>[0]);
  };
  const toro = { id: 'toro', nombre: 'TORO BRAVO' };

  it('"all the restaurants of Caracas" is a directory-wide names-only search even with an active restaurant', () => {
    const p = plan(
      'No quiero consultar el menú de TORO BRAVO. Busca todos los restaurantes de Caracas que tengan hamburguesas disponibles. Primero dame sus nombres, sin consultar delivery todavía. No me muestres productos ni precios',
      { known: [toro], active: toro, listed: [toro] },
    );
    expect(p).toMatchObject({ op: 'search', all: true, namesOnly: true, noProducts: true, noDelivery: true });
    expect(p?.exclusion ?? null).toBeNull(); // a refusal to read a menu is not an exclusion
  });

  it('"revisa los menús de esos tres" compares only when several restaurants are on the table', () => {
    const three = [toro, { id: 'b', nombre: 'QA Smash House' }, { id: 'c', nombre: 'QA Burger Altamira' }];
    expect(plan('Revisa los menús de esos tres', { known: three, listed: three })?.op).toBe('compare');
    expect(plan('Revisa los menús de esos tres', { known: [toro], listed: [toro], active: toro })?.op).not.toBe('compare');
  });

  it('a refusal to see products is never a compare request', () => {
    expect(plan('Dame todos los restaurantes, no me muestres productos ni precios')?.op).toBe('search');
  });

  it('naming a listed restaurant is a pick, not a new search', () => {
    expect(plan('Me interesa TORO BRAVO', { known: [toro], listed: [toro] })).toBeNull();
  });

  it('platform vocabulary stays with the platform flows', () => {
    expect(plan('¿Cuánto cuesta el plan para mi restaurante?')).toBeNull();
  });
});

describe('sameRestaurantName', () => {
  it('matches the same establishment however it is written', () => {
    expect(sameRestaurantName('TORO BRAVO', 'toro bravo')).toBe(true);
    expect(sameRestaurantName('Hamburguesería Bladi Jaiper', 'Hamburgueseria Bladi Jaiper')).toBe(true);
  });
  it('does not confuse two establishments that share one generic word or the same neighbourhood', () => {
    expect(sameRestaurantName('QA Pizza Chacao', 'QA Grill Chacao')).toBe(false);
    expect(sameRestaurantName('QA Pizza Palos', 'QA Pizza Chacao')).toBe(false);
  });
});
