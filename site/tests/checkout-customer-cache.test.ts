import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  CHECKOUT_CUSTOMER_CACHE_KEY,
  readCachedCheckoutCustomer,
  writeCachedCheckoutCustomer,
} from '../app/_lib/checkout-customer-cache';

describe('checkout customer cache', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('writes and reads last customer fields from localStorage', () => {
    const store = new Map<string, string>();
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => {
          store.set(key, value);
        },
      },
    });

    writeCachedCheckoutCustomer({
      clientName: 'Bryan Jose Bencomo Hernandez',
      clientWhatsapp: '+584220451906',
      clientEmail: 'bjbh415@gmail.com',
      selectedCurrency: 'USD',
    });

    expect(store.has(CHECKOUT_CUSTOMER_CACHE_KEY)).toBe(true);
    const cached = readCachedCheckoutCustomer();
    expect(cached?.clientName).toBe('Bryan Jose Bencomo Hernandez');
    expect(cached?.clientEmail).toBe('bjbh415@gmail.com');
    expect(cached?.clientWhatsapp).toBe('+584220451906');
  });
});
