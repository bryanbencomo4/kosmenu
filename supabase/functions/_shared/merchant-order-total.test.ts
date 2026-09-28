import { resolveMerchantOrderTotalLabel } from './merchant-order-total.ts';

Deno.test('merchant WhatsApp converts a USD base total to COP checkout currency', () => {
  const label = resolveMerchantOrderTotalLabel({
    baseTotal: 31.2,
    checkoutTotal: 31.2,
    baseCurrency: 'USD',
    checkoutCurrency: 'COP',
    exchangeRate: 3334.2819,
  });

  if (label !== 'COP 104029.60') {
    throw new Error(`Expected converted COP total, received: ${label}`);
  }
});

Deno.test('merchant WhatsApp converts a COP base total to USD checkout currency', () => {
  const label = resolveMerchantOrderTotalLabel({
    baseTotal: 28000,
    checkoutTotal: 28000,
    baseCurrency: 'COP',
    checkoutCurrency: 'USD',
    exchangeRate: 0.00030701705909587157,
  });

  if (label !== 'US$ 8.60') {
    throw new Error(`Expected converted USD total, received: ${label}`);
  }
});

Deno.test('merchant WhatsApp keeps the base amount when currencies match', () => {
  const label = resolveMerchantOrderTotalLabel({
    baseTotal: 31.2,
    checkoutTotal: 31.2,
    baseCurrency: 'USD',
    checkoutCurrency: 'USD',
    exchangeRate: 1,
  });

  if (label !== 'US$ 31.20') {
    throw new Error(`Expected unchanged USD total, received: ${label}`);
  }
});
