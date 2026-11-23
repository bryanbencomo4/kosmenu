/**
 * Menu currency helpers for the chatbot (display + FX via checkout rates).
 * Defaults to COP to match the public menu — never invent USD.
 */
import {
  convertAmountBetweenCurrencies,
  normalizeCurrencyCode,
  resolveCheckoutCurrencyRate,
} from '../../../_lib/checkout-exchange-rate';
import type { LoadedPublicMenu } from '../../menu/_lib/load-public-menu';

const DEFAULT_MENU_CURRENCY = 'COP';

export function resolveMenuCurrency(
  menu: LoadedPublicMenu | null | undefined,
): string {
  const raw = (menu?.comercio as { moneda?: string | null } | undefined)?.moneda;
  const code = normalizeCurrencyCode(raw || DEFAULT_MENU_CURRENCY);
  return code || DEFAULT_MENU_CURRENCY;
}

/** Pretty money for chat bubbles / tool payloads (es-CO). */
export function formatChatMoney(
  amount: number,
  currency: string | null | undefined,
): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  const code = normalizeCurrencyCode(currency || DEFAULT_MENU_CURRENCY) || DEFAULT_MENU_CURRENCY;
  if (code === 'VES') {
    const formatted = new Intl.NumberFormat('es-VE', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(safe);
    return `Bs ${formatted}`;
  }
  try {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: code,
      maximumFractionDigits: code === 'COP' || code === 'JPY' ? 0 : 2,
    }).format(safe);
  } catch {
    const rounded =
      code === 'COP' || code === 'JPY'
        ? Math.round(safe)
        : Math.round(safe * 100) / 100;
    return `${rounded} ${code}`;
  }
}

function readBusinessExchange(menu: LoadedPublicMenu) {
  const c = menu.comercio as Record<string, unknown>;
  return {
    businessExchangeRate: Number(c.exchange_rate_value) || null,
    businessQuoteCurrency: (c.exchange_rate_quote_currency as string) || null,
    businessExchangeSource: String(c.exchange_rate_source || 'manual'),
    businessExchangeMode: String(c.exchange_rate_mode || 'auto'),
  };
}

export function listCheckoutCurrencies(menu: LoadedPublicMenu): string[] {
  const base = resolveMenuCurrency(menu);
  const fromConfig = (menu.checkoutExchange?.currencies || [])
    .map((c) => normalizeCurrencyCode(c))
    .filter(Boolean);
  const set = new Set<string>([base, ...fromConfig]);
  return [...set];
}

export type ConvertMenuPriceResult =
  | {
      ok: true;
      amount_menu: number;
      currency_menu: string;
      amount_target: number;
      currency_target: string;
      label_menu: string;
      label_target: string;
      note: string;
    }
  | {
      ok: false;
      error: string;
      currency_menu: string;
      available_currencies: string[];
    };

/**
 * Convert a menu-currency amount into another checkout currency using
 * the same rates as the public checkout (never invent FX).
 */
export function convertMenuPrice(
  menu: LoadedPublicMenu,
  amountInMenuCurrency: number,
  targetCurrency: string,
): ConvertMenuPriceResult {
  const menuCurrency = resolveMenuCurrency(menu);
  const target = normalizeCurrencyCode(targetCurrency);
  const available = listCheckoutCurrencies(menu);

  if (!target) {
    return {
      ok: false,
      error: 'Moneda destino inválida.',
      currency_menu: menuCurrency,
      available_currencies: available,
    };
  }

  if (target === menuCurrency) {
    return {
      ok: true,
      amount_menu: amountInMenuCurrency,
      currency_menu: menuCurrency,
      amount_target: amountInMenuCurrency,
      currency_target: target,
      label_menu: formatChatMoney(amountInMenuCurrency, menuCurrency),
      label_target: formatChatMoney(amountInMenuCurrency, target),
      note: 'Misma moneda del menú.',
    };
  }

  const fx = readBusinessExchange(menu);
  const converted = convertAmountBetweenCurrencies(
    amountInMenuCurrency,
    menuCurrency,
    target,
    {
      baseCurrency: menuCurrency,
      checkoutExchange: menu.checkoutExchange,
      businessExchangeRate: fx.businessExchangeRate,
      businessQuoteCurrency: fx.businessQuoteCurrency,
      businessExchangeSource: fx.businessExchangeSource,
      businessExchangeMode: fx.businessExchangeMode,
      marketRates: menu.marketRates as never,
    },
  );

  if (!Number.isFinite(converted) || converted < 0) {
    return {
      ok: false,
      error: `No hay tasa de cambio verificable hacia ${target}.`,
      currency_menu: menuCurrency,
      available_currencies: available,
    };
  }

  return {
    ok: true,
    amount_menu: amountInMenuCurrency,
    currency_menu: menuCurrency,
    amount_target: converted,
    currency_target: target,
    label_menu: formatChatMoney(amountInMenuCurrency, menuCurrency),
    label_target: formatChatMoney(converted, target),
    note: available.includes(target)
      ? 'Conversión con la tasa del checkout del menú (referencial; el checkout confirma).'
      : 'Conversión referencial; confirma en el checkout si esa moneda está habilitada para pago.',
  };
}

export type DescribeExchangeRateResult =
  | {
      ok: true;
      currency_menu: string;
      quote_currency: string;
      rate: number;
      rate_label: string;
      source: string | null;
      mode: string | null;
      accepted_currencies: string[];
      amount_from?: number;
      amount_from_label?: string;
      amount_to?: number;
      amount_to_label?: string;
      note: string;
    }
  | {
      ok: false;
      error: string;
      currency_menu: string;
      accepted_currencies: string[];
    };

/**
 * Describe the restaurant's configured FX for chat answers.
 * Never invents a public market rate outside checkout config.
 */
export function describeBusinessExchangeRate(
  menu: LoadedPublicMenu,
  args: {
    quoteCurrency?: string;
    amount?: number;
    fromCurrency?: string;
  } = {},
): DescribeExchangeRateResult {
  const menuCurrency = resolveMenuCurrency(menu);
  const accepted = listCheckoutCurrencies(menu);
  const fx = readBusinessExchange(menu);
  const quoteRaw =
    args.quoteCurrency ||
    (menuCurrency === 'COP' ? 'USD' : menuCurrency === 'USD' ? 'COP' : 'USD');
  const quote = normalizeCurrencyCode(quoteRaw) || 'USD';

  if (quote === menuCurrency) {
    return {
      ok: true,
      currency_menu: menuCurrency,
      quote_currency: quote,
      rate: 1,
      rate_label: `1 ${menuCurrency} = 1 ${quote}`,
      source: null,
      mode: null,
      accepted_currencies: accepted,
      note: 'Misma moneda del menú; no hay conversión.',
    };
  }

  const rate = resolveCheckoutCurrencyRate(quote, {
    baseCurrency: menuCurrency,
    checkoutExchange: menu.checkoutExchange || {
      currencies: accepted,
      exchangeRates: {},
      exchangeRateModes: {},
      exchangeRateSources: {},
      exchangeRateAdjustments: {},
    },
    businessExchangeRate: fx.businessExchangeRate,
    businessQuoteCurrency: fx.businessQuoteCurrency,
    businessExchangeSource: fx.businessExchangeSource,
    businessExchangeMode: fx.businessExchangeMode,
    marketRates: menu.marketRates as never,
  });

  if (!Number.isFinite(rate) || rate <= 0) {
    return {
      ok: false,
      error: `No hay una tasa verificable de ${menuCurrency} a ${quote} configurada para este restaurante.`,
      currency_menu: menuCurrency,
      accepted_currencies: accepted,
    };
  }

  const source =
    menu.checkoutExchange?.exchangeRateSources?.[quote] ||
    fx.businessExchangeSource ||
    null;
  const mode =
    menu.checkoutExchange?.exchangeRateModes?.[quote] ||
    fx.businessExchangeMode ||
    null;

  const fxOpts = {
    baseCurrency: menuCurrency,
    checkoutExchange: menu.checkoutExchange || {
      currencies: accepted,
      exchangeRates: {},
      exchangeRateModes: {},
      exchangeRateSources: {},
      exchangeRateAdjustments: {},
    },
    businessExchangeRate: fx.businessExchangeRate,
    businessQuoteCurrency: fx.businessQuoteCurrency,
    businessExchangeSource: fx.businessExchangeSource,
    businessExchangeMode: fx.businessExchangeMode,
    marketRates: menu.marketRates as never,
  };

  // Prefer the direction whose right-hand amount is ≥ 1 so labels stay readable:
  // - USD menu / COP quote → "1 USD = $3.200 COP"
  // - COP menu / USD quote → "1 USD = $4.000 COP" (not "1 COP = US$0,00")
  const oneMenuInQuote = convertAmountBetweenCurrencies(
    1,
    menuCurrency,
    quote,
    fxOpts,
  );
  const oneQuoteInMenu = convertAmountBetweenCurrencies(
    1,
    quote,
    menuCurrency,
    fxOpts,
  );
  let rateLabel = `1 ${menuCurrency} = ${rate} ${quote}`;
  if (
    Number.isFinite(oneQuoteInMenu) &&
    oneQuoteInMenu >= 1 &&
    !(Number.isFinite(oneMenuInQuote) && oneMenuInQuote >= 1 && oneMenuInQuote >= oneQuoteInMenu)
  ) {
    rateLabel = `1 ${quote} = ${formatChatMoney(oneQuoteInMenu, menuCurrency)}`;
  } else if (Number.isFinite(oneMenuInQuote) && oneMenuInQuote >= 1) {
    rateLabel = `1 ${menuCurrency} = ${formatChatMoney(oneMenuInQuote, quote)}`;
  } else if (Number.isFinite(oneQuoteInMenu) && oneQuoteInMenu > 0) {
    rateLabel = `1 ${quote} = ${formatChatMoney(oneQuoteInMenu, menuCurrency)}`;
  }

  const result: Extract<DescribeExchangeRateResult, { ok: true }> = {
    ok: true,
    currency_menu: menuCurrency,
    quote_currency: quote,
    rate,
    rate_label: rateLabel,
    source,
    mode,
    accepted_currencies: accepted,
    note:
      'Tasa del checkout de este restaurante (referencial). El checkout confirma al pagar.',
  };

  const amount = Number(args.amount);
  if (Number.isFinite(amount) && amount > 0) {
    const from = normalizeCurrencyCode(args.fromCurrency || quote) || quote;
    const to = from === menuCurrency ? quote : menuCurrency;
    const converted = convertAmountBetweenCurrencies(amount, from, to, fxOpts);
    if (Number.isFinite(converted) && converted >= 0) {
      result.amount_from = amount;
      result.amount_from_label = formatChatMoney(amount, from);
      result.amount_to = converted;
      result.amount_to_label = formatChatMoney(converted, to);
    }
  }

  return result;
}
