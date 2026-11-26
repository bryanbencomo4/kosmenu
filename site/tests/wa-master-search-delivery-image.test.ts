/**
 * WhatsApp Master: precise dish search (verified against menus), location first,
 * delivery quote to the person's place, and photos / payment receipts.
 */
import { describe, expect, it } from 'vitest';

import {
  createEmptyMemory,
  loadWaMasterConfig,
  resolveWaMasterIdentity,
  runWaMasterOrchestrator,
  type WaMasterMemory,
} from '../app/api/wa-master/_lib';
import { shopDeliveryFromRow } from '../app/api/wa-master/_lib/brain/delivery';
import { dishEvidence } from '../app/api/wa-master/_lib/brain/respond';
import { extractDishQuery } from '../app/api/wa-master/_lib/brain/topics';
import type { WaMasterDiscoveryExecute } from '../app/api/wa-master/_lib/discovery-bridge';
import { buildImageTurnText, parseImageTurn } from '../app/api/wa-master/_lib/image-turn';
import { createMemoryWaHandoffStore } from '../app/api/_lib/wa-handoff';

const USER = '584120099988';

type Shop = { id: string; slug: string; nombre: string; products: string[]; row: Record<string, unknown> };
const SHOPS: Shop[] = [
  {
    id: 'r-pizza',
    slug: 'auto-pizzas-napoles',
    nombre: 'Auto Pizzas Nápoles',
    products: ['Pizza Margarita', 'Pizza Pepperoni', 'Refresco'],
    row: { id: 'r-pizza', nombre: 'Auto Pizzas Nápoles', slug: 'auto-pizzas-napoles', moneda: 'USD', permite_delivery: false },
  },
  {
    id: 'r-fritos',
    slug: 'fritos-dona-ana',
    nombre: 'Fritos Doña Ana',
    products: ['Tequeños x12', 'Empanada de carne', 'Cachapa con queso'],
    row: {
      id: 'r-fritos',
      nombre: 'Fritos Doña Ana',
      slug: 'fritos-dona-ana',
      moneda: 'USD',
      permite_delivery: true,
      latitud: 10.18,
      longitud: -68.0,
      branding_ia: {
        config_negocio: {
          delivery_config: {
            enabled: true,
            pricing_type: 'distance',
            currency: 'USD',
            distance_config: { base_price: 2, included_km: 1, extra_price_per_km: 0.5 },
            min_order: 5,
            estimated_times: { preparation_minutes: 15, delivery_minutes: 25 },
          },
        },
      },
    },
  },
];

// Fuzzy directory like the real one: returns both for any dish query (the brain must verify).
const discovery: WaMasterDiscoveryExecute = async (name, args) => ({
  ok: true,
  tool: name,
  restaurants: SHOPS.map((s) => ({
    id: s.id,
    slug: s.slug,
    nombre: s.nombre,
    menuUrl: `https://elmenuxfa.com/v/${s.slug}`,
    chatUrl: `https://elmenuxfa.com/v/${s.slug}?chatbot=1`,
    isOpen: true,
    categoria: 'comida',
    ...(args.includeDishes ? { matchedDish: null, productNames: s.products } : {}),
  })),
});

const loadShopDelivery = async (id: string) => {
  const s = SHOPS.find((x) => x.id === id);
  return s ? shopDeliveryFromRow(s.row) : null;
};

const cfg = () =>
  loadWaMasterConfig({
    PLATFORM_WA_MASTER: '1',
    PLATFORM_WA_MASTER_RECEPTIONIST: '1',
    PLATFORM_WA_MASTER_BRAIN: '1',
  } as unknown as NodeJS.ProcessEnv);

async function say(text: string, memory: WaMasterMemory, exec: WaMasterDiscoveryExecute = discovery) {
  const identity = resolveWaMasterIdentity({ fromDigits: USER, catalog: [] });
  return runWaMasterOrchestrator(
    { fromDigits: USER, text, messageId: `m_${Math.random().toString(36).slice(2)}`, nowMs: Date.now(), identity, memory },
    cfg(),
    { executeDiscovery: exec, loadShopDelivery, handoffStore: createMemoryWaHandoffStore() },
  );
}
const fresh = () => createEmptyMemory(USER, Date.now(), 86_400_000);
const body = (r: { replies: string[] }) => r.replies.join('\n');

describe('dish extraction + evidence', () => {
  it('extracts any dish, keeping ñ', () => {
    expect(extractDishQuery('¿Dónde venden tequeños?')).toBe('tequeños');
    expect(extractDishQuery('donde puedo comprar pastel de chucho por aqui')).toBe('pastel de chucho');
    expect(extractDishQuery('se me antoja una cachapa con queso')).toBe('cachapa con queso');
    expect(extractDishQuery('quiero registrar mi negocio')).toBeNull();
    expect(extractDishQuery('quiero ayuda')).toBeNull();
  });

  it('only counts a restaurant that lists the dish (plural/singular, typo tolerant)', () => {
    const card = { id: 'x', slug: 'x', nombre: 'X', menuUrl: 'u', productNames: ['Tequeños x12', 'Pizza'] };
    expect(dishEvidence(card, 'tequeños')).toBe('Tequeños x12');
    expect(dishEvidence(card, 'tequenos')).toBe('Tequeños x12');
    expect(dishEvidence(card, 'tequeno')).toBe('Tequeños x12');
    expect(dishEvidence(card, 'cachapas')).toBeNull();
    expect(dishEvidence({ ...card, productNames: ['Pizza Margarita'] }, 'tequeños')).toBeNull();
  });
});

describe('search: location first, then only restaurants that really sell it', () => {
  it('asks where the person is BEFORE listing anything', async () => {
    const a = await say('¿Dónde venden tequeños?', fresh());
    expect(body(a)).toMatch(/dónde estás|ubicaci[oó]n/i);
    expect(body(a)).toMatch(/tequeños/i);
    expect(body(a)).not.toMatch(/auto-pizzas|fritos-dona-ana/);
    expect(a.memory.summary.brainPending?.kind).toBe('zone');
  });

  it('after the city, lists only the restaurant with the dish (not the pizza place)', async () => {
    const a = await say('¿Dónde venden tequeños?', fresh());
    const b = await say('Valencia', a.memory);
    const text = body(b);
    expect(text).toMatch(/Fritos Doña Ana/);
    expect(text).toMatch(/Tequeños x12/);
    expect(text).not.toMatch(/Auto Pizzas/);
  });

  it('says honestly when nobody lists the dish', async () => {
    const out = await say('busco pastel de chucho en Valencia', fresh());
    expect(body(out)).toMatch(/no veo a ningún restaurante/i);
    expect(body(out)).not.toMatch(/auto-pizzas|fritos-dona-ana/);
  });

  it('reuses a recently shared location instead of asking again', async () => {
    const a = await say('quiero tequeños cerca de mi', fresh());
    const b = await say('10.2000, -68.0000', a.memory);
    expect(body(b)).toMatch(/Fritos Doña Ana/);
    const c = await say('¿dónde venden tequeños?', b.memory);
    expect(body(c)).toMatch(/Fritos Doña Ana/);
    expect(body(c)).not.toMatch(/necesito saber dónde estás/);
  });
});

describe('delivery: does it reach me and how much?', () => {
  it('quotes the real tariff from the shared location', async () => {
    const a = await say('quiero tequeños en Valencia', fresh());
    expect(body(a)).toMatch(/Fritos Doña Ana/);
    const b = await say('¿hacen delivery hasta mi casa? ¿cuánto cobran?', a.memory);
    expect(b.memory.summary.brainPending?.kind).toBe('delivery');
    expect(body(b)).toMatch(/\$2/);
    expect(body(b)).toMatch(/ubicaci[oó]n/i);
    const c = await say('10.2000, -68.0000', b.memory);
    expect(body(c)).toMatch(/Fritos Doña Ana/);
    expect(body(c)).toMatch(/\$3/); // 2 + ceil(2.2 - 1) * 0.5
    expect(body(c)).toMatch(/mínimo|\$5/i);
    expect(body(c)).toMatch(/40 min/);
    expect(c.memory.summary.geo?.lat).toBeCloseTo(10.2, 3);
  });

  it('uses a location shared earlier without asking again', async () => {
    let m = (await say('quiero tequeños cerca de mi', fresh())).memory;
    m = (await say('10.2000, -68.0000', m)).memory;
    const out = await say('y a mi casa hacen delivery? cuanto cobran', m);
    expect(body(out)).toMatch(/\$3/);
  });

  it('says plainly when a restaurant has no delivery', async () => {
    const m = fresh();
    m.summary.lastRestaurants = [
      { id: 'r-pizza', slug: 'auto-pizzas-napoles', nombre: 'Auto Pizzas Nápoles', menuUrl: 'https://elmenuxfa.com/v/auto-pizzas-napoles', chatUrl: null },
    ];
    const out = await say('¿Auto Pizzas Nápoles hace delivery?', m);
    expect(body(out)).toMatch(/no tiene delivery/i);
  });

  it('asks which restaurant when several were listed', async () => {
    const m = fresh();
    m.summary.lastRestaurants = SHOPS.map((s) => ({
      id: s.id,
      slug: s.slug,
      nombre: s.nombre,
      menuUrl: `https://elmenuxfa.com/v/${s.slug}`,
      chatUrl: null,
    }));
    const out = await say('¿cuánto cobran de delivery?', m);
    expect(body(out)).toMatch(/cuál restaurante/i);
  });
});

describe('photos and payment receipts', () => {
  it('round-trips the image turn marker', () => {
    const text = buildImageTurnText({ tipo: 'comprobante', resumen: 'Pago móvil', monto: '1.500 Bs', pie: 'ya pagué' });
    expect(parseImageTurn(text)).toMatchObject({ tipo: 'comprobante', monto: '1.500 Bs', pie: 'ya pagué' });
    expect(parseImageTurn('hola')).toBeNull();
  });

  it('a receipt is acknowledged, never approved, and routed to the restaurant', async () => {
    const m = fresh();
    m.summary.lastRestaurants = [
      { id: 'r-fritos', slug: 'fritos-dona-ana', nombre: 'Fritos Doña Ana', menuUrl: 'https://elmenuxfa.com/v/fritos-dona-ana', chatUrl: 'https://elmenuxfa.com/v/fritos-dona-ana?chatbot=1' },
    ];
    const text = buildImageTurnText({ tipo: 'comprobante', resumen: 'Pago móvil Banesco', monto: '1.500 Bs', banco: 'Banesco', referencia: '123456' });
    const out = await say(text, m);
    const reply = body(out);
    expect(reply).toMatch(/1\.500 Bs/);
    expect(reply).toMatch(/Banesco/);
    expect(reply).toMatch(/no recibo ni verifico pagos/i);
    expect(reply).toMatch(/fritos-dona-ana/);
    expect(reply).not.toMatch(/pago (confirmado|aprobado|recibido)|ya qued/i);
    expect(reply).not.toMatch(/\[imagen:/);
    // Memory keeps a readable sentence, not the raw marker.
    expect(out.memory.turns.map((t) => t.text).join('|')).not.toMatch(/\[imagen:/);
  });

  it('a receipt with no context asks which restaurant it is for', async () => {
    const out = await say(buildImageTurnText({ tipo: 'comprobante', resumen: 'Transferencia' }), fresh());
    expect(body(out)).toMatch(/qué restaurante|para cuál/i);
    expect(out.memory.summary.brainPending?.kind).toBe('name');
  });

  it('a food photo searches for the dish with location first', async () => {
    const out = await say(buildImageTurnText({ tipo: 'plato', resumen: 'Unos tequeños dorados', busqueda: 'tequeños' }), fresh());
    expect(body(out)).toMatch(/parece \*tequeños\*/i);
    expect(body(out)).toMatch(/dónde estás|ubicaci[oó]n/i);
  });

  it('any other image is described and the caption drives the answer', async () => {
    const plain = await say(buildImageTurnText({ tipo: 'otro', resumen: 'Un paisaje de montaña' }), fresh());
    expect(body(plain)).toMatch(/paisaje/i);
    expect(body(plain)).toMatch(/qué necesitas/i);
    const withCaption = await say(buildImageTurnText({ tipo: 'otro', resumen: 'Captura de pantalla', pie: 'cuánto cuesta el plan' }), fresh());
    expect(body(withCaption)).toMatch(/\$10/);
  });
});

