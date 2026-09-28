export function normalizeOrderCurrency(value: unknown, fallback = 'COP') {
  const code = (value ?? '').toString().trim().toUpperCase();
  return !code || code === 'SIN MONEDA' ? fallback : code;
}

export function convertOrderAmount(
  amountInBaseCurrency: number,
  baseCurrency: string,
  targetCurrency: string,
  exchangeRate: number | null | undefined,
) {
  const amount = Number.isFinite(amountInBaseCurrency) ? amountInBaseCurrency : 0;
  const base = normalizeOrderCurrency(baseCurrency);
  const target = normalizeOrderCurrency(targetCurrency, base);
  if (base === target) return amount;

  const rate = Number(exchangeRate);
  if (!Number.isFinite(rate) || rate <= 0) return null;
  return amount * rate;
}