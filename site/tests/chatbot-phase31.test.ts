import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  buildProposeAddFromSelection,
  catalogFingerprint,
  prepareCartLineProposal,
  revalidateProposeAdd,
  summarizeCartSnapshot,
} from '../app/api/chat/_lib/cart-proposals';
import { isChatbotRuntimeAllowed, getChatbotConfig } from '../app/api/chat/_lib/config';
import {
  isGeminiSimulationEnabled,
  runSimulatedChat,
} from '../app/api/chat/_lib/simulate-gemini';
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

describe('Phase 3.1 simulator scenarios A–E', () => {
  it('A: two Hawaianas with sizes → two ready proposals, no re-ask', () => {
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
    expect(r.geminiHttpCalls).toBe(0);
    expect(r.skippedLlm).toBe(true);
    expect(r.cartActions.filter((a) => a.type === 'propose_add')).toHaveLength(2);
    const adds = r.cartActions.filter((a) => a.type === 'propose_add') as Array<
      Extract<(typeof r.cartActions)[number], { type: 'propose_add' }>
    >;
    expect(adds.map((a) => a.cart_key).every(Boolean)).toBe(true);
    expect(adds[0].cart_key).not.toBe(adds[1].cart_key);
    expect(adds.every((a) => a.requires_confirmation)).toBe(true);
    expect(adds.every((a) => a.proposal_id)).toBe(true);
    expect(
      adds.some((a) => a.product_card.selected_options?.some((s) => /Grande/i.test(s))),
    ).toBe(true);
  });

  it('B: add a drink with multiple options → asks which', () => {
    const r = runSimulatedChat({
      menu: menu(),
      commerceId: COMMERCE,
      messages: [{ role: 'user', text: 'Agrega una bebida' }],
    });
    expect(r.text).toMatch(/Coca-Cola|Agua|cuál/i);
    expect(r.productCards.length).toBeGreaterThanOrEqual(1);
  });

  it('C: remove Grande pizza from cart snapshot', () => {
    const grande = prepareCartLineProposal(menu(), COMMERCE, {
      product_name: 'Hawaiana',
      option_labels: ['Grande'],
      quantity: 1,
    });
    expect(grande.status).toBe('ready');
    if (grande.status !== 'ready') return;
    const r = runSimulatedChat({
      menu: menu(),
      commerceId: COMMERCE,
      cartSnapshot: [
        {
          productId: grande.action.product_id,
          quantity: 1,
          selection: grande.action.selection,
        },
      ],
      messages: [{ role: 'user', text: 'Quita la pizza Grande' }],
    });
    expect(r.cartActions.some((a) => a.type === 'propose_remove')).toBe(true);
  });

  it('D: subtotal from existing cart system', () => {
    const line = prepareCartLineProposal(menu(), COMMERCE, {
      product_name: 'Hawaiana',
      option_labels: ['Normal'],
      quantity: 2,
    });
    expect(line.status).toBe('ready');
    if (line.status !== 'ready') return;
    const r = runSimulatedChat({
      menu: menu(),
      commerceId: COMMERCE,
      cartSnapshot: [
        {
          productId: line.action.product_id,
          quantity: line.action.quantity,
          selection: line.action.selection,
        },
      ],
      messages: [{ role: 'user', text: '¿Cuánto llevo gastado?' }],
    });
    const snap = summarizeCartSnapshot(menu(), COMMERCE, [
      {
        productId: line.action.product_id,
        quantity: line.action.quantity,
        selection: line.action.selection,
      },
    ]);
    expect(r.text).toContain(snap.subtotal_label);
    expect(r.geminiHttpCalls).toBe(0);
  });

  it('E: open checkout proposal without creating order', () => {
    const r = runSimulatedChat({
      menu: menu(),
      commerceId: COMMERCE,
      messages: [{ role: 'user', text: 'Quiero hacer mi pedido' }],
    });
    expect(r.cartActions).toHaveLength(1);
    expect(r.cartActions[0].type).toBe('open_checkout');
    expect((r as any).order_actions).toBeUndefined();
  });

  it('delivery keeps USD menu vs COP tariff separate', () => {
    const r = runSimulatedChat({
      menu: menu(),
      commerceId: COMMERCE,
      messages: [{ role: 'user', text: '¿Tienen delivery y cuánto cuesta?' }],
    });
    expect(r.text).toMatch(/COP|checkout|dirección|zona/i);
    expect(r.text).not.toMatch(/USD \+ COP|sumar USD/i);
  });
});

describe('Phase 3.1 security + revalidation', () => {
  it('cart_snapshot prices are ignored — server recalculates', () => {
    const ready = prepareCartLineProposal(menu(), COMMERCE, {
      product_name: 'Coca-Cola',
      quantity: 1,
    });
    expect(ready.status).toBe('ready');
    if (ready.status !== 'ready') return;
    const tampered = {
      ...ready.action,
      unit_price: 0.01,
      line_total: 0.01,
    };
    const check = revalidateProposeAdd(menu(), COMMERCE, tampered);
    expect(check.ok).toBe(true);
    if (!check.ok) return;
    expect(check.action.unit_price).toBe(1.2);
    expect(check.action.line_total).toBe(1.2);
  });

  it('stale catalog fingerprint forces revalidation', () => {
    const ready = prepareCartLineProposal(menu(), COMMERCE, {
      product_name: 'Coca-Cola',
    });
    expect(ready.status).toBe('ready');
    if (ready.status !== 'ready') return;
    const check = revalidateProposeAdd(menu(), COMMERCE, {
      ...ready.action,
      catalog_fingerprint: 'tampered-fingerprint',
    });
    expect(check.ok).toBe(false);
    if (check.ok === false) {
      expect(check.reason).toBe('stale');
    }
  });

  it('sheet selection builds proposal with real photo + options', () => {
    const r = buildProposeAddFromSelection({
      menu: menu(),
      commerceId: COMMERCE,
      productId: 'p-haw',
      selection: { grupos: { tam: ['g'] } },
      quantity: 1,
    });
    expect(r.status).toBe('ready');
    if (r.status !== 'ready') return;
    expect(r.action.product_card.image_url).toMatch(/haw\.jpg/);
    expect(r.action.product_card.selected_options?.some((s) => /Grande/i.test(s))).toBe(
      true,
    );
    expect(r.action.unit_price).toBeGreaterThan(3.5);
  });

  it('proposal ids are unique for anti-double-confirm', () => {
    const a = prepareCartLineProposal(menu(), COMMERCE, {
      product_name: 'Coca-Cola',
    });
    const b = prepareCartLineProposal(menu(), COMMERCE, {
      product_name: 'Coca-Cola',
    });
    expect(a.status).toBe('ready');
    expect(b.status).toBe('ready');
    if (a.status !== 'ready' || b.status !== 'ready') return;
    expect(a.action.proposal_id).not.toBe(b.action.proposal_id);
    expect(catalogFingerprint({ id: 'p-coca', precio: 1.2, disponible: true })).toMatch(
      /p-coca/,
    );
  });
});

describe('Phase 3.1 simulate gate', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('CHATBOT_SIMULATE_GEMINI enables runtime without API key locally', () => {
    vi.stubEnv('CHATBOT_ENABLED', '1');
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('CHATBOT_QUOTA_BACKEND', 'filesystem');
    vi.stubEnv('CHATBOT_SIMULATE_GEMINI', '1');
    vi.stubEnv('GEMINI_API_KEY', '');
    expect(isGeminiSimulationEnabled(process.env)).toBe(true);
    expect(isChatbotRuntimeAllowed(getChatbotConfig(process.env)).ok).toBe(true);
  });

  it('simulation never enabled in production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('CHATBOT_SIMULATE_GEMINI', '1');
    expect(isGeminiSimulationEnabled(process.env)).toBe(false);
  });
});
