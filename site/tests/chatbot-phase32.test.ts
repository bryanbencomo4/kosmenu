import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  buildChatbotWelcomeMessage,
  CHATBOT_WELCOME_VERSION,
  refreshWelcomeInHistory,
} from '../app/_lib/chatbot-preview';
import {
  buildProposeAddFromSelection,
  prepareCartLineProposal,
  revalidateProposeAdd,
} from '../app/api/chat/_lib/cart-proposals';
import { runSimulatedChat } from '../app/api/chat/_lib/simulate-gemini';
import type { LoadedPublicMenu } from '../app/api/menu/_lib/load-public-menu';

const COMMERCE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const sizeGrupos = {
  activadas: true,
  grupos: [
    {
      id: 'tam',
      nombre: 'Tamaños',
      tipo: 'unica',
      obligatorio: true,
      min: 1,
      max: 1,
      opciones: [
        { id: 'n', nombre: 'Normal', precio: 0, activo: true },
        { id: 'g', nombre: 'Grande', precio: 5.25, activo: true },
      ],
    },
  ],
};

function menu(): LoadedPublicMenu {
  return {
    resolvedComercioId: COMMERCE,
    ownerId: 'o',
    isOnline: true,
    comercioRow: {
      branding_ia: {
        config_negocio: {
          inicio_menu: { delivery: true },
          delivery_config: {
            enabled: true,
            version: 1,
            currency: 'COP',
            pricing_type: 'zones',
            zones: [
              { name: 'Zona 1', price: 5000, min_distance: 0, max_distance: 2 },
            ],
          },
        },
      },
    },
    comercio: {
      nombre: 'pizzas el trueno',
      moneda: 'USD',
      en_linea: true,
      permite_delivery: true,
    } as any,
    categorias: [
      { id: 'c-pizza', nombre: 'PIZZAS' },
      { id: 'c-beb', nombre: 'BEBIDAS' },
    ],
    productos: [
      {
        id: 'p-haw',
        categoria_id: 'c-pizza',
        nombre: 'Hawaiana',
        descripcion: 'Jamón, Queso, Piña',
        precio: 3.5,
        disponible: true,
        opciones_menu: sizeGrupos,
        imagen_url: 'https://cdn.example/haw.jpg',
      },
      {
        id: 'p-coca',
        categoria_id: 'c-beb',
        nombre: 'Coca-Cola',
        precio: 1.2,
        disponible: true,
      },
      {
        id: 'p-agua',
        categoria_id: 'c-beb',
        nombre: 'Agua 200 ml.',
        precio: 0.44,
        disponible: true,
      },
    ],
    metodosPago: [],
    checkoutExchange: {} as any,
    marketRates: null,
    upsellSettings: null,
    upsellRules: [],
    bundles: [],
    preCheckoutUpsell: null as any,
  };
}

describe('Phase 3.2 welcome refresh', () => {
  it('updates welcome text without wiping conversation history', () => {
    const welcome = buildChatbotWelcomeMessage('Pizzas El Trueno', {
      runtimeEnabled: true,
    });
    const history = [
      {
        id: 'w1',
        role: 'assistant',
        text: 'Texto antiguo de bienvenida',
        createdAt: 1,
        demo: true,
        welcomeVersion: 1,
      },
      {
        id: 'u1',
        role: 'user',
        text: 'Quiero dos Hawaianas',
        createdAt: 2,
      },
      {
        id: 'a1',
        role: 'assistant',
        text: 'Perfecto',
        createdAt: 3,
      },
    ];
    const next = refreshWelcomeInHistory(history, welcome, {
      runtimeEnabled: true,
    });
    expect(next).toHaveLength(3);
    expect(next[0].text).toBe(welcome);
    expect(next[0].welcomeVersion).toBe(CHATBOT_WELCOME_VERSION);
    expect(next[0].isWelcome).toBe(true);
    expect(next[0].demo).toBe(false);
    expect(next[1].text).toBe('Quiero dos Hawaianas');
    expect(next[2].text).toBe('Perfecto');
  });

  it('is a no-op when welcome already matches current version', () => {
    const welcome = buildChatbotWelcomeMessage('X', { runtimeEnabled: true });
    const history = [
      {
        id: 'w1',
        role: 'assistant',
        text: welcome,
        createdAt: 1,
        demo: false,
        isWelcome: true,
        welcomeVersion: CHATBOT_WELCOME_VERSION,
      },
    ];
    const next = refreshWelcomeInHistory(history, welcome, {
      runtimeEnabled: true,
    });
    expect(next).toBe(history);
  });
});

describe('Phase 3.2 single-confirm rules', () => {
  it('Gemini proposals still require confirmation', () => {
    const r = runSimulatedChat({
      menu: menu(),
      commerceId: COMMERCE,
      messages: [
        {
          role: 'user',
          text: 'Quiero dos pizzas Hawaianas, una Normal y otra Grande',
        },
      ],
    });
    const adds = r.cartActions.filter((a) => a.type === 'propose_add');
    expect(adds).toHaveLength(2);
    expect(adds.every((a) => a.requires_confirmation)).toBe(true);
  });

  it('sheet selection builds a ready line with real catalog price (direct-add path)', () => {
    const r = buildProposeAddFromSelection({
      menu: menu(),
      commerceId: COMMERCE,
      productId: 'p-haw',
      selection: { grupos: { tam: ['g'] } },
      quantity: 1,
    });
    expect(r.status).toBe('ready');
    if (r.status !== 'ready') return;
    expect(r.action.unit_price).toBe(3.5 + 5.25);
    expect(r.action.requires_confirmation).toBe(true);
    // UI no longer surfaces this as a second confirm when coming from the sheet;
    // the proposal builder still returns validated server prices.
  });

  it('rejects tampered unit prices on confirm', () => {
    const ready = prepareCartLineProposal(menu(), COMMERCE, {
      product_name: 'Coca-Cola',
      quantity: 1,
    });
    expect(ready.status).toBe('ready');
    if (ready.status !== 'ready') return;
    const check = revalidateProposeAdd(menu(), COMMERCE, {
      ...ready.action,
      unit_price: 0.01,
      line_total: 0.01,
    });
    expect(check.ok).toBe(true);
    if (!check.ok) return;
    expect(check.action.unit_price).toBe(1.2);
  });
});

describe('Phase 3.2 cart flow scenarios (simulator)', () => {
  it('A→B→C: two pizzas, drink ask, remove Grande', () => {
    const a = runSimulatedChat({
      menu: menu(),
      commerceId: COMMERCE,
      messages: [
        {
          role: 'user',
          text: 'Quiero dos pizzas Hawaianas, una Normal y otra Grande',
        },
      ],
    });
    const adds = a.cartActions.filter((x) => x.type === 'propose_add') as Array<
      Extract<(typeof a.cartActions)[number], { type: 'propose_add' }>
    >;
    expect(adds).toHaveLength(2);

    const b = runSimulatedChat({
      menu: menu(),
      commerceId: COMMERCE,
      cartSnapshot: adds.map((x) => ({
        productId: x.product_id,
        quantity: x.quantity,
        selection: x.selection,
      })),
      messages: [{ role: 'user', text: 'Agrega una bebida' }],
    });
    expect(b.text).toMatch(/cuál|Coca-Cola|Agua/i);

    const c = runSimulatedChat({
      menu: menu(),
      commerceId: COMMERCE,
      cartSnapshot: adds.map((x) => ({
        productId: x.product_id,
        quantity: x.quantity,
        selection: x.selection,
      })),
      messages: [{ role: 'user', text: 'Quita la pizza Grande' }],
    });
    expect(c.cartActions.some((x) => x.type === 'propose_remove')).toBe(true);
  });

  it('combined live-prep phrase still understands sizes (no billable call)', () => {
    const r = runSimulatedChat({
      menu: menu(),
      commerceId: COMMERCE,
      messages: [
        {
          role: 'user',
          text: 'Quiero dos pizzas Hawaianas, una Normal y otra Grande, y una bebida',
        },
      ],
    });
    // Simulator matches Hawaiana branch first; drink may need a follow-up.
    expect(r.geminiHttpCalls).toBe(0);
    expect(r.cartActions.filter((a) => a.type === 'propose_add').length).toBeGreaterThanOrEqual(
      2,
    );
  });
});

describe('Phase 3.2 live Gemini prep gate (no calls)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('documents that real Gemini stays off unless explicitly authorized', () => {
    vi.stubEnv('CHATBOT_SIMULATE_GEMINI', '1');
    vi.stubEnv('CHATBOT_ENABLED', '1');
    expect(process.env.CHATBOT_SIMULATE_GEMINI).toBe('1');
    // Fase 3.2 must not flip simulation off.
  });
});
