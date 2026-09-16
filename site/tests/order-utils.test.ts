import { describe, expect, it } from 'vitest';

import {
  extractComercioId,
  formatOrderDisplayId,
  isLegacyOrderId,
  isOrderDisplayId,
} from '../app/api/_lib/order-utils';

describe('formatOrderDisplayId', () => {
  it('formats sequential platform order ids', () => {
    expect(formatOrderDisplayId(1)).toBe('EMXFA-000001');
    expect(formatOrderDisplayId(42)).toBe('EMXFA-000042');
    expect(formatOrderDisplayId(999999)).toBe('EMXFA-999999');
  });

  it('recognizes EMXFA display ids', () => {
    expect(isOrderDisplayId('EMXFA-000001')).toBe(true);
    expect(isOrderDisplayId('BITE-482917')).toBe(false);
  });
});

describe('extractComercioId', () => {
  it('extracts comercio id from legacy order ids', () => {
    expect(
      extractComercioId('550e8400-e29b-41d4-a716-446655440000-1728596400000'),
    ).toBe('550e8400-e29b-41d4-a716-446655440000');
  });

  it('returns null for EMXFA display ids', () => {
    expect(extractComercioId('EMXFA-000001')).toBeNull();
    expect(isLegacyOrderId('EMXFA-000001')).toBe(false);
  });
});
