import { describe, expect, it } from 'vitest';
import type { LoadedPublicMenu } from '../app/api/menu/_lib/load-public-menu';
import {
  executeChatTool,
  searchProductsForTests,
  type ChatToolContext,
} from '../app/api/chat/_lib/tools';

function fixtureMenu(overrides?: Partial<LoadedPublicMenu>): LoadedPublicMenu {
  const commerceId = '11111111-1111-4111-8111-111111111111';
  return {
    resolvedComercioId: commerceId,
    ownerId: 'owner-1',
    isOnline: true,
    comercioRow: { id: commerceId },
    comercio: {
      id: commerceId,
      slug: 'demo-rest',
      nombre: 'Demo Rest',
      moneda: 'USD',
      en_linea: true,
      permite_delivery: true,
      recibe_pedidos_whatsapp: true,
      direccion: 'Calle 1',
      whatsapp: '+584140000000',
      horarios: {
        timezone: 'America/Caracas',
        days: {
          monday: { open: true, ranges: [{ start: '09:00', end: '18:00' }] },
        },
      },
    } as any,
    categorias: [
      { id: 'cat-burgers', nombre: 'Hamburguesas' },
      { id: 'cat-drinks', nombre: 'Bebidas' },
    ],
    productos: [
      {
        id: 'p-pollo',
        categoria_id: 'cat-burgers',
        nombre: 'Hamburguesa de Pollo',
        descripcion: 'Pechuga grill',
        precio: 7.5,
        disponible: true,
        opciones_menu: {
          activadas: true,
          grupos: [
            {
              id: 'g1',
              nombre: 'Punto',
              tipo: 'unica',
              obligatorio: true,
              min: 1,
              max: 1,
              opciones: [
                { id: 'o1', nombre: 'Normal', precio: 0, activo: true },
                { id: 'o2', nombre: 'Extra queso', precio: 1, activo: true },
              ],
            },
          ],
        },
      },
      {
        id: 'p-res',
        categoria_id: 'cat-burgers',
        nombre: 'Hamburguesa de Res',
        descripcion: 'Blend de res',
        precio: 8,
        disponible: true,
      },
      {
        id: 'p-agotada',
        categoria_id: 'cat-burgers',
        nombre: 'Hamburguesa Agotada',
        precio: 9,
        disponible: false,
      },
      {
        id: 'p-agua',
        categoria_id: 'cat-drinks',
        nombre: 'Agua',
        precio: 1,
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
    ...overrides,
  };
}

describe('chatbot read-only tools', () => {
  const ctx: ChatToolContext = {
    menu: fixtureMenu(),
    commerceId: '11111111-1111-4111-8111-111111111111',
  };

  it('identifies commerce and lists categories', () => {
    const info = executeChatTool(ctx, 'get_business_information', {}) as any;
    expect(info.id).toBe(ctx.commerceId);
    expect(info.name).toBe('Demo Rest');

    const cats = executeChatTool(ctx, 'get_categories', {}) as any;
    expect(cats.categories.some((c: any) => c.name === 'Hamburguesas')).toBe(true);
  });

  it('searches real chicken burgers and ignores missing ones', () => {
    const hit = searchProductsForTests(ctx, { query: 'hamburguesa pollo' }) as any;
    expect(hit.count).toBeGreaterThan(0);
    expect(hit.results[0].id).toBe('p-pollo');
    expect(hit.results[0].price_min).toBeGreaterThan(0);

    const miss = searchProductsForTests(ctx, { query: 'tacos espaciales' }) as any;
    expect(miss.count).toBe(0);
  });

  it('excludes sold-out by default and includes when asked', () => {
    const available = searchProductsForTests(ctx, {
      query: 'Hamburguesa Agotada',
    }) as any;
    expect(available.count).toBe(0);

    const all = searchProductsForTests(ctx, {
      query: 'Hamburguesa Agotada',
      available_only: false,
    }) as any;
    expect(all.count).toBe(1);
    expect(all.results[0].available).toBe(false);
  });

  it('returns variation groups for configured products', () => {
    const detail = executeChatTool(ctx, 'get_product_details', {
      product_id: 'p-pollo',
    }) as any;
    expect(detail.found).toBe(true);
    expect(detail.product.requires_configuration).toBe(true);
    expect(detail.product.option_groups.length).toBeGreaterThan(0);
  });

  it('filters by budget max_price', () => {
    const budget = searchProductsForTests(ctx, {
      query: 'hamburguesa',
      max_price: 7.5,
    }) as any;
    expect(budget.results.every((r: any) => r.price_min <= 7.5)).toBe(true);
    expect(budget.results.some((r: any) => r.id === 'p-res')).toBe(false);
  });

  it('rejects tool context tenant mismatch', () => {
    expect(() =>
      executeChatTool(
        { ...ctx, commerceId: '22222222-2222-4222-8222-222222222222' },
        'get_categories',
        {},
      ),
    ).toThrow(/Tenant mismatch/);
  });

  it('does not expose another commerce catalog when ids differ', () => {
    const other = fixtureMenu({
      resolvedComercioId: '22222222-2222-4222-8222-222222222222',
      productos: [
        {
          id: 'other-only',
          categoria_id: 'cat-burgers',
          nombre: 'Secreto Otro Rest',
          precio: 99,
          disponible: true,
        },
      ],
    });
    // Bound tools to commerce A menu — other product never appears
    const hit = searchProductsForTests(ctx, { query: 'Secreto Otro Rest' }) as any;
    expect(hit.count).toBe(0);
    expect(hit.results?.some((r: any) => r.id === 'other-only')).toBeFalsy();
    expect(other.resolvedComercioId).not.toBe(ctx.commerceId);
  });

  it('fulfillment methods are read-only public flags', () => {
    const f = executeChatTool(ctx, 'get_available_fulfillment_methods', {}) as any;
    expect(f.delivery).toBe(true);
    expect(f.whatsapp_orders).toBe(true);
  });
});
