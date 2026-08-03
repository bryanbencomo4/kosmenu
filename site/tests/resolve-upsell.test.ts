import { describe, expect, it } from 'vitest';

import { resolveUpsell } from '../app/v/[id]/_lib/resolve-upsell';

const categories = [
  { id: 'c1', nombre: 'Pizzas' },
  { id: 'c2', nombre: 'Bebidas' },
];

const products = [
  {
    id: 'p1',
    categoria_id: 'c1',
    nombre: 'Margarita',
    precio: 10,
    upsell_badge: 'mas_pedido',
    precio_comparacion: 12,
  },
  {
    id: 'p2',
    categoria_id: 'c2',
    nombre: 'Cola',
    precio: 2,
  },
  {
    id: 'p3',
    categoria_id: 'c1',
    nombre: 'Hawaiana',
    precio: 11,
  },
];

describe('resolveUpsell', () => {
  it('uses heuristics in auto/null mode', () => {
    const resolved = resolveUpsell({
      config: null,
      categories,
      products,
    });
    expect(resolved.mode).toBe('auto');
    expect(resolved.showDemoLabel).toBe(true);
    expect(resolved.comboItems.length).toBeGreaterThan(0);
    expect(resolved.showDeliveryProgress).toBe(true);
  });

  it('hides upsell when mode is off', () => {
    const resolved = resolveUpsell({
      config: { mode: 'off' },
      categories,
      products,
    });
    expect(resolved.mode).toBe('off');
    expect(resolved.comboItems).toEqual([]);
    expect(resolved.crossSellItems).toEqual([]);
    expect(resolved.showProductNudges).toBe(false);
    expect(resolved.showDeliveryProgress).toBe(false);
  });

  it('uses configured product ids in custom mode', () => {
    const resolved = resolveUpsell({
      config: {
        mode: 'custom',
        combo_product_ids: ['p1', 'p3'],
        cross_sell_product_ids: ['p2'],
        free_delivery_threshold: 20,
        show_product_nudges: false,
      },
      categories,
      products,
    });
    expect(resolved.mode).toBe('custom');
    expect(resolved.showDemoLabel).toBe(false);
    expect(resolved.comboItems.map((item) => item.product.id)).toEqual(['p1', 'p3']);
    expect(resolved.comboItems[0]?.badge).toBe('mas_pedido');
    expect(resolved.comboItems[0]?.compareAtPrice).toBe(12);
    expect(resolved.crossSellItems.map((item) => item.product.id)).toEqual(['p2']);
    expect(resolved.freeDeliveryThreshold).toBe(20);
    expect(resolved.showProductNudges).toBe(false);
  });
});
