export type MarketRatesInput = {
  bcv_rate?: number | string | null;
  p2p_binance_rate?: number | string | null;
  payload?: {
    google_rates?: Record<string, number | string | null> | null;
    bcv_rates?: {
      USD?: number | string | null;
      EUR?: number | string | null;
    } | null;
  } | null;
};

/**
 * Relative commercial adjustment on top of an automatic source ("Tasa automatica con ajuste").
 * `factor` multiplies the live source rate: effective = source * factor.
 * Stored per quote currency in `branding_ia.config_negocio.exchange_rate_adjustments`.
 * Mode stays `auto`; the derived mode `automatic_adjusted` only exists when the
 * adjustment is enabled and has a valid factor, so legacy readers keep working.
 */
export type ExchangeRateAdjustment = {
  enabled: boolean;
  factor: number | null;
  referenceValue: number | null;
  /** true => reference reads "1 quote = X base"; false => "1 base = X quote". */
  referenceInverted: boolean;
};

export type ExchangeRateConfig = {
  mode?: string | null;
  adjustment?: ExchangeRateAdjustment | null;
};

export const EXCHANGE_MODE_AUTOMATIC_ADJUSTED = 'automatic_adjusted';

export type CheckoutExchangeConfigInput = {
  exchangeRates: Record<string, number | null>;
  exchangeRateModes: Record<string, string>;
  exchangeRateSources: Record<string, string>;
  exchangeRateAdjustments?: Record<string, ExchangeRateAdjustment>;
};

export function normalizeCurrencyCode(value: string | null | undefined) {
  const code = (value ?? '').trim().toUpperCase();
  if (!code || code === 'SIN MONEDA') return 'COP';
  return code;
}

export function parseExchangeRate(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value;
  const raw = (value ?? '').toString().trim().replace(',', '.');
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function positiveNumberOrNull(value: unknown) {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/** Reads one persisted adjustment (snake_case JSON). Returns null when absent or malformed. */
export function parseExchangeRateAdjustment(raw: unknown): ExchangeRateAdjustment | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  return {
    enabled: record.enabled === true,
    factor: positiveNumberOrNull(record.factor),
    referenceValue: positiveNumberOrNull(record.reference_value),
    referenceInverted: record.reference_inverted === true,
  };
}

export function isExchangeRateAdjustmentActive(adjustment: ExchangeRateAdjustment | null | undefined) {
  return Boolean(adjustment && adjustment.enabled && adjustment.factor != null && adjustment.factor > 0);
}

/** factor = commercialRate / sourceRate. Null when either rate is not a positive number. */
export function computeAdjustmentFactor(commercialRate: number, sourceRate: number) {
  const commercial = positiveNumberOrNull(commercialRate);
  const source = positiveNumberOrNull(sourceRate);
  if (commercial == null || source == null) return null;
  return commercial / source;
}

/**
 * Single entry point that turns an automatic/manual source rate into the rate used for
 * conversions. Manual rates and non-adjusted automatic rates are returned untouched.
 * No rounding is applied here.
 */
export function resolveEffectiveExchangeRate(
  config: ExchangeRateConfig | null | undefined,
  sourceRate: number,
) {
  if (!Number.isFinite(sourceRate) || sourceRate <= 0) return 0;
  const mode = (config?.mode ?? '').toString().trim().toLowerCase();
  if (mode === 'manual') return sourceRate;
  if (isExchangeRateAdjustmentActive(config?.adjustment)) {
    return sourceRate * (config!.adjustment!.factor as number);
  }
  return sourceRate;
}

const ADJUSTABLE_SOURCES = new Set(['bcv', 'bcv_usd', 'bcv_eur', 'p2p_binance']);

function pairKey(baseCurrency: string, quoteCurrency: string) {
  return `${normalizeCurrencyCode(baseCurrency)}/${normalizeCurrencyCode(quoteCurrency)}`;
}

function googleRatesFromPayload(payload: MarketRatesInput['payload']) {
  const rates = new Map<string, number>();
  const rawRates = payload?.google_rates;
  if (!rawRates) return rates;

  for (const [key, value] of Object.entries(rawRates)) {
    const parsed = parseExchangeRate(value);
    if (parsed) rates.set(key.trim().toUpperCase(), parsed);
  }

  return rates;
}

function googleRateForPair(
  baseCurrency: string,
  quoteCurrency: string,
  anchors: Map<string, number>,
) {
  const base = normalizeCurrencyCode(baseCurrency);
  const quote = normalizeCurrencyCode(quoteCurrency);
  if (base === quote) return 1;

  const directRate = anchors.get(pairKey(base, quote)) ?? 0;
  if (directRate > 0) return directRate;

  const usdCop = anchors.get('USD/COP') ?? 0;
  const usdEur = anchors.get('USD/EUR') ?? 0;
  const vesUsd = anchors.get('VES/USD') ?? 0;

  if (base === 'USD' && quote === 'VES' && vesUsd > 0) return 1 / vesUsd;
  if (base === 'VES' && quote === 'USD' && vesUsd > 0) return vesUsd;
  if (base === 'COP' && quote === 'USD' && usdCop > 0) return 1 / usdCop;
  if (base === 'EUR' && quote === 'USD' && usdEur > 0) return 1 / usdEur;
  if (base === 'USD' && quote === 'COP' && usdCop > 0) return usdCop;
  if (base === 'USD' && quote === 'EUR' && usdEur > 0) return usdEur;
  if (base === 'VES' && quote === 'COP' && vesUsd > 0 && usdCop > 0) return vesUsd * usdCop;
  if (base === 'VES' && quote === 'EUR' && vesUsd > 0 && usdEur > 0) return vesUsd * usdEur;
  if (base === 'COP' && quote === 'VES' && vesUsd > 0 && usdCop > 0) {
    const vesCop = vesUsd * usdCop;
    return vesCop > 0 ? 1 / vesCop : 0;
  }
  if (base === 'EUR' && quote === 'VES' && vesUsd > 0 && usdEur > 0) {
    const vesEur = vesUsd * usdEur;
    return vesEur > 0 ? 1 / vesEur : 0;
  }
  if (base === 'COP' && quote === 'EUR' && usdCop > 0 && usdEur > 0) return usdEur / usdCop;
  if (base === 'EUR' && quote === 'COP' && usdCop > 0 && usdEur > 0) return usdCop / usdEur;

  return 0;
}

function isTrackedVesPair(baseCurrency: string, quoteCurrency: string) {
  const base = normalizeCurrencyCode(baseCurrency);
  const quote = normalizeCurrencyCode(quoteCurrency);
  const direct = quote === 'VES' && (base === 'USD' || base === 'EUR' || base === 'COP');
  const reverse = base === 'VES' && (quote === 'USD' || quote === 'EUR' || quote === 'COP');
  return direct || reverse;
}

function isBcvExchangeSource(source: string) {
  const normalized = (source ?? '').trim().toLowerCase();
  return normalized === 'bcv' || normalized === 'bcv_usd' || normalized === 'bcv_eur';
}

function canonicalizeBcvSource(source: string) {
  const normalized = (source ?? '').trim().toLowerCase();
  if (normalized === 'bcv_eur') return 'bcv_eur';
  if (normalized === 'bcv' || normalized === 'bcv_usd') return 'bcv_usd';
  return normalized;
}

function bcvVesRateForSource(
  source: string,
  marketRates: MarketRatesInput | null | undefined,
) {
  const rates = marketRates?.payload?.bcv_rates;
  const usdRate = parseExchangeRate(rates?.USD) ?? parseExchangeRate(marketRates?.bcv_rate) ?? 0;
  const eurRate = parseExchangeRate(rates?.EUR) ?? 0;
  if (canonicalizeBcvSource(source) === 'bcv_eur') {
    return eurRate > 0 ? eurRate : usdRate;
  }
  return usdRate;
}

function adjustedP2pRateForBuyer(rate: number) {
  return rate > 0 ? rate * 1.006 : 0;
}

function usdToCurrencyRateForSource(
  source: string,
  currency: string,
  marketRates: MarketRatesInput | null | undefined,
) {
  const normalizedCurrency = normalizeCurrencyCode(currency);
  if (normalizedCurrency === 'USD') return 1;

  const googleRates = googleRatesFromPayload(marketRates?.payload ?? null);
  if (normalizedCurrency === 'VES') {
    let liveRate = source === 'p2p_binance'
      ? adjustedP2pRateForBuyer(parseExchangeRate(marketRates?.p2p_binance_rate) ?? 0)
      : bcvVesRateForSource(source, marketRates);
    if (canonicalizeBcvSource(source) === 'bcv_eur') {
      liveRate *= googleRates.get('USD/EUR') ?? 0;
    }
    if (liveRate > 0) return liveRate;
    return (googleRates.get('VES/USD') ?? 0) > 0 ? 1 / (googleRates.get('VES/USD') ?? 0) : 0;
  }
  if (normalizedCurrency === 'COP') return googleRates.get('USD/COP') ?? 0;
  if (normalizedCurrency === 'EUR') return googleRates.get('USD/EUR') ?? 0;
  return 0;
}

export function derivedExchangeRateForCurrency(
  baseCurrency: string,
  quoteCurrency: string,
  source: string,
  marketRates: MarketRatesInput | null | undefined,
  configuredRate?: number | null,
  configuredQuoteCurrency?: string | null,
) {
  const base = normalizeCurrencyCode(baseCurrency);
  const quote = normalizeCurrencyCode(quoteCurrency);
  if (base === quote) return 1;

  if (
    configuredRate &&
    configuredRate > 0 &&
    quote === normalizeCurrencyCode(configuredQuoteCurrency ?? '')
  ) {
    return configuredRate;
  }

  if (source === 'google') {
    const rate = googleRateForPair(base, quote, googleRatesFromPayload(marketRates?.payload ?? null));
    if (rate > 0) return rate;
  }

  if (
    (isBcvExchangeSource(source) || source === 'p2p_binance' || source === 'google') &&
    isTrackedVesPair(base, quote)
  ) {
    const usdToBase = usdToCurrencyRateForSource(source, base, marketRates);
    const usdToQuote = usdToCurrencyRateForSource(source, quote, marketRates);
    if (usdToBase > 0 && usdToQuote > 0) {
      const derived = usdToQuote / usdToBase;
      if (derived > 0) return derived;
    }
  }

  const googleFallback = googleRateForPair(
    base,
    quote,
    googleRatesFromPayload(marketRates?.payload ?? null),
  );
  if (googleFallback > 0) return googleFallback;

  return 1;
}

export function exchangeSourceLabel(source: string | null | undefined) {
  switch ((source ?? '').trim().toLowerCase()) {
    case 'bcv_eur':
      return 'BCV EUR';
    case 'bcv':
    case 'bcv_usd':
      return 'BCV USD';
    case 'p2p_binance':
      return 'Binance P2P';
    case 'google':
      return 'Google Finance';
    case 'manual':
      return 'Manual';
    default:
      return 'Referencia del negocio';
  }
}

export function resolveCheckoutCurrencyRate(
  currency: string,
  options: {
    baseCurrency: string;
    paymentExchangeRate?: number | null;
    checkoutExchange: CheckoutExchangeConfigInput;
    businessExchangeRate?: number | null;
    businessQuoteCurrency?: string | null;
    businessExchangeSource?: string;
    businessExchangeMode?: string;
    marketRates?: MarketRatesInput | null;
  },
) {
  const quote = normalizeCurrencyCode(currency);
  const base = normalizeCurrencyCode(options.baseCurrency);
  if (quote === base) return 1;

  const currencyMode = (
    options.checkoutExchange.exchangeRateModes[quote] ??
    options.businessExchangeMode ??
    'auto'
  )
    .trim()
    .toLowerCase();
  const currencySource = (
    options.checkoutExchange.exchangeRateSources[quote] ??
    options.businessExchangeSource ??
    'google'
  )
    .trim()
    .toLowerCase();
  const snapshotRate = options.checkoutExchange.exchangeRates[quote];

  if (currencyMode === 'auto' || currencyMode === EXCHANGE_MODE_AUTOMATIC_ADJUSTED) {
    const liveRate = derivedExchangeRateForCurrency(
      base,
      quote,
      currencySource,
      options.marketRates,
      null,
      null,
    );
    if (liveRate > 0 && liveRate !== 1) {
      return resolveEffectiveExchangeRate(
        {
          mode: 'auto',
          adjustment: ADJUSTABLE_SOURCES.has(currencySource)
            ? options.checkoutExchange.exchangeRateAdjustments?.[quote]
            : null,
        },
        liveRate,
      );
    }
  }

  if (currencyMode === 'manual' && snapshotRate && snapshotRate > 0) {
    return snapshotRate;
  }

  if (snapshotRate && snapshotRate > 0 && snapshotRate !== 1) {
    return snapshotRate;
  }

  if (
    options.businessExchangeRate &&
    options.businessExchangeRate > 0 &&
    options.businessExchangeRate !== 1 &&
    quote === normalizeCurrencyCode(options.businessQuoteCurrency ?? '')
  ) {
    return options.businessExchangeRate;
  }

  if (options.paymentExchangeRate && options.paymentExchangeRate > 0 && options.paymentExchangeRate !== 1) {
    return options.paymentExchangeRate;
  }

  return derivedExchangeRateForCurrency(
    base,
    quote,
    currencySource,
    options.marketRates,
    options.businessExchangeRate,
    options.businessQuoteCurrency,
  );
}

export function resolveCheckoutCurrencySource(
  currency: string,
  options: {
    checkoutExchange: CheckoutExchangeConfigInput;
    businessExchangeSource?: string;
  },
) {
  const quote = normalizeCurrencyCode(currency);
  return (
    options.checkoutExchange.exchangeRateSources[quote] ??
    options.businessExchangeSource ??
    'google'
  )
    .trim()
    .toLowerCase();
}

export type ConvertAmountOptions = {
  baseCurrency: string;
  paymentExchangeRate?: number | null;
  checkoutExchange: CheckoutExchangeConfigInput;
  businessExchangeRate?: number | null;
  businessQuoteCurrency?: string | null;
  businessExchangeSource?: string;
  businessExchangeMode?: string;
  marketRates?: MarketRatesInput | null;
};

/**
 * Converts `amount` from `fromCurrency` into `toCurrency`.
 * Rates from `resolveCheckoutCurrencyRate` are quote units per 1 base unit.
 */
export function convertAmountBetweenCurrencies(
  amount: number,
  fromCurrency: string,
  toCurrency: string,
  options: ConvertAmountOptions,
) {
  const safeAmount = Number.isFinite(amount) ? amount : 0;
  const from = normalizeCurrencyCode(fromCurrency);
  const to = normalizeCurrencyCode(toCurrency);
  if (from === to) return safeAmount;

  const toBase = (value: number, currency: string) => {
    const code = normalizeCurrencyCode(currency);
    const base = normalizeCurrencyCode(options.baseCurrency);
    if (code === base) return value;
    const rate = resolveCheckoutCurrencyRate(code, options);
    if (!Number.isFinite(rate) || rate <= 0) return value;
    return value / rate;
  };

  const fromBase = (valueInBase: number, currency: string) => {
    const code = normalizeCurrencyCode(currency);
    const base = normalizeCurrencyCode(options.baseCurrency);
    if (code === base) return valueInBase;
    const rate = resolveCheckoutCurrencyRate(code, options);
    if (!Number.isFinite(rate) || rate <= 0) return valueInBase;
    return valueInBase * rate;
  };

  return fromBase(toBase(safeAmount, from), to);
}
