/**
 * WhatsApp consumer assistant: a real purchase conversation, end to end.
 *
 * Menu data = the REAL public menu of "Hamburgueseria Bladi Jaiper" (tests/fixtures/qa-bladi-menu.json,
 * captured from https://elmenuxfa.com/api/menu/hamburgueseria-bladi-jaiper — the same payload
 * /v/{slug} renders). Two isolated shops are built from it:
 *   - REAL: the restaurant as it is in production (Táriba, Táchira — ~700 km from Caracas).
 *   - QA:   a copy placed in Los Palos Grandes (QA only, never written anywhere) so coverage and
 *           delivery math can be proven end to end.
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
import { quoteShopDelivery, shopDeliveryFromRow } from '../app/api/wa-master/_lib/brain/delivery';
import {
  buildMenuSnapshot,
  computeTotals,
  describeTotal,
  parseBudget,
  parseMenuAsk,
  planBudget,
  selectProducts,
  type LoadMenu,
  type MenuSnapshot,
} from '../app/api/wa-master/_lib/brain/menu';
import { extractPlaceText } from '../app/api/wa-master/_lib/brain/place';
import type { WaMasterDiscoveryExecute } from '../app/api/wa-master/_lib/discovery-bridge';
import { createMemoryWaHandoffStore } from '../app/api/_lib/wa-handoff';
import { haversineKm } from '../app/_lib/delivery-config';

const geocodeCalls: string[] = [];

vi.mock('../app/api/_lib/geocode', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../app/api/_lib/geocode')>();
  return {
    ...actual,
    geocodeAddress: async (text: string) => {
      geocodeCalls.push(text);
      const t = text.toLowerCase();
      if (t.includes('palos grandes')) {
        return { lat: 10.4985, lng: -66.842, label: 'Los Palos Grandes, Caracas' };
      }
      if (t.includes('caracas')) return { lat: 10.5061, lng: -66.9146, label: 'Caracas' };
      return null;
    },
  };
});

const USER = '584120077711';
const RAW = fixture as unknown as Parameters<typeof buildMenuSnapshot>[0] & { comercio: Record<string, unknown> };

function makeSource(over: Record<string, unknown>) {
  return { ...RAW, comercio: { ...RAW.comercio, ...over } } as Parameters<typeof buildMenuSnapshot>[0];
}

const REAL_SRC = makeSource({});
const QA_SRC = makeSource({
  id: 'qa-bladi-0001',
  slug: 'qa-hamburgueseria-bladi',
  nombre: 'QA Hamburgueseria Bladi Jaiper',
  direccion: 'Los Palos Grandes, Caracas\nReferencia: QA aislado',
  latitud: 10.5013,
  longitud: -66.8395,
});

const SHOPS = {
  real: { src: REAL_SRC, snap: buildMenuSnapshot(REAL_SRC) },
  qa: { src: QA_SRC, snap: buildMenuSnapshot(QA_SRC) },
};

const loadPublicMenu: LoadMenu = async (key) => {
  for (const s of Object.values(SHOPS)) if (s.snap.slug === key || s.snap.id === key) return s.snap;
  return null;
};

const loadShopDelivery = async (id: string) => {
  for (const s of Object.values(SHOPS)) {
    if (s.snap.id === id) return s.snap.delivery;
  }
  return null;
};

function discoveryFor(which: 'real' | 'qa'): WaMasterDiscoveryExecute {
  const snap = SHOPS[which].snap;
  const origin = snap.delivery.origin!;
  return async (name, args) => {
    const inCaracas = String(args.region || '').toLowerCase().includes('caracas');
    // Production behaviour: the zone filter finds the QA shop only in Caracas; the real shop never.
    const matchesZone = which === 'qa' ? true : !args.region;
    if (args.region && !matchesZone && inCaracas) return { ok: true, tool: name, restaurants: [] };
    const lat = typeof args.lat === 'number' ? args.lat : null;
    const lng = typeof args.lng === 'number' ? args.lng : null;
    const dist = lat != null && lng != null ? Math.round((haversineKm(origin, { lat, lng }) ?? 0) * 10) / 10 : null;
    const nameQuery = String(args.query || '').toLowerCase();
    if (nameQuery && /bladi/.test(nameQuery) === false && /hamburg/.test(nameQuery) === false) {
      return { ok: true, tool: name, restaurants: [] };
    }
    return {
      ok: true,
      tool: name,
      restaurants: [
        {
          id: snap.id,
          slug: snap.slug,
          nombre: snap.nombre,
          menuUrl: `https://elmenuxfa.com/v/${snap.slug}`,
          isOpen: true,
          categoria: 'hamburguesas',
          distanceKm: dist,
        },
      ],
    };
  };
}

const cfg = () =>
  loadWaMasterConfig({
    PLATFORM_WA_MASTER: '1',
    PLATFORM_WA_MASTER_RECEPTIONIST: '1',
    PLATFORM_WA_MASTER_BRAIN: '1',
  } as unknown as NodeJS.ProcessEnv);

let composeCalls = 0;

async function say(text: string, memory: WaMasterMemory, which: 'real' | 'qa') {
  const identity = resolveWaMasterIdentity({ fromDigits: USER, catalog: [] });
  return runWaMasterOrchestrator(
    { fromDigits: USER, text, messageId: `m_${Math.random().toString(36).slice(2)}`, nowMs: Date.now(), identity, memory },
    cfg(),
    {
      executeDiscovery: discoveryFor(which),
      loadShopDelivery,
      loadPublicMenu,
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
const QA_LINK = 'https://elmenuxfa.com/v/qa-hamburgueseria-bladi';

beforeEach(() => {
  geocodeCalls.length = 0;
  composeCalls = 0;
});

// ---------------------------------------------------------------------------
// The data: what the public menu really says
// ---------------------------------------------------------------------------
describe('real menu data (public menu = source of truth)', () => {
  const snap = SHOPS.real.snap;

  it('reads products, categories, currency and prices exactly as published', () => {
    expect(snap.currency).toBe('COP');
    expect(snap.categories.map((c) => c.nombre).sort()).toEqual(
      ['BEBIDAS', 'HAMBURGUESAS', 'PAPAS FRANCESAS', 'PERROS CALIENTES', 'SALCHI PAPAS'].sort(),
    );
    const burger = (n: string) => snap.products.find((p) => p.nombre === n)!;
    expect(burger('VILLA').price).toBe(15000);
    expect(burger('LOMITO').price).toBe(21000);
    expect(burger('CROQ. DE CARNE').price).toBe(21000);
    expect(burger('3 CARNES').price).toBe(37000);
    expect(snap.products.length).toBe(26);
  });

  it('three cheapest burgers, lowest first, and says the tie out loud', () => {
    const ask = parseMenuAsk('dame las tres hamburguesas más económicas', snap, null);
    expect(ask.cheapest).toBe(true);
    expect(ask.n).toBe(3);
    const sel = selectProducts(snap, ask, null);
    expect(sel.lines.map((l) => [l.product.nombre, l.product.price])).toEqual([
      ['VILLA', 15000],
      ['CROQ. DE CARNE', 21000],
      ['LOMITO', 21000],
    ]);
    expect(sel.ties.map((p) => p.nombre)).toEqual(['MECHADO-CARNE']);
  });

  it('delivery tariff is in the shop currency (COP) and not mixed with anything else', () => {
    expect(snap.delivery.config.currency).toBe('COP');
    expect(snap.delivery.currency).toBe('COP');
    // 5000 COP is only the FIRST ring (0–1 km) of a 10 km zone tariff.
    const near = { lat: 7.8515, lng: -72.2155 };
    const q = quoteShopDelivery(snap.delivery, near, 57000, snap.convert);
    expect(q).toMatchObject({ kind: 'fee', fee: 5000, currency: 'COP' });
  });

  it('never claims coverage for another city: 700 km away is blocked, not "5000 COP"', () => {
    const caracas = { lat: 10.4985, lng: -66.842 };
    const q = quoteShopDelivery(snap.delivery, caracas, 57000, snap.convert);
    expect(q.kind).toBe('blocked');
    expect(haversineKm(snap.delivery.origin, caracas)!).toBeGreaterThan(600);
  });

  it('without a location it asks instead of quoting', () => {
    expect(quoteShopDelivery(snap.delivery, null, 57000, snap.convert).kind).toBe('needs_location');
  });

  it('refuses to mix currencies when the tariff currency has no verifiable rate', () => {
    const src = makeSource({
      delivery_tarifas: { ...(RAW.comercio.delivery_tarifas as object), currency: 'GBP' },
    });
    const noRates = { ...src, checkoutExchange: { currencies: ['COP'], exchangeRates: {}, exchangeRateModes: {}, exchangeRateSources: {}, exchangeRateAdjustments: {} } } as typeof src;
    const mixed = buildMenuSnapshot(noRates);
    const q = quoteShopDelivery(mixed.delivery, { lat: 7.8515, lng: -72.2155 }, 57000, mixed.convert);
    expect(q).toMatchObject({ kind: 'currency_mismatch', tariffCurrency: 'GBP', baseCurrency: 'COP' });
    const totals = computeTotals([{ product: mixed.products[0], qty: 1 }]);
    const t = describeTotal(mixed, totals, q, null);
    expect(t.total).toBeNull();
    expect(t.lines.join('\n')).toMatch(/inconsistente/i);
    expect(t.lines.join('\n')).not.toMatch(/Total estimado/);
  });

  it('reads budgets in thousands, with separators and currency words', () => {
    expect(parseBudget('tengo 25 mil')).toEqual({ amount: 25000, currency: null });
    expect(parseBudget('tengo 25.000 cop para gastar')).toEqual({ amount: 25000, currency: 'COP' });
    expect(parseBudget('mi presupuesto es de 10 usd')).toEqual({ amount: 10, currency: 'USD' });
    expect(parseBudget('hola buenas')).toBeNull();
  });

  it('a USD budget on this COP menu is refused: its checkout rate says 1 USD = 1 COP (misconfigured)', () => {
    const s = SHOPS.real.snap;
    expect(s.convert(10, 'USD', 'COP')).toBeNull();
    const plan = planBudget(s, { amount: 10, currency: 'USD' }, s.products, 0);
    expect(plan).toMatchObject({ ok: false, reason: 'currency' });
  });

  it('extracts the place the person described', () => {
    expect(extractPlaceText('Quiero hamburguesas en Los Palos Grandes, Caracas', ['Caracas'])).toBe('Los Palos Grandes, Caracas');
    expect(extractPlaceText('quiero pizza', [])).toBeNull();
    expect(extractPlaceText('busco hamburguesas en caracas', ['Caracas'])).toBe('caracas');
  });
});

// ---------------------------------------------------------------------------
// ACCEPTANCE: the full conversation, QA shop in Los Palos Grandes
// ---------------------------------------------------------------------------
describe('acceptance: full purchase conversation (isolated QA shop in Los Palos Grandes)', () => {
  it('chooses, checks coverage, compares prices, totals, budgets, variants — without repeating itself', async () => {
    const transcript: string[] = [];
    const turn = async (text: string, m: WaMasterMemory) => {
      const out = await say(text, m, 'qa');
      transcript.push(`👤 ${text}\n🤖 ${body(out)}`);
      return out;
    };

    // 1. Search burgers in Los Palos Grandes.
    const t1 = await turn('Quiero hamburguesas en Los Palos Grandes, Caracas', fresh());
    expect(body(t1)).toMatch(/QA Hamburgueseria Bladi Jaiper/);
    expect(t1.memory.summary.placeText).toBe('Los Palos Grandes, Caracas');

    // 2. Picks it by name.
    const t2 = await turn('Me interesa Hamburguesería Bladi Jaiper', t1.memory);
    expect(t2.memory.summary.activeRestaurant?.slug).toBe('qa-hamburgueseria-bladi');
    expect(body(t2)).toMatch(/HAMBURGUESAS \(desde 15\.000 COP\)/);
    expect(body(t2)).not.toMatch(/⚠️/); // it is in the same neighbourhood
    expect(body(t2)).not.toContain(QA_LINK); // link already shown in the list: do not repeat

    // 3. Coverage + delivery fee (verified against the tariff and the distance).
    const t3 = await turn('¿Tiene cobertura hasta donde estoy y cuánto cuesta el delivery?', t2.memory);
    expect(body(t3)).toMatch(/5\.000 COP/);
    expect(body(t3)).toMatch(/Los Palos Grandes/);
    expect(body(t3)).toMatch(/aproximada/i);
    expect(body(t3)).not.toContain(QA_LINK);
    expect(body(t3)).not.toMatch(/Sí, .* hace delivery y cobra por distancia/);

    // 4. Three cheapest burgers + total with delivery.
    const t4 = await turn('Dame las tres hamburguesas más económicas y el total con delivery', t3.memory);
    const r4 = body(t4);
    expect(r4).toMatch(/VILLA — 15\.000 COP/);
    expect(r4).toMatch(/CROQ\. DE CARNE — 21\.000 COP/);
    expect(r4).toMatch(/LOMITO — 21\.000 COP/);
    expect(r4).toMatch(/MECHADO-CARNE cuesta lo mismo/);
    expect(r4).toMatch(/Subtotal: 57\.000 COP/);
    expect(r4).toMatch(/Delivery hasta \*Los Palos Grandes, Caracas\*: 5\.000 COP/);
    expect(r4).toMatch(/Total estimado: 62\.000 COP/);
    expect(r4).not.toContain(QA_LINK);
    expect(t4.memory.summary.lastMenuView?.productIds).toHaveLength(3);

    // 5. Individual price + total, about the SAME three (no restart).
    const t5 = await turn('¿Cuánto cuesta cada una por separado y cuánto sería el total con delivery?', t4.memory);
    const r5 = body(t5);
    expect(r5).toMatch(/VILLA — 15\.000 COP/);
    expect(r5).toMatch(/Total estimado: 62\.000 COP/);
    expect(r5).not.toMatch(/Menú completo|Este es el menú/);

    // 6. Budget recommendation (with delivery).
    const t6 = await turn('Tengo 25 mil, ¿cuál me recomiendas con delivery?', t5.memory);
    const r6 = body(t6);
    expect(r6).toMatch(/VILLA — 15\.000 COP/);
    // Asked about burgers: no drink is pushed on them.
    expect(r6).not.toMatch(/JUGO|AGUA|bebida/i);
    expect(r6).toMatch(/20\.000 COP/); // 15.000 + 5.000 delivery
    expect(r6).toMatch(/te sobran 5\.000 COP/);

    // 7a. Variant of a product.
    const t7 = await turn('¿La 2 carnes viene sin vegetales? ¿qué carnes puedo elegir?', t6.memory);
    const r7 = body(t7);
    expect(r7).toMatch(/2 CARNES/);
    expect(r7).not.toMatch(/2 × 2 CARNES/);
    expect(r7).toMatch(/Mechada/);
    expect(r7).toMatch(/sin vegetales/i);
    expect(r7).toMatch(/28\.000 COP/);

    // 7b. Something that is not on the published (available) menu: honest, no invention.
    const t8 = await turn('¿Tienen hamburguesa de pescado o está agotada?', t7.memory);
    expect(body(t8)).toMatch(/no veo/i);
    expect(body(t8)).toMatch(/agotad/i);
    expect(body(t8)).not.toMatch(/pescado — /);

    // 8. Continue with the conversation, no start-over: quantities of what we just compared.
    const t9 = await turn('Dame las tres hamburguesas más baratas otra vez', t8.memory);
    const t10 = await turn('Ok, 2 de la primera y una de la tercera, con delivery', t9.memory);
    const r10 = body(t10);
    // 2 × 15.000 + 1 × 21.000 = 51.000 + 5.000 delivery
    expect(r10).toMatch(/Subtotal: 51\.000 COP/);
    expect(r10).toMatch(/Total estimado: 56\.000 COP/);

    // The assistant never fell back to "open the link" for any of these, nor re-listed restaurants.
    const everything = transcript.join('\n');
    expect((everything.match(new RegExp(QA_LINK, 'g')) || []).length).toBeLessThanOrEqual(1);
    expect(everything).not.toMatch(/Puedes consultar el menú aquí|Entra al enlace para verificar|¿Quieres que te ayude con algo más\?/);
    // Prices came from the tools, never from a rewrite by the language model.
    expect(composeCalls).toBeLessThanOrEqual(1); // only the very first (search) turn may be reworded
    // Currencies never mixed.
    expect(everything).not.toMatch(/\bUSD\b|\bVES\b|\bBs\b/);

    console.log('\n===== CONVERSACIÓN DE ACEPTACIÓN (comercio QA, Los Palos Grandes) =====\n' + transcript.join('\n\n'));
  });

  it('asks for the exact location when only a whole city is known, then completes the total', async () => {
    let m = (await say('quiero hamburguesas en Caracas', fresh(), 'qa')).memory;
    m = (await say('la primera', m, 'qa')).memory;
    expect(m.summary.activeRestaurant?.slug).toBe('qa-hamburgueseria-bladi');
    const t = await say('dame las dos más baratas y el total con delivery', m, 'qa');
    expect(body(t)).toMatch(/Subtotal: 36\.000 COP/);
    expect(body(t)).toMatch(/algo más preciso|ubicación/i);
    expect(body(t)).not.toMatch(/Total estimado/);
    expect(t.memory.summary.brainPending).toMatchObject({ kind: 'delivery', topic: 'menu_total' });
    // The person answers with a location: the SAME order gets its total.
    const done = await say('Estoy en Los Palos Grandes, Caracas, calle 4', t.memory, 'qa');
    expect(body(done)).toMatch(/Subtotal: 36\.000 COP/);
    expect(body(done)).toMatch(/Total estimado: 41\.000 COP/);
  });
});

// ---------------------------------------------------------------------------
// The conversation that failed in production: the restaurant is 700 km away
// ---------------------------------------------------------------------------
describe('production case: Bladi Jaiper is in Táriba, Táchira — not in Caracas', () => {
  it('says so instead of confirming coverage and quoting 5000 COP', async () => {
    const turns: string[] = [];
    const turn = async (text: string, m: WaMasterMemory) => {
      const out = await say(text, m, 'real');
      turns.push(`👤 ${text}\n🤖 ${body(out)}`);
      return out;
    };
    const t1 = await turn('Quiero hamburguesas en Los Palos Grandes, Caracas', fresh());
    expect(body(t1)).toMatch(/Hamburgueseria Bladi Jaiper/);
    expect(body(t1)).toMatch(/km/);
    expect(body(t1)).toMatch(/no te llegue/i);

    const t2 = await turn('Me interesa Hamburguesería Bladi Jaiper', t1.memory);
    expect(body(t2)).toMatch(/⚠️/);
    expect(body(t2)).toMatch(/Táriba, Táchira/);

    const t3 = await turn('¿Tiene cobertura y cuánto cuesta el delivery?', t2.memory);
    expect(body(t3)).toMatch(/no te llega/i);
    expect(body(t3)).toMatch(/km/);
    expect(body(t3)).not.toMatch(/(?<![\d.])5\.000 COP/);
    expect(body(t3)).not.toMatch(/Sí,.*hace delivery/);

    const t4 = await turn('Dame las tres hamburguesas más económicas y el total con delivery', t3.memory);
    const r4 = body(t4);
    expect(r4).toMatch(/VILLA — 15\.000 COP/);
    expect(r4).toMatch(/Subtotal: 57\.000 COP/);
    expect(r4).toMatch(/no disponible/i);
    expect(r4).not.toMatch(/Total estimado: 62\.000/);
    expect(r4).not.toMatch(/(?<![\d.])5\.000 COP/);
    expect(composeCalls).toBeLessThanOrEqual(1);
    console.log('\n===== CASO REAL (Bladi Jaiper en Táriba, cliente en Caracas) =====\n' + turns.join('\n\n'));
  });
});

// ---------------------------------------------------------------------------
// Regression: no active restaurant -> the old flows are untouched
// ---------------------------------------------------------------------------
describe('regression', () => {
  it('a price question with no restaurant chosen does not invent a menu', async () => {
    const out = await say('¿cuáles son las más baratas?', fresh(), 'qa');
    expect(body(out)).not.toMatch(/COP/);
  });

  it('delivery-only question keeps answering from the tariff (no menu hijack)', async () => {
    const m = fresh();
    const snap: MenuSnapshot = SHOPS.qa.snap;
    m.summary.lastRestaurants = [{ id: snap.id, slug: snap.slug, nombre: snap.nombre, menuUrl: QA_LINK, chatUrl: null }];
    m.summary.activeRestaurant = m.summary.lastRestaurants[0];
    const out = await say('¿cuánto cobran de delivery?', m, 'qa');
    expect(body(out)).toMatch(/ubicaci[oó]n|dirección|sector/i);
    expect(out.memory.summary.brainPending?.kind).toBe('delivery');
    expect(body(out)).not.toMatch(/Sí, .* hace delivery y cobra/);
  });
});

describe('geocoding is only used to check coverage, never invented', () => {
  it('does not geocode unrelated chatter', async () => {
    await say('hola buenas', fresh(), 'qa');
    expect(geocodeCalls).toHaveLength(0);
  });
});
