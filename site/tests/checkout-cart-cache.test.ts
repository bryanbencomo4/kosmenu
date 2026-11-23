import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  CHECKOUT_CART_CACHE_PREFIX,
  clearCachedCheckoutCart,
  readCachedCheckoutCart,
  writeCachedCheckoutCart,
} from '../app/_lib/checkout-cart-cache';

describe('checkout cart cache', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function stubStorage() {
    const store = new Map<string, string>();
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => {
          store.set(key, value);
        },
        removeItem: (key: string) => {
          store.delete(key);
        },
      },
    });
    return store;
  }

  it('writes and reads last incomplete cart per commerce', () => {
    const store = stubStorage();
    writeCachedCheckoutCart('demo-cafe', {
      items: [
        { productId: 'prod-1', quantity: 2, selection: { tamanoId: 'grande' } },
      ],
      fulfillment: 'dine_in',
    });

    expect(store.has(`${CHECKOUT_CART_CACHE_PREFIX}demo-cafe`)).toBe(true);
    const cached = readCachedCheckoutCart('demo-cafe');
    expect(cached?.items).toHaveLength(1);
    expect(cached?.items[0]?.productId).toBe('prod-1');
    expect(cached?.items[0]?.quantity).toBe(2);
    expect(cached?.fulfillment).toBe('dine_in');
  });

  it('clears cart cache after completed order', () => {
    const store = stubStorage();
    writeCachedCheckoutCart('demo-cafe', {
      items: [{ productId: 'prod-1', quantity: 1, selection: {} }],
    });
    clearCachedCheckoutCart('demo-cafe');
    expect(readCachedCheckoutCart('demo-cafe')).toBeNull();
    expect(store.has(`${CHECKOUT_CART_CACHE_PREFIX}demo-cafe`)).toBe(false);
  });
});
