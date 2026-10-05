const COP_LIKE = new Set(['COP', 'SIN MONEDA']);

const BILLS: Record<string, number[]> = {
  USD: [1, 5, 10, 20, 50, 100],
  VES: [20, 50, 100, 200, 500, 1000, 2000],
  COP: [1000, 2000, 5000, 10000, 20000, 50000, 100000],
};

export function currencyAllowsDecimals(currency: string) {
  return !COP_LIKE.has((currency || '').trim().toUpperCase());
}

/** Digits only; decimals only for USD/VES, never a second separator. */
export function parseCashAmountInput(raw: string, currency: string) {
  const allowDecimals = currencyAllowsDecimals(currency);
  const cleaned = raw.replace(/[^\d.,]/g, '').replace(',', '.');
  if (!cleaned) return '';
  if (!allowDecimals) {
    return cleaned.replace(/\./g, '').replace(/^0+(?=\d)/, '');
  }
  const [integerPart = '', ...fractionParts] = cleaned.split('.');
  const safeInteger = integerPart.replace(/^0+(?=\d)/, '') || (cleaned.includes('.') ? '0' : '');
  const fraction = fractionParts.join('').slice(0, 2);
  return fraction.length > 0 || cleaned.endsWith('.') ? `${safeInteger}.${fraction}` : safeInteger;
}

export function parseCashAmount(raw: string, currency: string) {
  const parsed = Number(parseCashAmountInput(raw, currency));
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Cash tender is valid when it is a possible bill/coin amount at least equal to the total.
 * Exact payment is allowed (change 0).
 */
export function cashTenderValidity(amount: number | null, total: number) {
  if (amount == null || !Number.isFinite(amount) || !Number.isFinite(total) || amount < total - 0.0001) {
    return { valid: false, change: 0 };
  }
  return { valid: true, change: Number((amount - total).toFixed(2)) };
}

export function suggestCashTenders(total: number, currency: string) {
  const code = (currency || 'COP').trim().toUpperCase();
  const bills = BILLS[code] ?? BILLS.COP;
  const suggestions = new Set<number>();
  if (Number.isFinite(total) && total > 0) suggestions.add(Number(total.toFixed(2)));
  for (const bill of bills) {
    if (bill >= total - 0.0001) suggestions.add(bill);
  }
  return [...suggestions].sort((left, right) => left - right).slice(0, 5);
}
