/**
 * Product-intent verification (consume vs manage).
 *
 * A message that names a PRODUCT without saying what to do with it ("bebidas", "zapatos", "coca cola",
 * "¿tienen cargadores?") is ambiguous for someone whose phone number has a business registered with us:
 *   - consume it (order it, possibly at ANOTHER business), or
 *   - manage it (edit / price / activate it in THEIR OWN menu).
 * The brain must ask which one — and ONLY for numbers with a registered business. Any other number is
 * handled by the normal flows (general search, etc.) with no such question.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createEmptyMemory,
  loadWaMasterConfig,
  resolveWaMasterIdentity,
  runWaMasterOrchestrator,
  type WaMasterMemory,
} from '../app/api/wa-master/_lib';
import { createMemoryWaHandoffStore } from '../app/api/_lib/wa-handoff';
import {
  detectAmbiguousProduct,
  parseProductIntentAnswer,
} from '../app/api/wa-master/_lib/brain/product-intent';
import { directoryCalls, loadQaDelivery, loadQaMenu, qaDiscovery } from './fixtures/wa-qa-world';

vi.mock('../app/api/_lib/geocode', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../app/api/_lib/geocode')>();
  const world = await import('./fixtures/wa-qa-world');
  return { ...actual, geocodeAddress: async (text: string) => world.qaGeocode(text) };
});

const USER = '584120077799';
const cfg = loadWaMasterConfig({
  PLATFORM_WA_MASTER: '1',
  PLATFORM_WA_MASTER_RECEPTIONIST: '1',
  PLATFORM_WA_MASTER_BRAIN: '1',
} as unknown as NodeJS.ProcessEnv);

const REGISTERED = [
  { comercioId: 'c-qa-1', publicName: 'Mi Local QA', slug: 'mi-local-qa', whatsapp: USER, telefonos: null, supervisionWhatsapp: null },
];

const identityOf = (registered: boolean) =>
  resolveWaMasterIdentity({ fromDigits: USER, catalog: registered ? REGISTERED : [] });

type Turn = Awaited<ReturnType<typeof runWaMasterOrchestrator>> & { dir: number; text: string };

/** Runs the texts in order as ONE conversation; returns every turn. */
async function converse(registered: boolean, texts: string[], start?: WaMasterMemory): Promise<Turn[]> {
  const identity = identityOf(registered);
  let m = start ?? createEmptyMemory(USER, Date.now(), 86_400_000);
  const out: Turn[] = [];
  for (const text of texts) {
    directoryCalls.length = 0;
    const r = await runWaMasterOrchestrator(
      { fromDigits: USER, text, messageId: `m_${Math.random().toString(36).slice(2)}`, nowMs: Date.now(), identity, memory: m },
      cfg,
      {
        executeDiscovery: qaDiscovery,
        loadShopDelivery: loadQaDelivery,
        loadPublicMenu: loadQaMenu,
        handoffStore: createMemoryWaHandoffStore(),
        compose: async () => null,
      },
    );
    m = r.memory;
    out.push({ ...r, dir: directoryCalls.length, text });
  }
  return out;
}

const body = (r: { replies: string[] }) => r.replies.join('\n');
/** The consume-vs-manage question: both options spelled out. */
const isClarifier = (r: { replies: string[] }) =>
  /Consumirlo \/ pedirlo/.test(body(r)) && /Gestionarlo en tu men[uú]/.test(body(r));
const pendingOf = (r: { memory: WaMasterMemory }) => r.memory.summary.brainPending;

beforeEach(() => {
  directoryCalls.length = 0;
});

// Products of very different kinds — not only food or drinks.
const PRODUCTS: Array<[text: string, product: string]> = [
  ['bebidas', 'bebidas'],
  ['Bebidas', 'bebidas'],
  ['jugos', 'jugos'],
  ['zapatos', 'zapatos'],
  ['cargadores', 'cargadores'],
  ['coca cola', 'coca cola'],
  ['repuestos de moto', 'repuestos moto'],
  ['shampoo', 'shampoo'],
  ['aceite de oliva', 'aceite oliva'],
  ['¿tienen pizza?', 'pizza'],
  ['¿Qué camisetas tienen?', 'camisetas'],
  ['cuánto cuesta la coca cola', 'coca cola'],
  ['precio de los cargadores', 'cargadores'],
];

describe('registered business number → the consume-vs-manage question', () => {
  it.each(PRODUCTS)('«%s» asks whether to consume or manage it (no search, no guess)', async (text, product) => {
    const [r] = await converse(true, [text]);
    expect(isClarifier(r), body(r)).toBe(true);
    // The question carries the product and both meanings (consume at another business / manage in own menu).
    expect(body(r)).toContain(`*${product}*`);
    expect(body(r)).toMatch(/otro negocio, no el tuyo/);
    expect(body(r)).toMatch(/editarlo, cambiarle el precio, agotarlo, activarlo o agregarlo/);
    // It did NOT run a general search and does not answer as a directory search.
    expect(r.dir).toBe(0);
    expect(r.toolsUsed).not.toContain('search_restaurants');
    expect(body(r)).not.toMatch(/no veo a ningún restaurante|dónde estás|No logré ubicar/);
    // The question waits for its answer.
    expect(pendingOf(r)).toMatchObject({ kind: 'product_intent', query: product });
  });

  it('the clarifying question is a single reply, never sent through the language model', async () => {
    const [r] = await converse(true, ['zapatos']);
    expect(r.replies).toHaveLength(1);
    expect(r.mode).not.toBe('gemini');
  });
});

describe('NOT registered number → no question, normal flow', () => {
  it.each(PRODUCTS)('«%s» is handled normally (no consume/manage question)', async (text) => {
    const [r] = await converse(false, [text]);
    expect(isClarifier(r), body(r)).toBe(false);
    expect(body(r)).not.toMatch(/Gestionarlo en tu men[uú]/);
    expect(pendingOf(r)?.kind).not.toBe('product_intent');
    expect(r.replies.length).toBeGreaterThan(0); // still answered
  });

  it('"bebidas" from a non-registered number still goes through the general food search', async () => {
    const [r] = await converse(false, ['bebidas']);
    expect(body(r)).toMatch(/bebidas/i);
    expect(body(r)).toMatch(/dónde estás|ubicaci/i); // the usual "where are you?" of the search flow
    expect(r.specialist).toBe('consumer');
    expect(r.intents).toContain('consumer.search');
  });

  it('the same text gives different treatment ONLY because of the registered business', async () => {
    const [reg] = await converse(true, ['jugos']);
    const [free] = await converse(false, ['jugos']);
    expect(isClarifier(reg)).toBe(true);
    expect(isClarifier(free)).toBe(false);
  });
});

describe('registered number with a stated intent → no question', () => {
  it.each([
    'quiero pedir bebidas',
    'busco jugos en Caracas',
    'bebidas en Caracas',
    'busco zapatos',
    'agrega bebidas a mi menú',
    'cambiar el precio de la coca cola',
    'hola',
    'gracias',
    'ok perfecto',
    'Caracas',
    '1',
  ])('«%s» is not ambiguous', async (text) => {
    const [r] = await converse(true, [text]);
    expect(isClarifier(r), body(r)).toBe(false);
    expect(pendingOf(r)?.kind).not.toBe('product_intent');
  });

  it('a restaurant we are on and its own menu questions are not hijacked', async () => {
    const turns = await converse(true, ['Busco hamburguesas en Los Palos Grandes, Caracas', 'Me interesa TORO BRAVO', '¿Qué bebidas tiene?']);
    expect(isClarifier(turns[2]), body(turns[2])).toBe(false);
    // ...but a bare product while on that restaurant is still ambiguous for a registered number.
    const bare = await converse(true, ['Busco hamburguesas en Los Palos Grandes, Caracas', 'Me interesa TORO BRAVO', 'bebidas']);
    expect(isClarifier(bare[2])).toBe(true);
  });

  it('naming a restaurant we listed is a pick, not a product', async () => {
    const turns = await converse(true, ['Busco hamburguesas en Los Palos Grandes, Caracas', 'TORO BRAVO']);
    expect(isClarifier(turns[1])).toBe(false);
    expect(turns[1].memory.summary.activeRestaurant?.nombre).toBe('TORO BRAVO');
  });
});

describe('answering the question', () => {
  it.each([['pedir'], ['1'], ['consumirlo'], ['quiero comprarlo'], ['en otro negocio']])(
    '«%s» → consume: the normal consumer search for that product takes over',
    async (answer) => {
      const turns = await converse(true, ['bebidas', answer]);
      const r = turns[1];
      expect(isClarifier(r), body(r)).toBe(false);
      expect(r.specialist).toBe('consumer');
      expect(body(r)).toMatch(/bebidas/i);
      expect(pendingOf(r)?.kind).not.toBe('product_intent');
    },
  );

  it.each([['gestionar'], ['2'], ['en mi menú'], ['quiero editarlo'], ['cambiarle el precio']])(
    '«%s» → manage: handed to the business assistant for that product',
    async (answer) => {
      const turns = await converse(true, ['zapatos', answer]);
      const r = turns[1];
      expect(isClarifier(r), body(r)).toBe(false);
      expect(r.specialist).toBe('admin');
      expect(body(r)).toMatch(/\*zapatos\* lo gestionamos en tu menú/);
      expect(body(r)).toMatch(/Mi Local QA/); // the registered business, from the phone number
      expect(r.dir).toBe(0); // never a directory search
      expect(pendingOf(r)?.kind).not.toBe('product_intent');
    },
  );

  it('an answer that is neither: the question is dropped and the message is read normally', async () => {
    const turns = await converse(true, ['bebidas', 'busco pizza en Caracas']);
    expect(isClarifier(turns[1])).toBe(false);
    expect(turns[1].dir).toBeGreaterThan(0);
    expect(pendingOf(turns[1])?.kind).not.toBe('product_intent');
  });

  it('the question expires with the other pending questions (30 min): a late "2" is not an answer', async () => {
    const [first] = await converse(true, ['bebidas']);
    const identity = identityOf(true);
    const late = await runWaMasterOrchestrator(
      { fromDigits: USER, text: '2', messageId: 'late', nowMs: Date.now() + 31 * 60_000, identity, memory: first.memory },
      cfg,
      { executeDiscovery: qaDiscovery, loadShopDelivery: loadQaDelivery, loadPublicMenu: loadQaMenu, handoffStore: createMemoryWaHandoffStore(), compose: async () => null },
    );
    expect(body(late)).not.toMatch(/lo gestionamos en tu menú/);
  });
});

describe('detectAmbiguousProduct (pure)', () => {
  const tr = { topic: 'unknown' as const, cities: [] as string[] };

  it('a number WITHOUT a registered business is never ambiguous, whatever the product', () => {
    for (const [text] of PRODUCTS) {
      expect(detectAmbiguousProduct({ text, hasShops: false, hasActiveRestaurant: false, tr }), text).toBeNull();
    }
  });

  it('a registered number is ambiguous for any product, with or without food words', () => {
    for (const [text, product] of PRODUCTS) {
      const t = /pizza|bebida|jugo/.test(text) ? { topic: 'search_food' as const, cities: [] } : /cuanto|precio/i.test(text) ? { topic: 'pricing' as const, cities: [] } : tr;
      expect(detectAmbiguousProduct({ text, hasShops: true, hasActiveRestaurant: false, tr: t })?.product, text).toBe(product);
    }
  });

  it('rejects filler, intents, places, numbers and long sentences', () => {
    for (const text of ['hola', 'gracias', 'ok', 'quiero bebidas', 'bebidas 2x1', 'bebidas en Caracas', 'cámbiame el precio', 'necesito hablar con alguien de mi cuenta', 'qué horario tienen', 'https://elmenuxfa.com/v/x']) {
      const cities = /caracas/i.test(text) ? ['caracas'] : [];
      expect(detectAmbiguousProduct({ text, hasShops: true, hasActiveRestaurant: false, tr: { topic: 'unknown', cities } }), text).toBeNull();
    }
  });

  it('parseProductIntentAnswer reads both meanings and refuses to guess', () => {
    expect(parseProductIntentAnswer('pedir')).toBe('consume');
    expect(parseProductIntentAnswer('1')).toBe('consume');
    expect(parseProductIntentAnswer('gestionar')).toBe('manage');
    expect(parseProductIntentAnswer('2')).toBe('manage');
    expect(parseProductIntentAnswer('en mi menú')).toBe('manage');
    expect(parseProductIntentAnswer('pedirlo o editarlo')).toBe('unclear');
    expect(parseProductIntentAnswer('no sé')).toBe('unclear');
    expect(parseProductIntentAnswer('')).toBe('unclear');
  });
});
