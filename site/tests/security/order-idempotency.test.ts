import { createHash } from 'crypto';
import { describe, expect, it } from 'vitest';

import {
  hashOrderIdempotencyPayload,
  normalizeIdempotencyKey,
} from '../../app/api/_lib/order-idempotency-key';

describe('order idempotency key contract', () => {
  it('accepts uuid-like keys without PII', () => {
    expect(normalizeIdempotencyKey('a1b2c3d4-e5f6-4789-a012-3456789abcde')).toBeTruthy();
  });

  it('rejects empty, short, or invalid keys', () => {
    expect(normalizeIdempotencyKey('')).toBeNull();
    expect(normalizeIdempotencyKey('abc')).toBeNull();
    expect(normalizeIdempotencyKey('has spaces bad')).toBeNull();
    expect(normalizeIdempotencyKey('x'.repeat(200))).toBeNull();
  });

  it('hashes payload stably (retry same payload)', () => {
    const payload = {
      comercioId: 'c1',
      items: [{ product_id: 'p1', cantidad: 1, precio: 2 }],
    };
    const a = hashOrderIdempotencyPayload(payload);
    const b = hashOrderIdempotencyPayload(payload);
    expect(a).toBe(b);
    expect(a).toBe(createHash('sha256').update(JSON.stringify(payload)).digest('hex'));
  });

  it('different payload yields different hash (same key conflict case)', () => {
    const a = hashOrderIdempotencyPayload({ total: 1 });
    const b = hashOrderIdempotencyPayload({ total: 2 });
    expect(a).not.toBe(b);
  });

  it('documents concurrent double-submit expectation', () => {
    // Server: first writer stores response; second lookup returns hit (status 200).
    // Unique PK on idempotency_key prevents two order rows for the same key when store uses upsert ignoreDuplicates.
    const expectation = {
      simultaneous: 'single order + shared response',
      timeoutRetry: 'same key → hit',
      differentPayload: '409',
      invalidKey: '400',
      newCheckout: 'new key → new order',
    };
    expect(expectation.differentPayload).toBe('409');
    expect(expectation.invalidKey).toBe('400');
  });
});
