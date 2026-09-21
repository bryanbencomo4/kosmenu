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

export type CheckoutExchangeConfigInput = {
  exchangeRates: Record<string, number | null>;
  exchangeRateModes: Record<string, string>;
  exchangeRateSources: Record<string, string>;
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
  const direct = quote === 'VES' && (base === 'USD' || base === 'EUR');
  const reverse = base === 'VES' && (quote === 'USD' || quote === 'EUR');
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
    const liveRate =
      source === 'p2p_binance'
        ? adjustedP2pRateForBuyer(parseExchangeRate(marketRates?.p2p_binance_rate) ?? 0)
        : parseExchangeRate(marketRates?.bcv_rate) ?? 0;
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

  if (isBcvExchangeSource(source) && (quote === 'VES' || base === 'VES')) {
    const vesRate = bcvVesRateForSource(source, marketRates);
    if (vesRate > 0) {
      if (quote === 'VES') return vesRate;
      return 1 / vesRate;
    }
  }

  if ((source === 'p2p_binance' || source === 'google') && isTrackedVesPair(base, quote)) {
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

  if (currencyMode === 'auto') {
    const liveRate = derivedExchangeRateForCurrency(
      base,
      quote,
      currencySource,
      options.marketRates,
      null,
      null,
    );
    if (liveRate > 0 && liveRate !== 1) {
      return liveRate;
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
