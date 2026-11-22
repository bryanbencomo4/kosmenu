import { describe, expect, it } from 'vitest';

import {
  classifyCategoryName,
  filterCatalogProducts,
  productsInCategory,
  suggestComplementProducts,
  toChatProductCard,
} from '../app/v/[id]/_components/chat/chat-catalog';
import type {
  ChatCatalogProduct,
  ChatCatalogSnapshot,
} from '../app/v/[id]/_components/chat/chat-catalog';

function product(
  id: string,
  categoryId: string,
  name: string,
  extra: Partial<ChatCatalogProduct> = {},
): ChatCatalogProduct {
  return {
    id,
    categoryId,
    name,
    description: null,
    imageUrl: null,
    price: 10,
    currency: 'USD',
    available: true,
    requiresConfiguration: false,
    ...extra,
  };
}

function category(id: string, name: string, products: ChatCatalogProduct[]) {
  return {
    id,
    name,
    imageUrl: null,
    productCount: products.filter((p) => p.categoryId === id).length,
    availableCount: products.filter((p) => p.categoryId === id && p.available).length,
  };
}

const products: ChatCatalogProduct[] = [
  product('b1', 'burgers', 'Hamburguesa Clásica', { description: 'Carne y queso' }),
  product('b2', 'burgers', 'Hamburguesa Doble', { requiresConfiguration: true, price: 14.5 }),
  product('b3', 'burgers', 'Hamburguesa Agotada', { available: false }),
  product('d1', 'drinks', 'Coca-Cola'),
  product('d2', 'drinks', 'Limonada'),
  product('d3', 'drinks', 'Cerveza', { available: false }),
  product('d4', 'beer', 'Jugo de Piña'),
  product('s1', 'desserts', 'Flan'),
  product('s2', 'desserts', 'Brownie'),
  product('p1', 'sides', 'Papas Fritas'),
];

const catalog: ChatCatalogSnapshot = {
  currency: 'USD',
  products,
  categories: [
    category('burgers', 'Hamburguesas', products),
    category('sides', 'Acompañamientos', products),
    category('drinks', 'Bebidas', products),
    category('desserts', 'Postres', products),
    category('beer', 'Jugos y Refrescos', products),
  ],
};

describe('chat catalog helpers', () => {
  it('maps a catalog product to ChatProductCardData', () => {
    const card = toChatProductCard(products[1]);
    expect(card.product_id).toBe('b2');
    expect(card.requires_configuration).toBe(true);
    expect(card.price_unit).toBe(14.5);
    expect(card.price_label).toBe('14.5 USD');
    expect(card.option_hints).toEqual([]);
    expect(toChatProductCard(product('x', 'c', 'Gratis', { price: 0 })).price_label).toBeNull();
  });

  it('lists products in a category', () => {
    expect(productsInCategory(catalog, 'burgers').map((p) => p.id)).toEqual(['b1', 'b2', 'b3']);
    expect(productsInCategory(catalog, 'nope')).toEqual([]);
  });

  it('filters by category and accent-insensitive query', () => {
    expect(filterCatalogProducts(catalog, { categoryId: 'drinks' }).total).toBe(3);
    expect(filterCatalogProducts(catalog, { query: 'pina' }).items.map((p) => p.id)).toEqual(['d4']);
    expect(filterCatalogProducts(catalog, { query: 'clasica' }).items.map((p) => p.id)).toEqual(['b1']);
    // matches description
    expect(filterCatalogProducts(catalog, { query: 'queso' }).items.map((p) => p.id)).toEqual(['b1']);
    // multi-term AND
    expect(filterCatalogProducts(catalog, { query: 'hamburguesa doble' }).total).toBe(1);
    // category + query
    expect(filterCatalogProducts(catalog, { categoryId: 'desserts', query: 'flan' }).total).toBe(1);
    expect(filterCatalogProducts(catalog, { categoryId: 'desserts', query: 'cola' }).total).toBe(0);
  });

  it('paginates with hasMore', () => {
    const first = filterCatalogProducts(catalog, { limit: 4 });
    expect(first.items).toHaveLength(4);
    expect(first.total).toBe(products.length);
    expect(first.hasMore).toBe(true);

    const last = filterCatalogProducts(catalog, { offset: 8, limit: 4 });
    expect(last.items.map((p) => p.id)).toEqual(['s2', 'p1']);
    expect(last.hasMore).toBe(false);

    const exact = filterCatalogProducts(catalog, { offset: 6, limit: 4 });
    expect(exact.hasMore).toBe(false);

    const all = filterCatalogProducts(catalog);
    expect(all.items).toHaveLength(products.length);
    expect(all.hasMore).toBe(false);
  });

  it('classifies category names', () => {
    expect(classifyCategoryName('Bebidas')).toBe('drink');
    expect(classifyCategoryName('Té y Café')).toBe('drink');
    expect(classifyCategoryName('Postres')).toBe('dessert');
    expect(classifyCategoryName('Acompañamientos')).toBe('side');
    expect(classifyCategoryName('Hamburguesas')).toBe('food');
    expect(classifyCategoryName('Aguacate rellenos')).toBe('food');
  });

  it('suggests drinks first when cart has food, only available and not in cart', () => {
    const out = suggestComplementProducts(catalog, ['b1']);
    expect(out.length).toBeGreaterThanOrEqual(3);
    expect(out.length).toBeLessThanOrEqual(6);
    expect(out.every((p) => p.available)).toBe(true);
    expect(out.some((p) => p.id === 'b1')).toBe(false);
    expect(out.some((p) => p.id === 'd3')).toBe(false); // unavailable
    expect(out[0].categoryId === 'drinks' || out[0].categoryId === 'beer').toBe(true);
    // varied: includes a dessert or side too
    expect(out.some((p) => p.categoryId === 'desserts' || p.categoryId === 'sides')).toBe(true);
  });

  it('excludes cart items, declined categories and respects limit', () => {
    const out = suggestComplementProducts(catalog, ['b1', 'd1'], {
      declinedCategoryIds: ['desserts'],
      limit: 3,
    });
    expect(out.some((p) => p.id === 'd1' || p.id === 'b1')).toBe(false);
    expect(out.some((p) => p.categoryId === 'desserts')).toBe(false);
    // drinks already in cart -> no more drink suggestions (only sides remain)
    expect(out.some((p) => p.categoryId === 'drinks' || p.categoryId === 'beer')).toBe(false);
    expect(out.map((p) => p.id)).toEqual(['p1']);

    const limited = suggestComplementProducts(catalog, ['b1'], {
      declinedCategoryIds: ['desserts'],
      limit: 3,
    });
    expect(limited).toHaveLength(3);
    expect(limited.some((p) => p.categoryId === 'desserts')).toBe(false);
  });

  it('clamps limit to 3..6 and handles empty / unknown carts', () => {
    expect(suggestComplementProducts(catalog, ['b1'], { limit: 99 }).length).toBeLessThanOrEqual(6);
    expect(suggestComplementProducts(catalog, ['b1'], { limit: 1 }).length).toBe(3);
    expect(suggestComplementProducts(catalog, [])).toEqual([]);
    expect(suggestComplementProducts(catalog, ['missing'])).toEqual([]);
  });

  it('suggests food when the cart only has drinks', () => {
    const out = suggestComplementProducts(catalog, ['d1']);
    expect(out[0].categoryId).toBe('burgers');
    expect(out.some((p) => p.categoryId === 'drinks')).toBe(false);
  });

  it('returns nothing when every complement category was declined', () => {
    const out = suggestComplementProducts(catalog, ['b1'], {
      declinedCategoryIds: ['drinks', 'beer', 'desserts', 'sides'],
    });
    expect(out).toEqual([]);
  });
});
