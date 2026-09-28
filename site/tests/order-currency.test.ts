import { describe, expect, it } from 'vitest';

import { convertOrderAmount, normalizeOrderCurrency } from '../app/api/_lib/order-currency';

describe('order currency conversion', () => {
  it('converts COP base amounts to checkout currency using quote units per base unit', () => {
    expect(convertOrderAmount(28_000, 'COP', 'USD', 0.00030701705909587157)).toBeCloseTo(8.5964776547);
  });

  it('does not convert when the checkout currency is the base currency', () => {
    expect(convertOrderAmount(28_000, 'COP', 'COP', 0.000307)).toBe(28_000);
  });

  it('returns null when a cross-currency rate is unavailable', () => {
    expect(convertOrderAmount(28_000, 'COP', 'USD', null)).toBeNull();
  });

  it('normalizes missing and legacy no-currency values', () => {
    expect(normalizeOrderCurrency(' sin moneda ')).toBe('COP');
    expect(normalizeOrderCurrency('', 'USD')).toBe('USD');
  });
});