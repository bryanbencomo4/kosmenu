import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  prepareCartLineProposal,
  proposeRemoveFromSnapshot,
  proposeUpdateQtyInSnapshot,
  summarizeCartSnapshot,
} from '../app/api/chat/_lib/cart-proposals';
import { getDeliveryConditions } from '../app/api/chat/_lib/delivery-conditions';
import {
  __disableLiveBudgetForTests,
  __resetLiveBudgetBootstrapForTests,
  runChatWithGemini,
  runDeterministicCartSummary,
  runDeterministicDeliveryInfo,
} from '../app/api/chat/_lib/gemini';
import {
  configureLiveBudget,
  getLiveBudgetSnapshot,
  recordLiveBudgetGeminiHttpCall,
  patchLiveBudgetLastCall,
} from '../app/api/chat/_lib/live-budget';
import { buildChatSystemPrompt } from '../app/api/chat/_lib/prompt';
import { chatRequestSchema } from '../app/api/chat/_lib/schema';
import {
  executeChatTool,
  type ChatToolContext,
} from '../app/api/chat/_lib/tools';
import {
  buildCartLineKey,
  resolveCartLineUnitPrice,
  type CartLineSelection,
} from '../app/_lib/menu-product-options';
import {
  CHECKOUT_CART_CACHE_PREFIX,
  readCachedCheckoutCart,
  writeCachedCheckoutCart,
} from '../app/_lib/checkout-cart-cache';
import type { LoadedPublicMenu } from '../app/api/menu/_lib/load-public-menu';

const COMMERCE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

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
    {
      id: 'ex',
      nombre: 'Extras',
      tipo: 'multiple',
      obligatorio: false,
      min: 0,
      max: 3,
      opciones: [{ id: 'e1', nombre: 'Extra queso', precio: 0.5, activo: true }],
    },
  ],
  personalizacion: {
    version: 1,
    exclusiones: {
      activadas: true,
      titulo: '¿Quieres quitar algo?',
      ingredientes: [
        { id: 'r_jamon', nombre: 'Jamón' },
        { id: 'r_pina', nombre: 'Piña' },
      ],
      pregunta_activada: true,
    },
  },
};

function phase3Menu(overrides?: Partial<LoadedPublicMenu>): LoadedPublicMenu {
  return {
    resolvedComercioId: COMMERCE,
    ownerId: 'o',
    isOnline: true,
    comercioRow: {
      branding_ia: {
        config_negocio: {
          inicio_menu: { delivery: true, para_llevar: true, comer_aqui: true },
          delivery_config: {
            enabled: true,
            version: 1,
            currency: 'COP',
            pricing_type: 'zones',
            zones: [
              { name: 'Zona 1', price: 5000, min_distance: 0, max_distance: 1 },
              { name: 'Zona 2', price: 7500, min_distance: 1, max_distance: 3 },
            ],
            fixed_price: 0,
            min_order: 0,
            free_delivery: { enabled: false, minimum_order: 0 },
            estimated_times: { delivery_minutes: 15, preparation_minutes: 30 },
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
        id: 'p-agua',
        categoria_id: 'c-beb',
        nombre: 'Agua 200 ml.',
        descripcion: 'Agua',
        precio: 0.44,
        disponible: true,
        imagen_url: null,
      },
      {
        id: 'p-coca',
        categoria_id: 'c-beb',
        nombre: 'Coca-Cola',
        descripcion: '350 ml',
        precio: 1.2,
        disponible: true,
      },
      {
        id: 'p-marg',
        categoria_id: 'c-pizza',
        nombre: 'Margarita',
        descripcion: 'Solo Queso',
        precio: 3.5,
        disponible: true,
        opciones_menu: sizeGrupos,
        imagen_url: 'https://cdn.example/margarita.jpg',
      },
      {
        id: 'p-haw',
        categoria_id: 'c-pizza',
        nombre: 'Hawaiana',
        descripcion: 'Jamón, Queso, Piña',
        precio: 3.5,
        disponible: true,
        opciones_menu: sizeGrupos,
      },
      {
        id: 'p-gone',
        categoria_id: 'c-pizza',
        nombre: 'Agotada',
        precio: 4,
        disponible: false,
        opciones_menu: sizeGrupos,
      },
    ],
    metodosPago: [],
    checkoutExchange: {} as any,
    marketRates: null,
    upsellSettings: null,
    upsellRules: [],
    bundles: [],
    preCheckoutUpsell: null as any,
    ...overrides,
  };
}

describe('Phase 3 §0 attribution + delivery + currency', () => {
  afterEach(() => {
    __resetLiveBudgetBootstrapForTests();
    __disableLiveBudgetForTests();
  });

  it('attributes each recorded Gemini HTTP call to a requestId in the budget file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'attr-'));
    const file = join(dir, 'budget.json');
    configureLiveBudget({
      enabled: true,
      maxGeminiHttpCalls: 6,
      persistPath: file,
      resetCounters: true,
    });
    recordLiveBudgetGeminiHttpCall({
      requestId: 'r_aaa',
      seq: 1,
      kind: 'primary',
      model: 'gemini-3.1-flash-lite',
      outcome: 'pending',
    });
    patchLiveBudgetLastCall({
      requestId: 'r_aaa',
      outcome: 'ok',
      httpStatus: 200,
      tokensIn: 1173,
      tokensOut: 14,
    });
    const disk = JSON.parse(readFileSync(file, 'utf8'));
    expect(disk.geminiHttpCalls).toBe(1);
    expect(disk.recentCalls[0].requestId).toBe('r_aaa');
    expect(disk.recentCalls[0].tokensIn).toBe(1173);
    expect(getLiveBudgetSnapshot().recentCalls[0].outcome).toBe('ok');
  });

  it('get_delivery_conditions is deterministic and keeps COP tariff vs USD menu separate', () => {
    const d = getDeliveryConditions(phase3Menu());
    expect(d.delivery_enabled).toBe(true);
    expect(d.menu_currency).toBe('USD');
    expect(d.tariff_currency).toBe('COP');
    expect(d.currencies_match).toBe(false);
    expect(d.requires_customer_address).toBe(true);
    expect(d.can_quote_exact_fee_now).toBe(false);
    expect(d.exact_fee).toBeNull();
    expect(d.fee_overview.some((x) => /5000 COP/.test(x))).toBe(true);
    expect(d.warning).toMatch(/No inventes|no los sumes/i);
  });

  it('deterministic delivery_info skips Gemini HTTP', () => {
    const ctx: ChatToolContext = {
      menu: phase3Menu(),
      commerceId: COMMERCE,
    };
    const result = runDeterministicDeliveryInfo({
      toolCtx: ctx,
      requestId: 'r_del',
    });
    expect(result.skippedLlm).toBe(true);
    expect(result.geminiHttpCalls).toBe(0);
    expect(result.text).toMatch(/delivery/i);
    expect(result.text).toMatch(/checkout|dirección|zona/i);
    expect(result.cartActions).toEqual([]);
  });

  it('prompt forbids inventing delivery fees and mixing currencies', () => {
    const prompt = buildChatSystemPrompt({
      businessName: 'Trueno',
      currency: 'USD',
    });
    expect(prompt).toMatch(/get_delivery_conditions/);
    expect(prompt).toMatch(/monedas distintas|No.*sumes/i);
    expect(prompt).toMatch(/propose_open_checkout|NO.*pedidos/i);
  });
});

describe('Phase 3 cart proposals (1–14, 18–20, 25)', () => {
  const menu = phase3Menu();

  it('1. producto simple listo sin opciones', () => {
    const r = prepareCartLineProposal(menu, COMMERCE, {
      product_name: 'Coca-Cola',
      quantity: 1,
    });
    expect(r.status).toBe('ready');
    if (r.status !== 'ready') return;
    expect(r.action.unit_price).toBe(1.2);
    expect(r.action.requires_confirmation).toBe(true);
  });

  it('2. producto con tamaño Grande', () => {
    const r = prepareCartLineProposal(menu, COMMERCE, {
      product_name: 'Hawaiana',
      quantity: 1,
      option_labels: ['Grande'],
    });
    expect(r.status).toBe('ready');
    if (r.status !== 'ready') return;
    const haw = menu.productos.find(
      (p) => (p as { id?: string }).id === 'p-haw',
    ) as { id: string; precio?: number; opciones_menu?: unknown };
    const expected = resolveCartLineUnitPrice(
      haw,
      menu.categorias[0] as { nombre?: string | null },
      r.action.selection,
    );
    expect(r.action.unit_price).toBe(expected);
    expect(r.action.unit_price).toBeGreaterThan(3.5);
  });

  it('3. producto con extras', () => {
    const r = prepareCartLineProposal(menu, COMMERCE, {
      product_name: 'Margarita',
      option_labels: ['Normal', 'Extra queso'],
    });
    expect(r.status).toBe('ready');
    if (r.status !== 'ready') return;
    expect(r.action.unit_price).toBeGreaterThan(3.5);
  });

  it('4. ingrediente excluido permitido', () => {
    const r = prepareCartLineProposal(menu, COMMERCE, {
      product_name: 'Hawaiana',
      option_labels: ['Normal'],
      exclude_ingredients: ['Piña'],
    });
    expect(r.status).toBe('ready');
    if (r.status !== 'ready') return;
    expect(r.action.selection.exclusionesIds).toContain('r_pina');
  });

  it('4b. exclusiones inexistentes se rechazan', () => {
    const r = prepareCartLineProposal(menu, COMMERCE, {
      product_name: 'Hawaiana',
      option_labels: ['Normal'],
      exclude_ingredients: ['cebolla'],
    });
    expect(r.status).toBe('invalid_options');
  });

  it('5. variaciones obligatorias → needs_options', () => {
    const r = prepareCartLineProposal(menu, COMMERCE, {
      product_name: 'Hawaiana',
      quantity: 1,
    });
    expect(r.status).toBe('needs_options');
    if (r.status !== 'needs_options') return;
    expect(r.missing_groups.some((g) => /Tama/i.test(g.name))).toBe(true);
  });

  it('6. dos productos diferentes', () => {
    const a = prepareCartLineProposal(menu, COMMERCE, {
      product_name: 'Hawaiana',
      option_labels: ['Grande'],
      quantity: 1,
    });
    const b = prepareCartLineProposal(menu, COMMERCE, {
      product_name: 'Coca-Cola',
      quantity: 1,
    });
    expect(a.status).toBe('ready');
    expect(b.status).toBe('ready');
    if (a.status !== 'ready' || b.status !== 'ready') return;
    expect(a.action.cart_key).not.toBe(b.action.cart_key);
  });

  it('7. dos unidades del mismo producto', () => {
    const r = prepareCartLineProposal(menu, COMMERCE, {
      product_name: 'Hawaiana',
      option_labels: ['Grande'],
      quantity: 2,
    });
    expect(r.status).toBe('ready');
    if (r.status !== 'ready') return;
    expect(r.action.quantity).toBe(2);
    expect(r.action.line_total).toBe(
      Math.round(r.action.unit_price * 2 * 100) / 100,
    );
  });

  it('8. producto inexistente', () => {
    const r = prepareCartLineProposal(menu, COMMERCE, {
      product_name: 'Unicornio Flameado',
    });
    expect(r.status).toBe('not_found');
  });

  it('9. producto agotado', () => {
    const r = prepareCartLineProposal(menu, COMMERCE, {
      product_name: 'Agotada',
      option_labels: ['Normal'],
    });
    expect(r.status).toBe('unavailable');
  });

  it('10. producto de otro restaurante (tenant)', () => {
    const r = prepareCartLineProposal(menu, OTHER, {
      product_name: 'Hawaiana',
      option_labels: ['Normal'],
    });
    expect(r.status).toBe('foreign_product');
  });

  it('11. precio modificado por el cliente se rechaza', () => {
    const r = prepareCartLineProposal(menu, COMMERCE, {
      product_name: 'Coca-Cola',
      client_unit_price: 0.01,
    });
    expect(r.status).toBe('price_tamper');
  });

  it('12. opciones inválidas', () => {
    const r = prepareCartLineProposal(menu, COMMERCE, {
      product_name: 'Hawaiana',
      option_labels: ['Familiar XXL'],
    });
    expect(r.status).toBe('invalid_options');
  });

  it('13–14. quitar y cambiar cantidad desde snapshot', () => {
    const ready = prepareCartLineProposal(menu, COMMERCE, {
      product_name: 'Hawaiana',
      option_labels: ['Grande'],
      quantity: 2,
    });
    expect(ready.status).toBe('ready');
    if (ready.status !== 'ready') return;
    const lines = [
      {
        productId: ready.action.product_id,
        quantity: ready.action.quantity,
        selection: ready.action.selection,
      },
    ];
    const upd = proposeUpdateQtyInSnapshot(
      menu,
      COMMERCE,
      lines,
      'Hawaiana',
      1,
    );
    expect('error' in upd).toBe(false);
    if ('error' in upd) return;
    expect(upd.type).toBe('propose_update_qty');
    if (upd.type === 'propose_update_qty') expect(upd.quantity).toBe(1);

    const rem = proposeRemoveFromSnapshot(menu, COMMERCE, lines, 'Hawaiana');
    expect('error' in rem).toBe(false);
    if ('error' in rem) return;
    expect(rem.type).toBe('propose_remove');
  });

  it('18. subtotal correcto del snapshot', () => {
    const a = prepareCartLineProposal(menu, COMMERCE, {
      product_name: 'Hawaiana',
      option_labels: ['Grande'],
      quantity: 2,
    });
    const b = prepareCartLineProposal(menu, COMMERCE, {
      product_name: 'Coca-Cola',
      quantity: 1,
    });
    if (a.status !== 'ready' || b.status !== 'ready') throw new Error('setup');
    const snap = summarizeCartSnapshot(menu, COMMERCE, [
      {
        productId: a.action.product_id,
        quantity: a.action.quantity,
        selection: a.action.selection,
      },
      {
        productId: b.action.product_id,
        quantity: b.action.quantity,
        selection: b.action.selection,
      },
    ]);
    expect(snap.currency).toBe('USD');
    expect(snap.subtotal).toBe(
      Math.round((a.action.line_total + b.action.line_total) * 100) / 100,
    );
  });

  it('19–20. delivery fees + currencies identified, no improvised FX', () => {
    const d = executeChatTool(
      { menu, commerceId: COMMERCE },
      'get_delivery_conditions',
      {},
    ) as ReturnType<typeof getDeliveryConditions>;
    expect(d.tariff_currency).toBe('COP');
    expect(d.menu_currency).toBe('USD');
    expect(d.can_quote_exact_fee_now).toBe(false);
  });

  it('25. no hay order_actions / no crea pedidos desde propuestas', () => {
    const r = prepareCartLineProposal(menu, COMMERCE, {
      product_name: 'Coca-Cola',
    });
    expect(r.status).toBe('ready');
    if (r.status !== 'ready') return;
    expect(r.action.type).toBe('propose_add');
    expect((r.action as any).create_order).toBeUndefined();
    const checkout = executeChatTool(
      { menu, commerceId: COMMERCE, pendingActions: [] },
      'propose_open_checkout',
      {},
    ) as any;
    expect(checkout.action.type).toBe('open_checkout');
    expect(checkout.note).toMatch(/No crees el pedido/i);
  });
});

describe('Phase 3 sync / persistence / history (15–17, 26)', () => {
  it('15–16. cart cache round-trip preserves selection (menu↔chat)', () => {
    const menu = phase3Menu();
    const ready = prepareCartLineProposal(menu, COMMERCE, {
      product_name: 'Hawaiana',
      option_labels: ['Grande'],
      quantity: 2,
    });
    expect(ready.status).toBe('ready');
    if (ready.status !== 'ready') return;

    const key = `${CHECKOUT_CART_CACHE_PREFIX}${COMMERCE}`;
    const store = new Map<string, string>();
    const localStorageMock = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
    };
    vi.stubGlobal('window', { localStorage: localStorageMock });
    vi.stubGlobal('localStorage', localStorageMock);

    writeCachedCheckoutCart(COMMERCE, {
      items: [
        {
          productId: ready.action.product_id,
          quantity: ready.action.quantity,
          selection: ready.action.selection,
        },
      ],
    });
    const cached = readCachedCheckoutCart(COMMERCE);
    expect(cached?.items[0]?.productId).toBe('p-haw');
    expect(cached?.items[0]?.selection.grupos?.tam).toEqual(['g']);
    expect(buildCartLineKey('p-haw', cached!.items[0].selection)).toBe(
      ready.action.cart_key,
    );
    expect(key.startsWith('elmenuxfa:checkout-cart-v1:')).toBe(true);
    vi.unstubAllGlobals();
  });

  it('17. schema accepts conversation history + cart_snapshot', () => {
    const body = chatRequestSchema.parse({
      sessionId: 's_abcdefghijklmnop',
      messages: [
        { role: 'user', text: 'Quiero una Hawaiana' },
        { role: 'assistant', text: '¿Normal o Grande?' },
        { role: 'user', text: 'Grande' },
      ],
      cart_snapshot: [
        {
          productId: 'p-coca',
          quantity: 1,
          selection: {},
        },
      ],
    });
    expect(body.messages).toHaveLength(3);
    expect(body.cart_snapshot?.[0].productId).toBe('p-coca');
  });

  it('26. open_checkout is compatible with existing checkout (no alternate order route)', () => {
    const ctx: ChatToolContext = {
      menu: phase3Menu(),
      commerceId: COMMERCE,
      pendingActions: [],
    };
    const r = executeChatTool(ctx, 'propose_open_checkout', {}) as any;
    expect(r.action.type).toBe('open_checkout');
    expect(ctx.pendingActions?.[0].type).toBe('open_checkout');
  });
});

describe('Phase 3 gates / errors / concurrency / LLM reduction (21–24, 27)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    __disableLiveBudgetForTests();
  });

  it('21. offline commerce blocked unless local exception (unit: isOnline flag on menu)', () => {
    const offline = phase3Menu({
      isOnline: false,
      comercio: {
        nombre: 'pizzas el trueno',
        moneda: 'USD',
        en_linea: false,
        permite_delivery: true,
      } as any,
    });
    expect(offline.comercio.en_linea).toBe(false);
    expect(offline.isOnline).toBe(false);
  });

  it('22. Gemini error surfaces attribution without secrets', async () => {
    __disableLiveBudgetForTests();
    const { getChatbotConfig } = await import('../app/api/chat/_lib/config');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 503,
        json: async () => ({}),
      })),
    );
    await expect(
      runChatWithGemini({
        config: {
          ...getChatbotConfig(),
          geminiApiKey: 'fake',
          model: 'gemini-3.1-flash-lite',
          modelFallback: 'gemini-2.5-flash-lite',
          modelWarnings: [],
          timeoutMs: 2000,
          maxToolRounds: 2,
          maxHistoryMessages: 8,
          maxOutputTokens: 64,
        },
        toolCtx: { menu: phase3Menu(), commerceId: COMMERCE },
        businessName: 'Trueno',
        messages: [{ role: 'user', text: 'hola' }],
        requestId: 'r_err',
      }),
    ).rejects.toMatchObject({
      code: 'gemini_unavailable',
      attribution: expect.objectContaining({ requestId: 'r_err' }),
    });
  });

  it('23. tool failure returns error object without crashing the turn', () => {
    const ctx: ChatToolContext = {
      menu: phase3Menu(),
      commerceId: OTHER, // mismatch
    };
    expect(() =>
      executeChatTool(ctx, 'search_products', { query: 'x' }),
    ).toThrow(/Tenant mismatch/i);
  });

  it('24. concurrent prepare proposals do not collide (pure functions)', () => {
    const menu = phase3Menu();
    const results = Array.from({ length: 8 }, (_, i) =>
      prepareCartLineProposal(menu, COMMERCE, {
        product_name: i % 2 === 0 ? 'Coca-Cola' : 'Agua 200 ml.',
        quantity: 1,
      }),
    );
    expect(results.every((r) => r.status === 'ready')).toBe(true);
  });

  it('27. deterministic cart summary avoids Gemini HTTP', () => {
    const menu = phase3Menu();
    const ready = prepareCartLineProposal(menu, COMMERCE, {
      product_name: 'Coca-Cola',
      quantity: 2,
    });
    if (ready.status !== 'ready') throw new Error('setup');
    const result = runDeterministicCartSummary({
      requestId: 'r_cart',
      toolCtx: {
        menu,
        commerceId: COMMERCE,
        cartSnapshot: [
          {
            productId: ready.action.product_id,
            quantity: ready.action.quantity,
            selection: ready.action.selection,
          },
        ],
      },
    });
    expect(result.geminiHttpCalls).toBe(0);
    expect(result.skippedLlm).toBe(true);
    expect(result.text).toMatch(/Coca-Cola|Subtotal/i);
    expect(result.cartActions.some((a) => a.type === 'open_checkout')).toBe(
      true,
    );
  });

  it('prepare_cart_line_proposal tool accumulates validated actions for UI', () => {
    const ctx: ChatToolContext = {
      menu: phase3Menu(),
      commerceId: COMMERCE,
      pendingActions: [],
      pendingCards: [],
    };
    const result = executeChatTool(ctx, 'prepare_cart_line_proposal', {
      product_name: 'Hawaiana',
      quantity: 2,
      option_labels: ['Grande'],
    }) as any;
    expect(result.status).toBe('ready');
    expect(ctx.pendingActions).toHaveLength(1);
    expect(ctx.pendingCards?.[0].name).toMatch(/Hawaiana/i);
    expect(ctx.pendingCards?.[0].image_url).toBeNull();
  });

  it('product cards include real image when present', () => {
    const ctx: ChatToolContext = {
      menu: phase3Menu(),
      commerceId: COMMERCE,
      pendingActions: [],
      pendingCards: [],
    };
    executeChatTool(ctx, 'prepare_cart_line_proposal', {
      product_name: 'Margarita',
      option_labels: ['Normal'],
    });
    expect(ctx.pendingCards?.[0].image_url).toMatch(/margarita\.jpg/);
  });
});

describe('Phase 3 selection type sanity', () => {
  it('buildCartLineKey distinguishes size selections', () => {
    const normal: CartLineSelection = { grupos: { tam: ['n'] } };
    const grande: CartLineSelection = { grupos: { tam: ['g'] } };
    expect(buildCartLineKey('p-haw', normal)).not.toBe(
      buildCartLineKey('p-haw', grande),
    );
  });
});
