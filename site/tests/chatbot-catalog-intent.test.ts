import { describe, expect, it } from 'vitest';

import { matchCatalogIntent } from '../app/v/[id]/_components/chat/chat-catalog';
import type { ChatCatalogSnapshot } from '../app/v/[id]/_components/chat/chat-catalog';

const catalog: ChatCatalogSnapshot = {
  currency: 'USD',
  categories: [
    { id: 'pz', name: 'Pizzas Clásicas', imageUrl: null, productCount: 3, availableCount: 3 },
    { id: 'bb', name: 'Bebidas', imageUrl: null, productCount: 2, availableCount: 2 },
    { id: 'ps', name: 'Postres', imageUrl: null, productCount: 1, availableCount: 1 },
  ],
  products: [],
};

describe('matchCatalogIntent', () => {
  it('returns null without a catalog or categories', () => {
    expect(matchCatalogIntent('categorías', null)).toBeNull();
    expect(matchCatalogIntent('categorías', { ...catalog, categories: [] })).toBeNull();
  });

  it('maps category/menu phrases to the categories carousel', () => {
    for (const t of [
      'categorías',
      'Categorias?',
      'ver menú',
      'ver el menu',
      '¿Qué hay?',
      'que tienen',
      'mostrar menú',
    ]) {
      expect(matchCatalogIntent(t, catalog)).toEqual({ kind: 'categories' });
    }
  });

  it('resolves keyword categories by normalized name (plural/singular safe)', () => {
    expect(matchCatalogIntent('bebidas', catalog)).toEqual({ kind: 'category', categoryId: 'bb' });
    expect(matchCatalogIntent('quiero ver pizzas', catalog)).toEqual({
      kind: 'category',
      categoryId: 'pz',
    });
    expect(matchCatalogIntent('¿qué hay de postres?', catalog)).toEqual({
      kind: 'category',
      categoryId: 'ps',
    });
  });

  it('falls back to the categories carousel / null when the keyword has no category', () => {
    // No "hamburguesas" category but "qué hay" still lists categories.
    expect(matchCatalogIntent('qué hay de hamburguesas', catalog)).toEqual({ kind: 'categories' });
    expect(matchCatalogIntent('hamburguesas', catalog)).toBeNull();
  });

  it('lets free-form / long messages reach the assistant', () => {
    expect(matchCatalogIntent('hola', catalog)).toBeNull();
    expect(
      matchCatalogIntent(
        'quiero ver el menú pero que me recomiendes algo para cuatro personas sin cebolla',
        catalog,
      ),
    ).toBeNull();
  });
});
