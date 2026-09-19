import { afterEach, describe, expect, it, vi } from 'vitest';

import { consumeRepeatOrder, writeRepeatOrder } from '../app/_lib/repeat-order';

const memory = new Map<string, string>();
const sessionStorageMock = {
  getItem: (key: string) => memory.get(key) ?? null,
  setItem: (key: string, value: string) => {
    memory.set(key, value);
  },
  removeItem: (key: string) => {
    memory.delete(key);
  },
  clear: () => memory.clear(),
};

describe('repeat order storage', () => {
  afterEach(() => {
    memory.clear();
    vi.unstubAllGlobals();
  });

  it('stores and consumes cart lines for a slug', () => {
    vi.stubGlobal('window', { sessionStorage: sessionStorageMock });
    vi.stubGlobal('sessionStorage', sessionStorageMock);

    writeRepeatOrder('pizzas-el-trueno', {
      items: [
        { productId: 'prod-1', quantity: 2, selection: { tamanoId: 'grande' } },
      ],
      fulfillment: 'takeaway',
    });

    expect(consumeRepeatOrder('pizzas-el-trueno')).toEqual({
      items: [
        {
          productId: 'prod-1',
          quantity: 2,
          selection: { tamanoId: 'grande', servicioAdicional: false },
        },
      ],
      fulfillment: 'takeaway',
    });
    expect(consumeRepeatOrder('pizzas-el-trueno')).toBeNull();
  });
});
