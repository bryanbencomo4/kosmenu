/** Pure money helpers for admin metrics (safe to unit-test; no secrets). */

export type AdminMoney = {
  currency: string;
  amount: number;
  baseAmount: number;
  baseCurrency: string;
  exchangeRate: number | null;
  /** Approximate USD when checkout currency + rate (or base USD) allow it. */
  usdEstimate: number | null;
};

export type CurrencyBucket = {
  currency: string;
  amount: number;
  count: number;
};

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

export function toFiniteNumber(value: unknown): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value.replace(/,/g, '').trim());
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

export function toFiniteNumberOrNull(value: unknown): number | null {
  if (value == null || value === '') {
    return null;
  }
  const parsed = toFiniteNumber(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function normalizeCurrencyCode(value: unknown, fallback = 'USD'): string {
  const raw = (typeof value === 'string' ? value : String(value ?? ''))
    .trim()
    .toUpperCase();

  if (!raw) {
    return fallback;
  }

  if (raw === 'BS' || raw === 'BSS' || raw === 'BOLIVARES' || raw === 'BOLÍVARES') {
    return 'VES';
  }
  if (raw === 'US$' || raw === 'DOLAR' || raw === 'DOLARES' || raw === 'DÓLAR' || raw === 'DÓLARES') {
    return 'USD';
  }
  if (raw === 'PESOS' || raw === 'COLOMBIANOS') {
    return 'COP';
  }

  return raw.slice(0, 8);
}

const moneyFormatters = new Map<string, Intl.NumberFormat>();

function formatterFor(currency: string) {
  const code = normalizeCurrencyCode(currency);
  const cached = moneyFormatters.get(code);
  if (cached) {
    return cached;
  }

  const fractionDigits = code === 'USD' ? 2 : code === 'COP' || code === 'VES' ? 0 : 2;

  try {
    const formatter = new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: code,
      maximumFractionDigits: fractionDigits,
      minimumFractionDigits: code === 'USD' ? 2 : 0,
    });
    moneyFormatters.set(code, formatter);
    return formatter;
  } catch {
    const fallback = new Intl.NumberFormat('es-CO', {
      maximumFractionDigits: fractionDigits,
    });
    moneyFormatters.set(code, fallback);
    return fallback;
  }
}

export function formatAdminMoney(amount: number, currency: string): string {
  const code = normalizeCurrencyCode(currency);
  const formatter = formatterFor(code);
  try {
    return formatter.format(amount);
  } catch {
    return `${amount.toLocaleString('es-CO')} ${code}`;
  }
}

export type AdminUsdRateTable = Partial<Record<string, number>>;

/**
 * `tasa_cambio_snapshot` means "checkout units per 1 base unit"
 * (see convertFromBaseCurrency). It is NOT always "per 1 USD".
 * When base === checkout the rate is stored as 1 (identity) and must never
 * be treated as a USD FX rate.
 *
 * `unitsPerUsd` is a fallback table of "units of currency per 1 USD"
 * (market/business rates) for native COP/VES checkouts.
 */
function estimateUsd(params: {
  currency: string;
  amount: number;
  baseCurrency: string;
  baseAmount: number;
  exchangeRate: number | null;
  unitsPerUsd?: AdminUsdRateTable | null;
}): number | null {
  // Checkout already settled in USD.
  if (params.currency === 'USD') {
    return params.amount;
  }

  // Menu priced in USD: baseAmount is the authoritative USD total.
  // Reject polluted rows where base was copied as the same number as checkout.
  if (
    params.baseCurrency === 'USD' &&
    params.baseAmount > 0 &&
    Math.abs(params.baseAmount - params.amount) > 0.01
  ) {
    return params.baseAmount;
  }

  // Only invert the snapshot rate when base is USD (rate = checkout per 1 USD).
  // Skip identity rate (1): that just means "same currency as base", not FX.
  if (
    params.baseCurrency === 'USD' &&
    params.currency !== 'USD' &&
    params.exchangeRate != null &&
    params.exchangeRate > 0 &&
    params.exchangeRate !== 1 &&
    params.amount > 0
  ) {
    return params.amount / params.exchangeRate;
  }

  // Fallback: convert native checkout with market/business units-per-USD.
  const perUsd = params.unitsPerUsd?.[params.currency];
  if (
    params.currency !== 'USD' &&
    params.amount > 0 &&
    perUsd != null &&
    Number.isFinite(perUsd) &&
    perUsd > 1
  ) {
    return params.amount / perUsd;
  }

  // Same fallback for base amount when checkout currency lacked a rate but base did.
  if (
    params.baseCurrency !== 'USD' &&
    params.baseCurrency !== params.currency &&
    params.baseAmount > 0
  ) {
    const basePerUsd = params.unitsPerUsd?.[params.baseCurrency];
    if (basePerUsd != null && Number.isFinite(basePerUsd) && basePerUsd > 1) {
      return params.baseAmount / basePerUsd;
    }
  }

  return null;
}

function resolveBaseCurrency(params: {
  detalles: Record<string, unknown>;
  checkoutCurrency: string;
  hasCheckout: boolean;
  exchangeRate: number | null;
}): string {
  const rawBase = params.detalles.moneda_base ?? params.detalles.moneda;
  if (rawBase != null && String(rawBase).trim() !== '') {
    return normalizeCurrencyCode(rawBase);
  }

  // Legacy rows without moneda_base: identity rate ⇒ base matches checkout.
  if (
    params.hasCheckout &&
    (params.exchangeRate == null || params.exchangeRate === 1)
  ) {
    return params.checkoutCurrency;
  }

  // Historical multi-currency checkouts were usually converted from a USD menu.
  return 'USD';
}

export function extractOrderMoney(
  row: {
    total?: number | string | null;
    detalles?: unknown;
  },
  options?: {
    unitsPerUsd?: AdminUsdRateTable | null;
  },
): AdminMoney {
  const detalles = asRecord(row.detalles);
  const baseAmount = toFiniteNumber(
    detalles.total != null ? detalles.total : row.total,
  );

  const checkoutCurrencyRaw = detalles.moneda_checkout;
  const checkoutTotalRaw = detalles.total_moneda_checkout;
  const hasCheckout =
    checkoutCurrencyRaw != null &&
    String(checkoutCurrencyRaw).trim() !== '' &&
    checkoutTotalRaw != null &&
    String(checkoutTotalRaw).trim() !== '';

  const exchangeRate = toFiniteNumberOrNull(detalles.tasa_cambio_snapshot);
  const currency = hasCheckout
    ? normalizeCurrencyCode(checkoutCurrencyRaw, 'USD')
    : normalizeCurrencyCode(detalles.moneda_base ?? detalles.moneda ?? 'USD');
  const amount = hasCheckout ? toFiniteNumber(checkoutTotalRaw) : baseAmount;
  const baseCurrency = resolveBaseCurrency({
    detalles,
    checkoutCurrency: currency,
    hasCheckout,
    exchangeRate,
  });

  return {
    currency,
    amount,
    baseAmount,
    baseCurrency,
    exchangeRate,
    usdEstimate: estimateUsd({
      currency,
      amount,
      baseCurrency,
      baseAmount,
      exchangeRate,
      unitsPerUsd: options?.unitsPerUsd,
    }),
  };
}

export function aggregateMoneyByCurrency(items: readonly AdminMoney[]): CurrencyBucket[] {
  const map = new Map<string, CurrencyBucket>();

  for (const item of items) {
    const currency = normalizeCurrencyCode(item.currency);
    const current = map.get(currency) ?? { currency, amount: 0, count: 0 };
    current.amount += item.amount;
    current.count += 1;
    map.set(currency, current);
  }

  const priority = (code: string) => {
    if (code === 'USD') return 0;
    if (code === 'EUR') return 1;
    if (code === 'COP') return 2;
    if (code === 'VES') return 3;
    return 10;
  };

  return [...map.values()].sort(
    (left, right) =>
      priority(left.currency) - priority(right.currency) ||
      right.amount - left.amount,
  );
}

export function formatMoneyBreakdown(
  items: readonly AdminMoney[],
  options?: { separator?: string },
): string {
  const buckets = aggregateMoneyByCurrency(items);
  if (buckets.length === 0) {
    return formatAdminMoney(0, 'USD');
  }
  const separator = options?.separator ?? '\n';
  return buckets
    .map((bucket) => formatAdminMoney(bucket.amount, bucket.currency))
    .join(separator);
}

export function formatAverageTicketBreakdown(
  items: readonly AdminMoney[],
  options?: { separator?: string },
): string {
  const buckets = aggregateMoneyByCurrency(items);
  if (buckets.length === 0) {
    return '—';
  }
  const separator = options?.separator ?? '\n';
  return buckets
    .map((bucket) =>
      formatAdminMoney(bucket.count > 0 ? bucket.amount / bucket.count : 0, bucket.currency),
    )
    .join(separator);
}

export function sumUsdEstimates(items: readonly AdminMoney[]): {
  total: number;
  coveredCount: number;
  missingCount: number;
} {
  let total = 0;
  let coveredCount = 0;
  let missingCount = 0;

  for (const item of items) {
    if (item.usdEstimate != null && Number.isFinite(item.usdEstimate)) {
      total += item.usdEstimate;
      coveredCount += 1;
    } else {
      missingCount += 1;
    }
  }

  return { total, coveredCount, missingCount };
}
