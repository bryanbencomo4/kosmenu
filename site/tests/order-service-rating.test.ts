import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import {
  createCustomerRatingKey,
  isRateableOrderStatus,
  normalizeRatingSummary,
} from '../app/api/_lib/order-service-rating';

describe('order service ratings', () => {
  const previousKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  afterEach(() => {
    if (previousKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = previousKey;
  });

  it('allows ratings only for delivered and cancelled terminal orders', () => {
    expect(isRateableOrderStatus('entregado')).toBe(true);
    expect(isRateableOrderStatus('cancelado')).toBe(true);
    expect(isRateableOrderStatus('rechazado')).toBe(true);
    expect(isRateableOrderStatus('en_camino', 'completed')).toBe(true);
    expect(isRateableOrderStatus('en_camino', 'arrived')).toBe(false);
    expect(isRateableOrderStatus('pendiente')).toBe(false);
    expect(isRateableOrderStatus('preparando')).toBe(false);
    expect(isRateableOrderStatus('en_camino')).toBe(false);
  });

  it('normalizes rating aggregates to a finite five-star range', () => {
    expect(normalizeRatingSummary({ average: 4.6, count: 12 })).toEqual({
      average: 4.6,
      count: 12,
    });
    expect(normalizeRatingSummary({ average: 8, count: -2 })).toEqual({
      average: 5,
      count: 0,
    });
    expect(normalizeRatingSummary({ average: 'invalid', count: null })).toEqual({
      average: 0,
      count: 0,
    });
  });

  it('uses a stable HMAC key and never stores the raw phone number', async () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'rating-test-secret';
    const first = await createCustomerRatingKey('+58 412 123 4567');
    const second = await createCustomerRatingKey('0412 123 4567');
    const colombianLocal = await createCustomerRatingKey('300 123 4567');
    const colombianInternational = await createCustomerRatingKey('+57 300 123 4567');

    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(second).toBe(first);
    expect(colombianLocal).toBe(colombianInternational);
    expect(first).not.toContain('584121234567');
    await expect(createCustomerRatingKey('123')).resolves.toBeNull();
  });
});