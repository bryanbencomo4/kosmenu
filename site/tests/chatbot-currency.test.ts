import { describe, expect, it } from 'vitest';

import {
  formatChatMoney,
  resolveMenuCurrency,
} from '../app/api/chat/_lib/chat-currency';
import { buildChatSystemPrompt } from '../app/api/chat/_lib/prompt';
import {
  executeChatTool,
  type ChatToolContext,
} from '../app/api/chat/_lib/tools';
import type { LoadedPublicMenu } from '../app/api/menu/_lib/load-public-menu';
import { toChatProductCard } from '../app/v/[id]/_components/chat/chat-catalog';

function fixtureMenu(moneda: string): LoadedPublicMenu {
  const commerceId = '11111111-1111-4111-8111-111111111111';
  return {
    resolvedComercioId: commerceId,
    ownerId: 'owner-1',
    isOnline: true,
    comercioRow: { id: commerceId },
    comercio: {
      id: commerceId,
      slug: 'demo',
      nombre: 'Demo COP',
      moneda,
      en_linea: true,
      permite_delivery: true,
    } as never,
    categorias: [{ id: 'c1', nombre: 'Pizzas' }],
    productos: [
      {
        id: 'p1',
        categoria_id: 'c1',
        nombre: 'Hawaiana',
        precio: 25000,
        disponible: true,
      },
    ],
    metodosPago: [],
    checkoutExchange: {
      currencies: ['COP', 'USD'],
      // quote units per 1 base unit: 1 COP → 1/4000 USD
      exchangeRates: { USD: 1 / 4000 },
      exchangeRateModes: { USD: 'manual' },
      exchangeRateSources: { USD: 'manual' },
      exchangeRateAdjustments: {},
    },
    marketRates: null,
    upsellSettings: null,
    upsellRules: [],
    bundles: [],
    preCheckoutUpsell: null as never,
  } as unknown as LoadedPublicMenu;
}

describe('chat currency', () => {
  it('defaults missing moneda to COP (never USD)', () => {
    const menu = fixtureMenu('');
    (menu.comercio as { moneda?: string }).moneda = '';
    expect(resolveMenuCurrency(menu)).toBe('COP');
    expect(formatChatMoney(25000, 'COP')).toMatch(/25\.?000|\$/);
    expect(formatChatMoney(25000, 'COP')).not.toMatch(/USD/);
  });

  it('formats client catalog cards in the menu currency', () => {
    const card = toChatProductCard({
      id: 'p1',
      categoryId: 'c1',
      name: 'Hawaiana',
      description: null,
      imageUrl: null,
      price: 25000,
      currency: 'COP',
      available: true,
      requiresConfiguration: false,
    });
    expect(card.currency).toBe('COP');
    expect(card.price_label).not.toMatch(/USD/i);
    expect(card.price_label).toMatch(/25/);
  });

  it('convert_menu_price uses checkout rates', () => {
    const ctx: ChatToolContext = {
      menu: fixtureMenu('COP'),
      commerceId: '11111111-1111-4111-8111-111111111111',
    };
    const hit = executeChatTool(ctx, 'convert_menu_price', {
      target_currency: 'USD',
      product_name: 'Hawaiana',
    }) as {
      ok: boolean;
      amount_target: number;
      currency_menu: string;
      currency_target: string;
    };
    expect(hit.ok).toBe(true);
    expect(hit.currency_menu).toBe('COP');
    expect(hit.currency_target).toBe('USD');
    expect(hit.amount_target).toBeCloseTo(6.25, 2);
  });

  it('prompt forbids inventing USD when menu is COP', () => {
    const prompt = buildChatSystemPrompt({
      businessName: 'Demo',
      currency: 'COP',
    });
    expect(prompt).toMatch(/están en COP/);
    expect(prompt).toMatch(/convert_menu_price/);
    expect(prompt).toMatch(/nunca digas USD/i);
  });
});
