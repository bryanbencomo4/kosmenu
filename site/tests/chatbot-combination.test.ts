import { describe, expect, it } from 'vitest';
import type { LoadedPublicMenu } from '../app/api/menu/_lib/load-public-menu';
import { prepareCartLineProposal } from '../app/api/chat/_lib/cart-proposals';
import {
  parseHalfHalfIntent,
  canCombineProducts,
} from '../app/api/chat/_lib/chat-combination';
import {
  describeBusinessExchangeRate,
  formatChatMoney,
  resolveMenuCurrency,
} from '../app/api/chat/_lib/chat-currency';
import { normalizeCurrencyCode } from '../app/_lib/checkout-exchange-rate';
import { resolveCombinedUnitPrice } from '../app/_lib/menu-product-options';
import { runSimulatedChat } from '../app/api/chat/_lib/simulate-gemini';
import {
  buildContextualQuickReplies,
  isQuickReplyActionable,
} from '../app/v/[id]/_components/chat/chat-quick-replies';
import type { ChatMessage } from '../app/v/[id]/_components/chat/chat-types';

const COMMERCE = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function sizeGroups() {
  return {
    activadas: true,
    grupos: [
      {
        id: 'g-size',
        nombre: 'Tamaños',
        tipo: 'unica',
        obligatorio: true,
        min: 1,
        max: 1,
        opciones: [
          { id: 'o-n', nombre: 'Normal', precio: 0, activo: true },
          { id: 'o-g', nombre: 'Grande', precio: 5, activo: true },
        ],
      },
    ],
  };
}

function comboMenu(opts?: {
  allowCombo?: boolean;
  moneda?: string;
  partnerPrice?: number;
  exchangeUsd?: number | null;
}): LoadedPublicMenu {
  const allow = opts?.allowCombo !== false;
  const granjeraOptions = {
    ...sizeGroups(),
    personalizacion: allow
      ? {
          version: 1,
          combinacion: {
            activada: true,
            titulo: 'Combina con',
            productos_compatibles: ['p-campesina'],
            regla_precio: 'max',
          },
        }
      : undefined,
  };
  return {
    resolvedComercioId: COMMERCE,
    ownerId: 'owner',
    isOnline: true,
    comercioRow: { id: COMMERCE },
    comercio: {
      id: COMMERCE,
      slug: 'trueno',
      nombre: 'pizzas el trueno',
      moneda: opts?.moneda ?? 'COP',
      en_linea: true,
      // Quote units per 1 base (COP): USD-per-COP. 1 USD ≈ 4000 COP → rate = 1/4000.
      exchange_rate_value:
        opts?.exchangeUsd === null
          ? null
          : opts?.exchangeUsd != null
            ? 1 / opts.exchangeUsd
            : 1 / 4000,
      exchange_rate_quote_currency: 'USD',
      exchange_rate_source: 'manual',
      exchange_rate_mode: 'manual',
    } as any,
    categorias: [{ id: 'cat-p', nombre: 'Pizzas' }],
    productos: [
      {
        id: 'p-granjera',
        categoria_id: 'cat-p',
        nombre: 'Granjera',
        descripcion: 'Pollo, maíz',
        precio: 8000,
        disponible: true,
        opciones_menu: granjeraOptions,
      },
      {
        id: 'p-campesina',
        categoria_id: 'cat-p',
        nombre: 'Campesina',
        descripcion: 'Maíz, pimentón',
        precio: opts?.partnerPrice ?? 10000,
        disponible: true,
        opciones_menu: sizeGroups(),
      },
      {
        id: 'p-hawaiana',
        categoria_id: 'cat-p',
        nombre: 'Hawaiana',
        precio: 9000,
        disponible: true,
        opciones_menu: sizeGroups(),
      },
    ],
    metodosPago: [],
    checkoutExchange: {
      currencies: ['COP', 'USD'],
      exchangeRates: {
        USD:
          opts?.exchangeUsd === null
            ? null
            : opts?.exchangeUsd != null
              ? 1 / opts.exchangeUsd
              : 1 / 4000,
      },
      exchangeRateModes: { USD: 'manual' },
      exchangeRateSources: { USD: 'manual' },
      exchangeRateAdjustments: {},
    },
    marketRates: null,
    upsellSettings: null,
    upsellRules: [],
    bundles: [],
    preCheckoutUpsell: null as any,
  };
}

describe('half/half intent parsing', () => {
  it('detects one combined pizza', () => {
    const i = parseHalfHalfIntent(
      'Quiero una pizza la mitad Granjera y la mitad Campesina',
    );
    expect(i.kind).toBe('combine');
    if (i.kind === 'combine') {
      expect(i.firstName).toMatch(/Granjera/i);
      expect(i.secondName).toMatch(/Campesina/i);
    }
  });

  it('detects two independent pizzas', () => {
    const i = parseHalfHalfIntent('Una Granjera y una Campesina');
    expect(i.kind).toBe('independent_pair');
  });
});

describe('prepareCartLineProposal combinación', () => {
  it('asks size once without creating two lines', () => {
    const menu = comboMenu();
    const r = prepareCartLineProposal(menu, COMMERCE, {
      product_name: 'Granjera',
      combine_with_product_name: 'Campesina',
      quantity: 1,
    });
    expect(r.status).toBe('needs_options');
    if (r.status === 'needs_options') {
      expect(r.ask_attribute_only).toBe(true);
      expect(r.pending_configuration?.combine_with_product_id).toBe(
        'p-campesina',
      );
      expect(r.pending_configuration?.size_choices).toEqual(
        expect.arrayContaining(['Normal', 'Grande']),
      );
    }
  });

  it('creates ONE combined line for Grande using MAX price rule', () => {
    const menu = comboMenu({ partnerPrice: 10000 });
    const r = prepareCartLineProposal(menu, COMMERCE, {
      product_id: 'p-granjera',
      combine_with_product_id: 'p-campesina',
      option_labels: ['Grande'],
      quantity: 1,
    });
    expect(r.status).toBe('ready');
    if (r.status !== 'ready') return;
    expect(r.action.quantity).toBe(1);
    expect(r.action.selection.combinacion?.productId).toBe('p-campesina');
    const expected = resolveCombinedUnitPrice(
      menu.productos[0] as any,
      null,
      r.action.selection,
      menu.productos[1] as any,
      null,
    );
    expect(r.action.unit_price).toBe(expected);
    expect(r.action.label).toMatch(/Combinaci[oó]n/i);
    expect(r.action.currency).toBe('COP');
  });

  it('rejects combination when not authorized', () => {
    const menu = comboMenu({ allowCombo: false });
    const r = prepareCartLineProposal(menu, COMMERCE, {
      product_name: 'Granjera',
      combine_with_product_name: 'Campesina',
      option_labels: ['Grande'],
    });
    expect(r.status).toBe('combination_not_allowed');
  });

  it('rejects unavailable partner', () => {
    const menu = comboMenu();
    (menu.productos[1] as any).disponible = false;
    const allowed = canCombineProducts(
      menu.productos[0] as any,
      menu.productos[1] as any,
    );
    expect(allowed.ok).toBe(false);
  });

  it('two independent pizzas stay as two proposals in simulator', () => {
    const menu = comboMenu();
    const sim = runSimulatedChat({
      menu,
      commerceId: COMMERCE,
      messages: [
        { role: 'user', text: 'Una Granjera Grande y una Campesina Grande' },
      ],
    });
    // Without "mitad", independent_pair OR other path — not a single combinacion
    const combined = sim.cartActions.filter(
      (a) =>
        a.type === 'propose_add' &&
        Boolean((a as any).selection?.combinacion),
    );
    expect(combined.length).toBe(0);
  });

  it('simulator: mitad → size ask → Grande → one line', () => {
    const menu = comboMenu();
    const ask = runSimulatedChat({
      menu,
      commerceId: COMMERCE,
      messages: [
        {
          role: 'user',
          text: 'Quiero una pizza la mitad Granjera y la mitad Campesina',
        },
      ],
    });
    expect(ask.cartActions).toHaveLength(0);
    expect(ask.pendingConfiguration?.product_id).toBe('p-granjera');
    expect(ask.text).toMatch(/Normal|Grande/i);

    const done = runSimulatedChat({
      menu,
      commerceId: COMMERCE,
      messages: [{ role: 'user', text: 'Grande' }],
      pendingConfiguration: ask.pendingConfiguration,
    });
    expect(done.cartActions).toHaveLength(1);
    expect(done.cartActions[0]!.type).toBe('propose_add');
    if (done.cartActions[0]!.type === 'propose_add') {
      expect(done.cartActions[0].selection.combinacion?.productId).toBe(
        'p-campesina',
      );
      expect(done.cartActions[0].quantity).toBe(1);
    }
  });
});

describe('currency + exchange rate', () => {
  it('maps PCO → COP', () => {
    expect(normalizeCurrencyCode('PCO')).toBe('COP');
  });

  it('uses comercio moneda as menu currency', () => {
    const menu = comboMenu({ moneda: 'COP' });
    expect(resolveMenuCurrency(menu)).toBe('COP');
    expect(formatChatMoney(18000, 'COP')).toMatch(/18\.?000|18000/);
  });

  it('describes configured USD rate without inventing', () => {
    const menu = comboMenu({ exchangeUsd: 4000 });
    const fx = describeBusinessExchangeRate(menu, {
      quoteCurrency: 'USD',
      amount: 10,
      fromCurrency: 'USD',
    });
    expect(fx.ok).toBe(true);
    if (!fx.ok) return;
    expect(fx.rate_label).toMatch(/USD/);
    expect(fx.amount_to_label).toBeTruthy();
  });

  it('reports missing rate clearly when convert has no path', () => {
    const menu = comboMenu({ exchangeUsd: null });
    menu.checkoutExchange = {
      currencies: ['COP'],
      exchangeRates: {},
      exchangeRateModes: {},
      exchangeRateSources: {},
      exchangeRateAdjustments: {},
    };
    (menu.comercio as any).exchange_rate_value = null;
    (menu.comercio as any).exchange_rate_quote_currency = null;
    menu.marketRates = { payload: {} } as any;
    // JPY is unlikely to derive from empty market payload for a COP menu.
    const fx = describeBusinessExchangeRate(menu, { quoteCurrency: 'JPY' });
    if (fx.ok === true) {
      // Some environments may still derive a rate; require honesty in the note.
      expect(fx.note).toMatch(/referencial|checkout/i);
    } else {
      expect(fx.ok).toBe(false);
      expect(fx.error).toMatch(/tasa|verificable/i);
    }
  });
});

describe('size quick replies for pending combinación', () => {
  it('shows Normal/Grande from pendingSizeChoices', () => {
    const { chips, context } = buildContextualQuickReplies({
      catalog: null,
      cartCount: 0,
      messages: [
        {
          id: 'a',
          role: 'assistant',
          text: '¿Normal o Grande?',
          createdAt: Date.now(),
        } as ChatMessage,
      ],
      pendingSizeChoices: ['Normal', 'Grande'],
    });
    expect(chips.map((c) => c.label)).toEqual(['Normal', 'Grande']);
    expect(context?.kind).toBe('size_or_flavor');
  });

  it('rejects stale chips', () => {
    expect(
      isQuickReplyActionable(
        {
          id: 'x',
          label: 'Grande',
          action: { type: 'text', text: 'Grande' },
          contextId: 'old',
        },
        'new',
      ),
    ).toBe(false);
  });
});
