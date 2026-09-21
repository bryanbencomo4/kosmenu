import { describe, expect, it } from 'vitest';

import {
  checkoutAttemptFingerprint,
  createCheckoutIdempotencyKey,
  humanizeOrderSubmitError,
  resolveCheckoutAttempt,
} from '../app/v/[id]/_lib/checkout-idempotency';

describe('checkout idempotency attempt', () => {
  it('keeps the same key while the order intent stays the same', () => {
    const fingerprint = checkoutAttemptFingerprint({
      comercioId: 'c1',
      customerName: 'Ana',
      customerWhatsapp: '+584121234567',
      customerEmail: 'ana@test.com',
      currency: 'USD',
      paymentMethodId: 'cash',
      paymentReferenceLast4: '',
      notes: '',
      deliveryMode: 'pickup',
      totalCents: 2399,
      items: [{ nombre: 'Burger', cantidad: 2, precio: 11.995 }],
    });
    const first = resolveCheckoutAttempt(null, fingerprint);
    const retry = resolveCheckoutAttempt(first, fingerprint);
    expect(retry.key).toBe(first.key);
  });

  it('issues a new key when the customer starts a different order', () => {
    const first = resolveCheckoutAttempt(null, 'order-a');
    const second = resolveCheckoutAttempt(first, 'order-b');
    expect(second.key).not.toBe(first.key);
  });

  it('creates keys the API accepts', () => {
    expect(createCheckoutIdempotencyKey()).toMatch(/^[A-Za-z0-9._:-]{8,128}$/);
  });

  it('does not show the raw idempotency conflict code', () => {
    expect(humanizeOrderSubmitError('idempotency_key_reuse_with_different_payload')).toMatch(
      /Pulsa otra vez/i,
    );
  });
});
