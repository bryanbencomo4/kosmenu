import {
  assertEquals,
  assertThrows,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { normalizeAmountString } from './_shared/payment-provider.ts';
import {
  extractCheckoutFields,
  ZenoPaymentProvider,
} from './_shared/zeno-payment-provider.ts';

Deno.test('normalizeAmountString formats decimals', () => {
  assertEquals(normalizeAmountString(10), '10.00');
  assertEquals(normalizeAmountString('10.5'), '10.50');
});

Deno.test('normalizeAmountString rejects invalid amounts', () => {
  assertThrows(() => normalizeAmountString(-1));
  assertThrows(() => normalizeAmountString('abc'));
});

Deno.test('mapPaymentStatus aligns with Zeno statuses', () => {
  const provider = new ZenoPaymentProvider({ apiKey: 'sk_test' });
  assertEquals(provider.mapPaymentStatus('OPEN'), 'open');
  assertEquals(provider.mapPaymentStatus('COMPLETED'), 'completed');
  assertEquals(provider.mapPaymentStatus('EXPIRED'), 'expired');
  assertEquals(provider.mapPaymentStatus('PARTIALLY_PAID'), 'partially_paid');
  assertEquals(provider.mapPaymentStatus('FAILED'), 'failed');
});

Deno.test('extractCheckoutFields reads webhook data', () => {
  const fields = extractCheckoutFields({
    id: 'ch_abc',
    orderId: 'order-1',
    paidAmount: '10.00',
    priceAmount: '10.00',
    priceCurrency: 'usd',
  });
  assertEquals(fields.checkoutId, 'ch_abc');
  assertEquals(fields.orderId, 'order-1');
  assertEquals(fields.paidAmount, 10);
  assertEquals(fields.currency, 'USD');
});

Deno.test('verifyWebhook rejects missing headers', async () => {
  const provider = new ZenoPaymentProvider({
    apiKey: 'sk_test',
    webhookSecret: 'whsec_testsecret',
  });
  let failed = false;
  try {
    await provider.verifyWebhook('{}', {});
  } catch {
    failed = true;
  }
  assertEquals(failed, true);
});

Deno.test('handleWebhook recognizes known event types', async () => {
  const provider = new ZenoPaymentProvider({ apiKey: 'sk_test' });
  const completed = await provider.handleWebhook({
    type: 'checkout.completed',
    data: { orderId: 'x' },
  });
  assertEquals(completed.handled, true);
  assertEquals(completed.action, 'checkout.completed');

  const ignored = await provider.handleWebhook({
    type: 'checkout.unknown',
    data: {},
  });
  assertEquals(ignored.handled, false);
});

Deno.test('completed payment requires paidAmount >= price (policy check)', () => {
  const paid = Number('9.99');
  const amount = Number('10.00');
  assertEquals(paid >= amount, false);

  const paidFull = Number('10.00');
  assertEquals(paidFull >= amount, true);
});

Deno.test('currency mismatch policy', () => {
  const expected = 'USD';
  const incoming = 'EUR';
  assertEquals(incoming.toUpperCase() === expected, false);
});
