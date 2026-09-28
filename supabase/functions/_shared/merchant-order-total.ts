export function resolveMerchantOrderTotalLabel(input: {
  baseTotal: unknown;
  checkoutTotal: unknown;
  baseCurrency: unknown;
  checkoutCurrency: unknown;
  exchangeRate: unknown;
}): string {
  const baseTotal = parseAmount(input.baseTotal);
  const checkoutTotal = parseAmount(input.checkoutTotal);
  const baseCurrency = normalizeCurrency(input.baseCurrency);
  const checkoutCurrency = normalizeCurrency(input.checkoutCurrency, baseCurrency);
  const exchangeRate = parseAmount(input.exchangeRate);

  let amount = checkoutTotal ?? baseTotal;
  if (baseTotal !== null && baseCurrency !== checkoutCurrency && exchangeRate !== null) {
    amount = baseTotal * exchangeRate;
  }
  if (amount === null) return '—';

  const rounded = amount.toFixed(2);
  switch (checkoutCurrency) {
    case 'USD':
      return `US$ ${rounded}`;
    case 'VES':
      return `Bs. ${rounded}`;
    case 'EUR':
      return `€ ${rounded}`;
    default:
      return `${checkoutCurrency} ${rounded}`.trim();
  }
}

function parseAmount(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const amount = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(amount) ? amount : null;
}

function normalizeCurrency(value: unknown, fallback = 'COP') {
  const currency = (value ?? '').toString().trim().toUpperCase();
  return !currency || currency === 'SIN MONEDA' ? fallback : currency;
}
