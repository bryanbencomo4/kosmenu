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

export function currencyPrefix(currency: string) {
  const code = currencyCode(currency);
  if (code === 'VES') return 'Bs';
  if (code === 'COP') return '$';
  if (code === 'USD') return 'US$';
  if (code === 'EUR') return '€';
  return code;
}

/** Next makeable cash amount at or above `amount` (bill step). */
export function snapCashAmountUp(amount: number, currency: string) {
  const step = cashBills(currency)[0];
  if (!Number.isFinite(amount) || amount <= 0 || !step) return amount;
  const snapped = Math.ceil((amount - 0.0001) / step) * step;
  return Number(snapped.toFixed(2));
}

/** Canonical string for a makeable cash amount (for controlled input state). */
export function toCashAmountCanonical(amount: number, currency: string) {
  if (!Number.isFinite(amount) || amount <= 0) return '';
  const decimals = currencyAllowsDecimals(currency) ? 2 : 0;
  return parseCashAmountInput(amount.toFixed(decimals), currency);
}

/**
 * Normalize typed/pasted cash text to a canonical numeric string ("15000", "14.80").
 * Supports LATAM (1.234,56) and US (1,234.56) separators.
 */
export function parseCashAmountInput(raw: string, currency: string) {
  const allowDecimals = currencyAllowsDecimals(currency);
  const cleaned = raw.replace(/[^\d.,]/g, '');
  if (!cleaned) return '';

  const lastComma = cleaned.lastIndexOf(',');
  const lastDot = cleaned.lastIndexOf('.');

  let normalized: string;
  if (lastComma > lastDot) {
    // 32.370,00 or 32370,50
    normalized = cleaned.replace(/\./g, '').replace(',', '.');
  } else if (lastDot > lastComma) {
    const fraction = cleaned.slice(lastDot + 1);
    if (!allowDecimals) {
      normalized = cleaned.replace(/[.,]/g, '');
    } else if (fraction.length === 3 && lastComma < 0 && cleaned.indexOf('.') === lastDot) {
      // 32.370 → thousands (LATAM) when no decimal comma
      normalized = cleaned.replace(/\./g, '');
    } else {
      // 14.80 or 1,234.56
      normalized = cleaned.replace(/,/g, '');
    }
  } else if (lastComma >= 0) {
    normalized = cleaned.replace(',', '.');
  } else {
    normalized = cleaned;
  }

  if (!allowDecimals) {
    return normalized.replace(/\./g, '').replace(/^0+(?=\d)/, '');
  }

  const trailingDot = normalized.endsWith('.');
  const [integerPart = '', ...fractionParts] = normalized.split('.');
  const safeInteger = integerPart.replace(/^0+(?=\d)/, '') || (normalized.includes('.') ? '0' : '');
  const fraction = fractionParts.join('').slice(0, 2);
  if (fraction.length > 0) return `${safeInteger}.${fraction}`;
  if (trailingDot) return `${safeInteger}.`;
  return safeInteger;
}

export function parseCashAmount(raw: string, currency: string) {
  const canonical = parseCashAmountInput(raw, currency);
  if (!canonical) return null;
  const parsed = Number(canonical.endsWith('.') ? canonical.slice(0, -1) : canonical);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Locale number for the cash input (no currency symbol — prefix is separate). */
export function formatCashAmountInputValue(canonical: string, currency: string) {
  if (!canonical) return '';
  const allowDecimals = currencyAllowsDecimals(currency);
  const code = currencyCode(currency);
  const locale = code === 'VES' ? 'es-VE' : 'es-CO';
  const trailingDot = allowDecimals && canonical.endsWith('.');
  const [intPart, frac = ''] = canonical.split('.');
  const intNum = Number(intPart || '0');
  if (!Number.isFinite(intNum)) return canonical;

  const intFormatted = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(intNum);
  if (!allowDecimals) return intFormatted;

  const decimalSep = locale === 'es-VE' || locale === 'es-CO' ? ',' : '.';
  if (trailingDot) return `${intFormatted}${decimalSep}`;
  if (canonical.includes('.')) return `${intFormatted}${decimalSep}${frac.slice(0, 2)}`;
  return intFormatted;
}

/** Placeholder / chip helper: locale number without currency symbol. */
export function formatCashAmountDisplay(value: number, currency: string) {
  if (!Number.isFinite(value)) return '';
  const code = currencyCode(currency);
  const locale = code === 'VES' ? 'es-VE' : 'es-CO';
  if (!currencyAllowsDecimals(currency)) {
    return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(value);
  }
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
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
