export type PublicCheckoutExchangeConfig = {
  currencies: string[];
  exchangeRates: Record<string, number | null>;
  exchangeRateModes: Record<string, string>;
  exchangeRateSources: Record<string, string>;
};

function normalizeCurrencyCode(value: unknown) {
  const code = (value ?? '').toString().trim().toUpperCase();
  if (!code || code === 'SIN MONEDA') return 'COP';
  return code;
}

function parseExchangeRate(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value;
  const raw = (value ?? '').toString().trim().replace(',', '.');
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/** Public-safe checkout exchange settings extracted from branding_ia.config_negocio. */
export function extractPublicCheckoutExchange(
  brandingIa: unknown,
): PublicCheckoutExchangeConfig {
  const branding =
    brandingIa && typeof brandingIa === 'object' ? (brandingIa as Record<string, unknown>) : null;
  const config =
    branding?.config_negocio && typeof branding.config_negocio === 'object'
      ? (branding.config_negocio as Record<string, unknown>)
      : {};

  const currencies = new Set<string>();
  for (const listKey of ['checkout_currencies', 'currencies'] as const) {
    const list = config[listKey];
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      currencies.add(normalizeCurrencyCode(item));
    }
  }

  const exchangeRates: Record<string, number | null> = {};
  const rawRates =
    config.exchange_rates && typeof config.exchange_rates === 'object'
      ? (config.exchange_rates as Record<string, unknown>)
      : {};
  for (const [key, value] of Object.entries(rawRates)) {
    const code = normalizeCurrencyCode(key);
    exchangeRates[code] = parseExchangeRate(value);
    if (code) currencies.add(code);
  }

  const exchangeRateModes: Record<string, string> = {};
  const rawModes =
    config.exchange_rate_modes && typeof config.exchange_rate_modes === 'object'
      ? (config.exchange_rate_modes as Record<string, unknown>)
      : {};
  for (const [key, value] of Object.entries(rawModes)) {
    exchangeRateModes[normalizeCurrencyCode(key)] = (value ?? '').toString().trim().toLowerCase();
  }

  const exchangeRateSources: Record<string, string> = {};
  const rawSources =
    config.exchange_rate_sources && typeof config.exchange_rate_sources === 'object'
      ? (config.exchange_rate_sources as Record<string, unknown>)
      : {};
  for (const [key, value] of Object.entries(rawSources)) {
    exchangeRateSources[normalizeCurrencyCode(key)] = (value ?? '').toString().trim().toLowerCase();
  }

  return {
    currencies: Array.from(currencies),
    exchangeRates,
    exchangeRateModes,
    exchangeRateSources,
  };
}
