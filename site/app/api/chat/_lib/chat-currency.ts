/**
 * Menu currency helpers for the chatbot (display + FX via checkout rates).
 * Defaults to COP to match the public menu — never invent USD.
 */
import {
  convertAmountBetweenCurrencies,
  normalizeCurrencyCode,
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
