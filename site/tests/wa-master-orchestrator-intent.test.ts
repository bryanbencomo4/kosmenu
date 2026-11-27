/**
 * Acceptance: the consumer assistant follows the LAST explicit intent across a long purchase
 * conversation (isolated QA world: several restaurants in Caracas built from the real public-menu
 * payload; nothing here touches production data).
 *
 * Expected values are computed from the raw menu fixture and the raw tariff — NOT through the code
 * under test — so a wrong price, ordering, fee or filter fails here.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import fixture from './fixtures/qa-bladi-menu.json';
import {
  createEmptyMemory,
  loadWaMasterConfig,
  resolveWaMasterIdentity,
  runWaMasterOrchestrator,
  type WaMasterMemory,
} from '../app/api/wa-master/_lib';
import { createMemoryWaHandoffStore } from '../app/api/_lib/wa-handoff';
import { haversineKm } from '../app/_lib/delivery-config';
import { parseBudget, parseMenuAsk, selectProducts } from '../app/api/wa-master/_lib/brain/menu';
import { crossAsk, detectExclusion, detectReset, isRestaurantListAsk, parseCount } from '../app/api/wa-master/_lib/brain/task';
import {
  directoryCalls,
  loadQaDelivery,
  loadQaMenu,
  qaDiscovery,
  qaGeocode,
  QA_SHOPS,
  QA_SNAPS,
} from './fixtures/wa-qa-world';

vi.mock('../app/api/_lib/geocode', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../app/api/_lib/geocode')>();
  const world = await import('./fixtures/wa-qa-world');
  return { ...actual, geocodeAddress: async (text: string) => world.qaGeocode(text) };
});

const USER = '584120077711';
const cfg = () =>
  loadWaMasterConfig({
    PLATFORM_WA_MASTER: '1',
    PLATFORM_WA_MASTER_RECEPTIONIST: '1',
    PLATFORM_WA_MASTER_BRAIN: '1',
  } as unknown as NodeJS.ProcessEnv);

let composeCalls = 0;

async function say(text: string, memory: WaMasterMemory) {
  const identity = resolveWaMasterIdentity({ fromDigits: USER, catalog: [] });
  return runWaMasterOrchestrator(
    { fromDigits: USER, text, messageId: `m_${Math.random().toString(36).slice(2)}`, nowMs: Date.now(), identity, memory },
    cfg(),
    {
      executeDiscovery: qaDiscovery,
      loadShopDelivery: loadQaDelivery,
      loadPublicMenu: loadQaMenu,
      handoffStore: createMemoryWaHandoffStore(),
      compose: async () => {
        composeCalls += 1;
        return ['(compuesto por IA)'];
      },
    },
  );
}
const fresh = () => createEmptyMemory(USER, Date.now(), 86_400_000);
const body = (r: { replies: string[] }) => r.replies.join('\n');
const seed = (patch: Record<string, unknown>): WaMasterMemory => {
  const m = fresh();
  return { ...m, summary: { ...m.summary, ...patch } } as WaMasterMemory;
};

beforeEach(() => {
  directoryCalls.length = 0;
  composeCalls = 0;
});

// ---------------------------------------------------------------------------
// Independent expectations (raw fixture, never the code under test)
// ---------------------------------------------------------------------------
type RawProduct = { nombre: string; precio: number; categoria_id: string; disponible: boolean };
const RAW = fixture as unknown as {
  categorias: Array<{ id: string; nombre: string }>;
  productos: RawProduct[];
  comercio: { delivery_tarifas: { zones: Array<{ min_distance: number; max_distance: number; price: number }> } };
};
const BURGER_CAT = RAW.categorias.find((c) => c.nombre === 'HAMBURGUESAS')!.id;
const burgersAt = (mult: number) =>
  RAW.productos
    .filter((p) => p.categoria_id === BURGER_CAT && p.disponible)
    .map((p) => ({ nombre: p.nombre, price: Math.round(p.precio * mult) }));
const minBurger = (mult: number) => Math.min(...burgersAt(mult).map((b) => b.price));
const fmt = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const cop = (n: number) => `${fmt(n)} COP`;
const shop = (key: string) => QA_SHOPS.find((s) => s.key === key)!;
const PLACE = qaGeocode('Los Palos Grandes')!;
/** Zone tariff by straight-line distance from the restaurant to the person's place. */
const feeTo = (key: string) => {
  const s = shop(key);
  const km = haversineKm({ lat: s.lat, lng: s.lng }, PLACE)!;
  const z = RAW.comercio.delivery_tarifas.zones.find((x) => km >= x.min_distance && km < x.max_distance)!;
  return z.price;
};
const numbered = (text: string) =>
  text
    .split('\n')
    .filter((l) => /^\d+\.\s/.test(l))
    .map((l) => l.replace(/^\d+\.\s+/, ''));

const SCRIPT = [
  'Busco hamburguesas en Los Palos Grandes, Caracas',
  'Recomiéndame tres restaurantes',
  'Me interesa TORO BRAVO',
  'Dime las tres hamburguesas más económicas',
  '¿Cuánto cuesta el delivery hasta mi ubicación?',
  'No quiero TORO BRAVO. Busca otros restaurantes',
  'Empecemos de nuevo. Quiero hamburguesas económicas en Caracas',
  'Muéstrame tres opciones con delivery en Los Palos Grandes',
  '¿Cuál es la más económica?',
  '¿Y cuánto pagaría por dos?',
];

describe('acceptance: 10-turn purchase conversation, the last intent always wins', () => {
  it('follows every intent, carries only what is still pertinent, and every figure matches the real menus', async () => {
    const transcript: string[] = [];
    const bodies: string[] = [];
    let m = fresh();
    const turn = async (i: number) => {
      const r = await say(SCRIPT[i], m);
      m = r.memory;
      bodies.push(body(r));
      transcript.push(`${i + 1}. 👤 ${SCRIPT[i]}\n🤖 ${body(r)}`);
      return r;
    };

    // 1. Search burgers in Los Palos Grandes, Caracas (city = Caracas, neighbourhood = Los Palos Grandes).
    const t1 = await turn(0);
    expect(body(t1)).toMatch(/TORO BRAVO/);
    expect(body(t1)).toMatch(/QA Smash House/);
    expect(body(t1)).not.toMatch(/Maracaibo/);
    expect(body(t1)).not.toMatch(/COP|delivery \d/); // a restaurant search shows no prices nor fees
    expect(m.summary.zone).toBe('Caracas');
    expect(m.summary.placeText).toBe('Los Palos Grandes, Caracas');
    expect(directoryCalls[0].args).toMatchObject({ region: 'Caracas', category: 'hamburguesas' });

    // 2. "Recomiéndame tres restaurantes": still burgers, still Caracas; names only, nothing unasked.
    const t2 = await turn(1);
    const l2 = numbered(body(t2));
    expect(l2).toHaveLength(3);
    expect(l2[0]).toContain('TORO BRAVO');
    expect(l2.join('\n')).toMatch(/QA Smash House/);
    expect(body(t2)).toMatch(/3 de los 4/); // says there are more, never silently truncates
    expect(body(t2)).not.toMatch(/Maracaibo/); // other city
    expect(body(t2)).not.toMatch(/COP|delivery \d/); // no prices / no delivery computed unasked
    expect(body(t2)).not.toMatch(/en qué ciudad|ciudad o zona estás/i);
    expect(m.summary.lastRestaurants).toHaveLength(3);
    // 3. Pick TORO BRAVO.
    const t3 = await turn(2);
    expect(m.summary.activeRestaurant?.nombre).toBe('TORO BRAVO');
    expect(body(t3)).toMatch(/HAMBURGUESAS \(desde 15\.000 COP\)/);
    expect(body(t3)).not.toMatch(/Smash|Altamira/);

    // 4. Three cheapest burgers of THAT restaurant: three products, never "three dollars", no drinks.
    const t4 = await turn(3);
    const expected = [...burgersAt(1)]
      .sort((a, b) => a.price - b.price || a.nombre.localeCompare(b.nombre, 'es'))
      .filter((b, i, a) => a.findIndex((x) => x.nombre === b.nombre && x.price === b.price) === i)
      .slice(0, 3);
    const l4 = body(t4).split('\n').filter((l) => l.startsWith('• ') && l.includes(' — '));
    expect(l4).toEqual(expected.map((b) => `• ${b.nombre} — ${cop(b.price)}`));
    expect(body(t4)).not.toMatch(/JUGO|AGUA|MALTA|dólar|USD/i);
    expect(new Set(l4).size).toBe(3);

    // 5. Delivery to the person's location (real tariff, honest about the approximate place).
    const t5 = await turn(4);
    expect(body(t5)).toContain(cop(feeTo('toro-bravo')));
    expect(body(t5)).toMatch(/Los Palos Grandes/);
    expect(body(t5)).toMatch(/aproximada/);
    expect(t5.toolsUsed).toContain('delivery_quote');

    // 6. "No quiero TORO BRAVO. Busca otros restaurantes": excluded, nothing else lost.
    const t6 = await turn(5);
    const l6 = numbered(body(t6));
    expect(l6.length).toBeGreaterThanOrEqual(3);
    expect(l6.join('\n')).not.toMatch(/TORO BRAVO/);
    expect(l6.join('\n')).toMatch(/QA Smash House/);
    expect(l6.join('\n')).toMatch(/QA Burger Altamira/);
    expect(l6.join('\n')).not.toMatch(/Maracaibo/);
    expect(m.summary.activeRestaurant ?? null).toBeNull();
    expect(m.summary.lastMenuView ?? null).toBeNull();
    expect(m.summary.task?.excluded).toContain('toro bravo');
    expect(m.summary.task?.food?.category).toBe('hamburguesas');
    expect(m.summary.zone).toBe('Caracas');
    expect(m.summary.lastRestaurants.map((r) => r.nombre)).not.toContain('TORO BRAVO');
    expect(directoryCalls.at(-1)!.args).toMatchObject({ region: 'Caracas', category: 'hamburguesas' });

    // 7. "Empecemos de nuevo…": task wiped (the exclusion too), location kept, cheap = sorted by price.
    const t7 = await turn(6);
    expect(body(t7)).toMatch(/^Listo, empezamos de nuevo/);
    const l7 = numbered(body(t7));
    expect(l7.map((l) => /\*(.+?)\*/.exec(l)![1])).toEqual([
      'QA Grill Chacao', // 0.6x
      'QA Smash House', // 0.8x
      'QA Burger Altamira', // 0.9x
      'TORO BRAVO', // 1x — back, the exclusion belonged to the old task
    ]);
    expect(l7[0]).toContain(cop(minBurger(0.6)));
    expect(m.summary.task?.excluded).toEqual([]);
    expect(m.summary.placeText).toBe('Los Palos Grandes, Caracas'); // not downgraded to "Caracas"
    expect(m.summary.geo?.label).toBe('Los Palos Grandes, Caracas');
    expect(m.summary.activeRestaurant ?? null).toBeNull();

    // 8. Three options WITH delivery in Los Palos Grandes: verified one by one.
    const t8 = await turn(7);
    const l8 = numbered(body(t8));
    expect(l8).toHaveLength(3);
    expect(l8.map((l) => /\*(.+?)\*/.exec(l)![1])).toEqual(['QA Smash House', 'QA Burger Altamira', 'TORO BRAVO']);
    expect(body(t8)).not.toMatch(/Chacao|Maracaibo/); // no delivery / another city
    expect(l8[0]).toContain(`delivery ${cop(feeTo('qa-smash-palos'))}`);
    expect(l8[1]).toContain(`delivery ${cop(feeTo('qa-burger-altamira'))}`);
    expect(l8[2]).toContain(`delivery ${cop(feeTo('toro-bravo'))}`);

    // 9. "¿Cuál es la más económica?": compares the real menus of THOSE three.
    const t9 = await turn(8);
    const smashMin = minBurger(0.8);
    expect(body(t9)).toContain(`${cop(smashMin)} en *QA Smash House*`);
    expect(body(t9)).toContain(`${cop(minBurger(0.9))} en *QA Burger Altamira*`);
    expect(body(t9)).toContain(`${cop(minBurger(1))} en *TORO BRAVO*`);
    expect(body(t9)).not.toMatch(/Chacao|Maracaibo/);
    expect(body(t9)).toContain(cop(smashMin + feeTo('qa-smash-palos'))); // with delivery
    expect(m.summary.activeRestaurant?.nombre).toBe('QA Smash House');

    // 10. "¿Y cuánto pagaría por dos?": two of THAT burger + that restaurant's delivery.
    const t10 = await turn(9);
    const fee = feeTo('qa-smash-palos');
    expect(body(t10)).toContain(`2 × VILLA — ${cop(smashMin)}`);
    expect(body(t10)).toContain(`Subtotal: ${cop(2 * smashMin)}`);
    expect(body(t10)).toContain(`Total estimado: ${cop(2 * smashMin + fee)}`);
    expect(body(t10)).not.toMatch(/TORO BRAVO|Altamira/);

    // Whole-conversation invariants.
    bodies.forEach((b, i) => {
      if (i > 0) expect(b).not.toBe(bodies[i - 1]); // no repeated message
      expect(b).not.toMatch(/\(compuesto por IA\)/); // priced answers never pass through the language model
      expect(b).not.toMatch(/Puedes consultar el menú aquí|Entra al enlace para verificar|¿Quieres que te ayude con algo más\?/);
      expect(b).not.toMatch(/\bUSD\b|\bVES\b|\bBs\b|\$/);
    });
    // Only the very first (plain search) turn may be reworded; every priced/verified answer is final.
    expect(composeCalls).toBeLessThanOrEqual(1);

    console.log('\n===== CONVERSACIÓN DE ACEPTACIÓN (10 mensajes, mundo QA aislado) =====\n' + transcript.join('\n\n'));
  });
});

describe('intent priority and memory', () => {
  it('"empecemos de nuevo" alone resets the task but keeps where the person is', async () => {
    let m = (await say('Busco hamburguesas en Los Palos Grandes, Caracas', fresh())).memory;
    m = (await say('Me interesa TORO BRAVO', m)).memory;
    const r = await say('Empecemos de nuevo', m);
    expect(body(r)).toMatch(/empezamos de nuevo/i);
    expect(body(r)).toMatch(/Los Palos Grandes/);
    expect(r.memory.summary.activeRestaurant ?? null).toBeNull();
    expect(r.memory.summary.lastRestaurants).toEqual([]);
    expect(r.memory.summary.task ?? null).toBeNull();
    expect(r.memory.summary.placeText).toBe('Los Palos Grandes, Caracas');
    expect(r.memory.summary.geo?.label).toBe('Los Palos Grandes, Caracas');
  });

  it('"quiero empezar a vender" is not a reset', () => {
    expect(detectReset('quiero empezar a vender mis productos').reset).toBe(false);
    expect(detectReset('Empecemos de nuevo. Quiero hamburguesas').rest).toBe('Quiero hamburguesas');
    expect(detectReset('olvida todo, busco pizza en Valencia').reset).toBe(true);
  });

  it('a count is a number of products/places, never an amount of money', () => {
    expect(parseBudget('Dime las 3 hamburguesas más económicas')).toBeNull();
    expect(parseBudget('las tres más baratas')).toBeNull();
    expect(parseBudget('Tengo 3 dólares')).toMatchObject({ amount: 3, currency: 'USD' });
    expect(parseCount('recomiéndame tres restaurantes')).toBe(3);
    expect(parseCount('muéstrame 4 opciones')).toBe(4);
    const snap = QA_SNAPS['toro-bravo'];
    const ask = parseMenuAsk('Dime las tres hamburguesas más económicas', snap, null);
    expect(ask.budget).toBeNull();
    expect(ask.n).toBe(3);
    expect(selectProducts(snap, ask, null).lines).toHaveLength(3);
  });

  it('a name after a negation is excluded, whether known or not', () => {
    const known = [{ id: 'a', nombre: 'TORO BRAVO' }, { id: 'b', nombre: 'QA Smash House' }];
    expect(detectExclusion('No quiero TORO BRAVO. Busca otros restaurantes', known)).toMatchObject({ ids: ['a'] });
    expect(detectExclusion('descarta Pizzería Roma', [])).toMatchObject({ names: ['pizzeria roma'] });
    expect(detectExclusion('quiero TORO BRAVO', known)).toBeNull();
    expect(detectExclusion('sin cebolla por favor', known)).toBeNull();
  });

  it('city, neighbourhood and restaurant are different things', async () => {
    expect(isRestaurantListAsk('quiero ver el menu de un restaurante')).toBe(false);
    expect(isRestaurantListAsk('que opciones tiene el menu')).toBe(false);
    expect(crossAsk('cual es la mas economica')).toBe('cheapest');
    // A restaurant whose name contains a city is picked as a restaurant, not searched as a city.
    const toro = QA_SNAPS['toro-bravo'];
    const ref = { id: toro.id, slug: toro.slug, nombre: 'Caracas Burger', menuUrl: `https://elmenuxfa.com/v/${toro.slug}`, chatUrl: null };
    const other = QA_SNAPS['qa-smash-palos'];
    const ref2 = { id: other.id, slug: other.slug, nombre: 'QA Smash House', menuUrl: `https://elmenuxfa.com/v/${other.slug}`, chatUrl: null };
    const r = await say('Me interesa Caracas Burger', seed({ lastRestaurants: [ref, ref2], zone: 'Caracas' }));
    expect(r.memory.summary.activeRestaurant?.id).toBe(toro.id);
    expect(directoryCalls).toHaveLength(0); // no new search
  });

  it('asks for the location only when delivery cannot be verified without it', async () => {
    const r = await say('Muéstrame tres opciones con delivery en Caracas', seed({ zone: 'Caracas' }));
    // The reply is the location question (the mock composer rewrites its text); no fee was invented.
    expect(r.memory.summary.brainPending).toMatchObject({ kind: 'zone', near: true });
    expect(body(r)).not.toMatch(/delivery \d|\d\.000/);
    expect(directoryCalls).toHaveLength(0); // nothing was searched or listed before knowing where they are
  });

  it('the selected restaurant expires instead of lingering forever', async () => {
    const toro = QA_SNAPS['toro-bravo'];
    const ref = { id: toro.id, slug: toro.slug, nombre: 'TORO BRAVO', menuUrl: `https://elmenuxfa.com/v/${toro.slug}`, chatUrl: null };
    const stale = seed({ activeRestaurant: ref, activeAtMs: Date.now() - 50 * 60 * 1000, lastRestaurants: [ref] });
    const r = await say('Dime las tres hamburguesas más económicas', stale);
    expect(body(r)).not.toMatch(/VILLA — 15\.000 COP/);
    const live = seed({ activeRestaurant: ref, activeAtMs: Date.now() - 5 * 60 * 1000, lastRestaurants: [ref] });
    const r2 = await say('Dime las tres hamburguesas más económicas', live);
    expect(body(r2)).toMatch(/VILLA — 15\.000 COP/);
  });

  it('never ranks the same dish twice', () => {
    const snap = QA_SNAPS['toro-bravo'];
    const villa = snap.products.find((p) => p.nombre === 'VILLA')!;
    const dup = { ...snap, products: [...snap.products, { ...villa, id: 'dup-villa' }] };
    const ask = parseMenuAsk('las tres hamburguesas más baratas', dup, null);
    const names = selectProducts(dup, ask, null).lines.map((l) => l.product.nombre);
    expect(new Set(names).size).toBe(names.length);
    expect(names.filter((n) => n === 'VILLA')).toHaveLength(1);
  });
});

describe('when a restaurant cannot serve the person, real alternatives are offered', () => {
  it('picking a restaurant in another city says so and lists the ones that do deliver', async () => {
    const mar = QA_SNAPS['qa-burger-maracaibo'];
    const ref = { id: mar.id, slug: mar.slug, nombre: mar.nombre, menuUrl: `https://elmenuxfa.com/v/${mar.slug}`, chatUrl: null };
    const m = seed({
      lastRestaurants: [ref],
      zone: 'Caracas',
      placeText: 'Los Palos Grandes, Caracas',
      foodHint: 'hamburguesas',
      geo: { lat: PLACE.lat, lng: PLACE.lng, label: 'Los Palos Grandes, Caracas', atMs: Date.now(), approx: 'place' },
    });
    const r = await say('Me interesa QA Burger Maracaibo', m);
    expect(body(r)).toMatch(/⚠️/);
    expect(body(r)).toMatch(/queda en Centro, Maracaibo/);
    expect(body(r)).toMatch(/te muestro los de \*Caracas\*/);
    expect(body(r)).not.toMatch(/delivery \d|Total estimado/); // no coverage claimed without checking
    const d = await say('¿hacen delivery hasta mi casa?', r.memory);
    expect(body(d)).toMatch(/no te llega|demasiado lejos/);
    expect(body(d)).toMatch(/Estos sí te llegan/);
  });
});
