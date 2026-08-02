import { describe, expect, it } from 'vitest';

import {
  buildComboRail,
  buildCrossSellItems,
  freeDeliveryProgress,
  productImageUrl,
} from '../app/v/[id]/_lib/upsell-heuristics';

describe('upsell heuristics', () => {
  it('ignores commerce logo urls as product images', () => {
    const logo = 'https://x/logos-comercios/a.png';
    expect(productImageUrl(logo, logo)).toBeNull();
    expect(productImageUrl('https://x/products/pizza.png', logo)).toBe('https://x/products/pizza.png');
  });

  it('builds combo rail from combo categories with demo compare-at prices', () => {
    const items = buildComboRail(
      [
        { id: 'c1', nombre: 'Pizzas' },
        { id: 'c2', nombre: 'Combos' },
      ],
      [
        { id: 'p1', categoria_id: 'c2', nombre: 'Combo Napolitano', precio: 18.9, imagen_url: 'https://cdn/combo.png' },
        { id: 'p2', categoria_id: 'c1', nombre: 'Margarita', precio: 9 },
      ],
    );
    expect(items[0]?.product.nombre).toBe('Combo Napolitano');
    expect(items[0]?.compareAtPrice).toBeGreaterThan(18.9);
    expect(items[0]?.badgeLabel).toBeTruthy();
  });

  it('prefers drinks/sides for cross-sell', () => {
    const items = buildCrossSellItems(
      [
        { id: 'c1', nombre: 'Pizzas' },
        { id: 'c2', nombre: 'Bebidas' },
      ],
      [
        { id: 'p1', categoria_id: 'c1', nombre: 'Pizza', precio: 10 },
        { id: 'p2', categoria_id: 'c2', nombre: 'Cola', precio: 2 },
      ],
    );
    expect(items.some((item) => item.product.id === 'p2')).toBe(true);
  });

  it('computes free delivery demo progress', () => {
    expect(freeDeliveryProgress(5).remaining).toBe(10);
    expect(freeDeliveryProgress(15).unlocked).toBe(true);
  });
});
