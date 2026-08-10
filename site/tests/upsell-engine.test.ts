import { describe, expect, it } from 'vitest';

import {
  resolveFreeDeliveryGoal,
  resolveUpsellSuggestions,
  type EngineProduct,
  type EngineRule,
} from '../app/v/[id]/_lib/upsell-engine';

const PIZZA_CAT = 'cat-pizza';
const DRINK_CAT = 'cat-drink';
const SIDE_CAT = 'cat-side';

const products: EngineProduct[] = [
  { id: 'pizza-1', categoria_id: PIZZA_CAT, precio: 10, orden: 0 },
  { id: 'cola', categoria_id: DRINK_CAT, precio: 2, orden: 0 },
  { id: 'sprite', categoria_id: DRINK_CAT, precio: 2.5, orden: 1 },
  { id: 'fries', categoria_id: SIDE_CAT, precio: 3, orden: 0 },
  { id: 'disabled-drink', categoria_id: DRINK_CAT, precio: 2, orden: -1, upsell_enabled: false },
  { id: 'sold-out-drink', categoria_id: DRINK_CAT, precio: 2, orden: -2, disponible: false },
];

function productsMap(list: EngineProduct[] = products) {
  return new Map(list.map((p) => [p.id, p]));
}

function baseSettings() {
  return {
    enabled: true,
    show_add_to_cart: true,
    show_cart: true,
    show_checkout: true,
    max_add_suggestions: 2,
    max_cart_suggestions: 3,
    max_checkout_suggestions: 2,
  };
}

describe('resolveUpsellSuggestions', () => {
  it('returns nothing when there are no rules configured (no fabricated suggestions)', () => {
    const result = resolveUpsellSuggestions({
      settings: baseSettings(),
      rules: [],
      products: productsMap(),
      cart: [{ productId: 'pizza-1', categoryId: PIZZA_CAT, quantity: 1 }],
      cartTotal: 10,
      surface: 'add_to_cart',
      orderType: 'delivery',
      justAddedProductId: 'pizza-1',
    });
    expect(result).toEqual([]);
  });

  it('matches a product -> category rule on add_to_cart and expands the category target', () => {
    const rules: EngineRule[] = [
      {
        id: 'r1',
        enabled: true,
        trigger_type: 'product',
        trigger_product_id: 'pizza-1',
        surface: 'add_to_cart',
        max_suggestions: 2,
        targets: [{ target_type: 'category', category_id: DRINK_CAT, position: 0 }],
      },
    ];
    const result = resolveUpsellSuggestions({
      settings: baseSettings(),
      rules,
      products: productsMap(),
      cart: [{ productId: 'pizza-1', categoryId: PIZZA_CAT, quantity: 1 }],
      cartTotal: 10,
      surface: 'add_to_cart',
      orderType: 'delivery',
      justAddedProductId: 'pizza-1',
    });
    expect(result.map((s) => s.productId)).toEqual(['cola', 'sprite']);
    expect(result.every((s) => s.ruleId === 'r1')).toBe(true);
  });

  it('excludes disabled, sold-out, and already-in-cart products from category targets', () => {
    const rules: EngineRule[] = [
      {
        id: 'r1',
        enabled: true,
        trigger_type: 'product',
        trigger_product_id: 'pizza-1',
        surface: 'add_to_cart',
        max_suggestions: 5,
        targets: [{ target_type: 'category', category_id: DRINK_CAT, position: 0 }],
      },
    ];
    const result = resolveUpsellSuggestions({
      settings: baseSettings(),
      rules,
      products: productsMap(),
      cart: [
        { productId: 'pizza-1', categoryId: PIZZA_CAT, quantity: 1 },
        { productId: 'cola', categoryId: DRINK_CAT, quantity: 1 },
      ],
      cartTotal: 12,
      surface: 'add_to_cart',
      orderType: 'delivery',
      justAddedProductId: 'pizza-1',
    });
    expect(result.map((s) => s.productId)).toEqual(['sprite']);
  });

  it('prefers a specific product rule over a generic category rule for the same candidate', () => {
    const rules: EngineRule[] = [
      {
        id: 'category-rule',
        enabled: true,
        trigger_type: 'category',
        trigger_category_id: PIZZA_CAT,
        surface: 'add_to_cart',
        priority: 'high',
        max_suggestions: 1,
        targets: [{ target_type: 'product', product_id: 'cola', position: 0 }],
      },
      {
        id: 'product-rule',
        enabled: true,
        trigger_type: 'product',
        trigger_product_id: 'pizza-1',
        surface: 'add_to_cart',
        priority: 'low',
        max_suggestions: 1,
        targets: [{ target_type: 'product', product_id: 'cola', position: 0 }],
      },
    ];
    const result = resolveUpsellSuggestions({
      settings: baseSettings(),
      rules,
      products: productsMap(),
      cart: [{ productId: 'pizza-1', categoryId: PIZZA_CAT, quantity: 1 }],
      cartTotal: 10,
      surface: 'add_to_cart',
      orderType: 'delivery',
      justAddedProductId: 'pizza-1',
    });
    expect(result).toEqual([{ productId: 'cola', ruleId: 'product-rule' }]);
  });

  it('respects order_type gating', () => {
    const rules: EngineRule[] = [
      {
        id: 'r1',
        enabled: true,
        trigger_type: 'product',
        trigger_product_id: 'pizza-1',
        surface: 'add_to_cart',
        order_type: 'pickup',
        max_suggestions: 2,
        targets: [{ target_type: 'product', product_id: 'cola', position: 0 }],
      },
    ];
    const delivery = resolveUpsellSuggestions({
      settings: baseSettings(),
      rules,
      products: productsMap(),
      cart: [{ productId: 'pizza-1', categoryId: PIZZA_CAT, quantity: 1 }],
      cartTotal: 10,
      surface: 'add_to_cart',
      orderType: 'delivery',
      justAddedProductId: 'pizza-1',
    });
    expect(delivery).toEqual([]);

    const pickup = resolveUpsellSuggestions({
      settings: baseSettings(),
      rules,
      products: productsMap(),
      cart: [{ productId: 'pizza-1', categoryId: PIZZA_CAT, quantity: 1 }],
      cartTotal: 10,
      surface: 'add_to_cart',
      orderType: 'pickup',
      justAddedProductId: 'pizza-1',
    });
    expect(pickup).toEqual([{ productId: 'cola', ruleId: 'r1' }]);
  });

  it('matches a cart-level trigger (2+ pizzas) regardless of what was just added', () => {
    const rules: EngineRule[] = [
      {
        id: 'r1',
        enabled: true,
        trigger_type: 'cart',
        trigger_category_id: PIZZA_CAT,
        trigger_min_qty: 2,
        surface: 'cart',
        max_suggestions: 1,
        targets: [{ target_type: 'product', product_id: 'fries', position: 0 }],
      },
    ];
    const notEnough = resolveUpsellSuggestions({
      settings: baseSettings(),
      rules,
      products: productsMap(),
      cart: [{ productId: 'pizza-1', categoryId: PIZZA_CAT, quantity: 1 }],
      cartTotal: 10,
      surface: 'cart',
      orderType: 'delivery',
    });
    expect(notEnough).toEqual([]);

    const enough = resolveUpsellSuggestions({
      settings: baseSettings(),
      rules,
      products: productsMap(),
      cart: [{ productId: 'pizza-1', categoryId: PIZZA_CAT, quantity: 2 }],
      cartTotal: 20,
      surface: 'cart',
      orderType: 'delivery',
    });
    expect(enough).toEqual([{ productId: 'fries', ruleId: 'r1' }]);
  });

  it('never suggests a product the customer already dismissed in this session', () => {
    const rules: EngineRule[] = [
      {
        id: 'r1',
        enabled: true,
        trigger_type: 'product',
        trigger_product_id: 'pizza-1',
        surface: 'add_to_cart',
        max_suggestions: 2,
        targets: [{ target_type: 'product', product_id: 'cola', position: 0 }],
      },
    ];
    const result = resolveUpsellSuggestions({
      settings: baseSettings(),
      rules,
      products: productsMap(),
      cart: [{ productId: 'pizza-1', categoryId: PIZZA_CAT, quantity: 1 }],
      cartTotal: 10,
      surface: 'add_to_cart',
      orderType: 'delivery',
      justAddedProductId: 'pizza-1',
      dismissedProductIds: new Set(['cola']),
    });
    expect(result).toEqual([]);
  });

  it('caps suggestions per surface using upsell_settings', () => {
    const rules: EngineRule[] = [
      {
        id: 'r1',
        enabled: true,
        trigger_type: 'product',
        trigger_product_id: 'pizza-1',
        surface: 'add_to_cart',
        max_suggestions: 5,
        targets: [{ target_type: 'category', category_id: DRINK_CAT, position: 0 }],
      },
    ];
    const result = resolveUpsellSuggestions({
      settings: { ...baseSettings(), max_add_suggestions: 1 },
      rules,
      products: productsMap(),
      cart: [{ productId: 'pizza-1', categoryId: PIZZA_CAT, quantity: 1 }],
      cartTotal: 10,
      surface: 'add_to_cart',
      orderType: 'delivery',
      justAddedProductId: 'pizza-1',
    });
    expect(result).toHaveLength(1);
  });

  it('returns nothing when the merchant disabled upselling entirely', () => {
    const rules: EngineRule[] = [
      {
        id: 'r1',
        enabled: true,
        trigger_type: 'product',
        trigger_product_id: 'pizza-1',
        surface: 'add_to_cart',
        max_suggestions: 2,
        targets: [{ target_type: 'product', product_id: 'cola', position: 0 }],
      },
    ];
    const result = resolveUpsellSuggestions({
      settings: { ...baseSettings(), enabled: false },
      rules,
      products: productsMap(),
      cart: [{ productId: 'pizza-1', categoryId: PIZZA_CAT, quantity: 1 }],
      cartTotal: 10,
      surface: 'add_to_cart',
      orderType: 'delivery',
      justAddedProductId: 'pizza-1',
    });
    expect(result).toEqual([]);
  });
});

describe('resolveFreeDeliveryGoal', () => {
  it('is disabled when no threshold is configured', () => {
    const goal = resolveFreeDeliveryGoal({
      subtotal: 20,
      threshold: null,
      orderType: 'delivery',
      applicableOrderTypes: ['delivery'],
    });
    expect(goal.enabled).toBe(false);
  });

  it('is disabled for pickup unless the merchant opted pickup in', () => {
    const goal = resolveFreeDeliveryGoal({
      subtotal: 20,
      threshold: 15,
      orderType: 'pickup',
      applicableOrderTypes: ['delivery'],
    });
    expect(goal.enabled).toBe(false);
  });

  it('reports real progress and unlock state', () => {
    const goal = resolveFreeDeliveryGoal({
      subtotal: 10,
      threshold: 15,
      orderType: 'delivery',
      applicableOrderTypes: ['delivery'],
    });
    expect(goal.enabled).toBe(true);
    expect(goal.unlocked).toBe(false);
    expect(goal.remaining).toBe(5);
    expect(goal.ratio).toBeCloseTo(10 / 15);

    const unlocked = resolveFreeDeliveryGoal({
      subtotal: 16,
      threshold: 15,
      orderType: 'delivery',
      applicableOrderTypes: ['delivery'],
    });
    expect(unlocked.unlocked).toBe(true);
    expect(unlocked.remaining).toBe(0);
  });
});
