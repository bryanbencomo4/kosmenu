const BILLS: Record<string, number[]> = {
  USD: [1, 5, 10, 20, 50, 100],
  EUR: [1, 5, 10, 20, 50, 100],
  VES: [5, 10, 20, 50, 100, 200, 500],
  COP: [100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000],
};

function currencyCode(currency: string) {
  const code = (currency || 'COP').trim().toUpperCase();
  return code === 'SIN MONEDA' ? 'COP' : code;
}

/** Bills and coins that can actually be handed over. EUR matches USD. */
export function cashBills(currency: string) {
  return BILLS[currencyCode(currency)] ?? BILLS.USD;
}

export function describeCashBills(currency: string) {
  const bills = cashBills(currency);
  if (bills.length === 1) return String(bills[0]);
  return `${bills.slice(0, -1).join(', ')} o ${bills[bills.length - 1]}`;
}

export function currencyAllowsDecimals(currency: string) {
  return currencyCode(currency) !== 'COP';
}

/** Digits only. COP treats "." as a thousands separator; other currencies keep one decimal. */
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

/** True when the amount is a sum of that currency's bills (the smallest bill is the step). */
export function isMakeableCash(amount: number, currency: string) {
  const step = cashBills(currency)[0];
  if (!Number.isFinite(amount) || !step) return false;
  const cents = Math.round(amount * 100);
  const stepCents = Math.round(step * 100);
  return cents > 0 && cents % stepCents === 0;
}

export type CashTenderResult = {
  valid: boolean;
  change: number;
  reason: 'empty' | 'bills' | 'low' | null;
};

/**
 * Valid cash is a sum of real bills, at least the total. Exact payment is allowed.
 * 14.80 USD is rejected; 15 USD (10 + 5) is accepted.
 */
export function cashTenderValidity(amount: number | null, total: number, currency: string): CashTenderResult {
  if (amount == null || !Number.isFinite(amount) || !Number.isFinite(total)) {
    return { valid: false, change: 0, reason: 'empty' };
  }
  if (!isMakeableCash(amount, currency)) {
    return { valid: false, change: 0, reason: 'bills' };
  }
  if (amount < total - 0.0001) {
    return { valid: false, change: 0, reason: 'low' };
  }
  return { valid: true, change: Number((amount - total).toFixed(2)), reason: null };
}

/** Smallest payable amount, then single bills at or above the total. Never the raw total if it is not cash. */
export function suggestCashTenders(total: number, currency: string) {
  const bills = cashBills(currency);
  const step = bills[0];
  const suggestions = new Set<number>();
  if (Number.isFinite(total) && total > 0 && step) {
    const rounded = Math.ceil((total - 0.0001) / step) * step;
    suggestions.add(Number(rounded.toFixed(2)));
  }
  for (const bill of bills) {
    if (bill >= total - 0.0001) suggestions.add(bill);
  }
  return [...suggestions].sort((left, right) => left - right).slice(0, 5);
}
