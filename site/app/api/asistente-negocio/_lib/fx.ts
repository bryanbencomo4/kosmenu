/**
 * Exchange-rate model shared by the business assistant (read + propose + apply).
 *
 * Mirrors what the panel (Configuración → Tasas y cobros) persists:
 *  - `comercios.moneda`                      primary currency of the menu (e.g. USD)
 *  - `comercios.exchange_rate_value/mode`    rate for the "quoted" currency
 *  - `comercios.exchange_rate_quote_currency` that quoted currency (null = primary)
 *  - `branding_ia.config_negocio.exchange_rates / exchange_rate_modes / checkout_currencies`
 *    per-currency rates when the shop accepts several currencies.
 */

export type ShopFx = {
  /** Primary menu currency (`moneda`). */
  primary: string;
  /** Quoted currency stored on the comercio row (null = none). */
  quote: string | null;
  /** Rate stored on the row for `quote`. */
  value: number | null;
  mode: string | null;
  /** Per-currency rates from config_negocio (plus the row value for `quote`). */
  rates: Record<string, number | null>;
  modes: Record<string, string>;
  /** Currencies the shop accepts at checkout (excluding none → [primary]). */
  currencies: string[];
};

export const CURRENCY_LABEL: Record<string, string> = {
  COP: 'pesos colombianos (COP)',
  VES: 'bolívares (VES)',
  USD: 'dólares (USD)',
  EUR: 'euros (EUR)',
};

export function currencyLabel(code: string): string {
  return CURRENCY_LABEL[code] ?? code;
}

export function normalizeCurrency(raw: unknown): string {
  const code = String(raw ?? '')
    .trim()
    .toUpperCase();
  if (!code || code === 'SIN MONEDA') return '';
  if (code === 'BS' || code === 'BSS' || code === 'VEF') return 'VES';
  return code;
}

function fold(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

/** "5.000" → 5000, "3.200,50" → 3200.5, "42,5" → 42.5, "42.5" → 42.5 */
export function parseLocaleNumber(raw: string): number | null {
  const s = raw.trim().replace(/\s+/g, '');
  if (!/^\d[\d.,]*$/.test(s)) return null;
  const hasDot = s.includes('.');
  const hasComma = s.includes(',');
  let normalized: string;
  if (hasDot && hasComma) {
    const decimalIsComma = s.lastIndexOf(',') > s.lastIndexOf('.');
    normalized = decimalIsComma ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (hasDot) {
    normalized = /^\d{1,3}(\.\d{3})+$/.test(s) ? s.replace(/\./g, '') : s;
  } else if (hasComma) {
    normalized = /^\d{1,3}(,\d{3})+$/.test(s) ? s.replace(/,/g, '') : s.replace(',', '.');
  } else {
    normalized = s;
  }
  const n = Number(normalized);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Last meaningful number in a message ("pon la tasa en 5.000 pesos" → 5000). */
export function extractFxValue(text: string): number | null {
  const matches = [...text.matchAll(/\d[\d.,]*\d|\d/g)].map((m) => m[0]);
  for (let i = matches.length - 1; i >= 0; i--) {
    const n = parseLocaleNumber(matches[i]!);
    if (n != null) return n;
  }
  return null;
}

const CURRENCY_WORDS: Array<{ code: string; re: RegExp }> = [
  { code: 'COP', re: /\b(pesos?|cop|colombian[oa]s?)\b/ },
  { code: 'VES', re: /\b(bolivar(?:es)?|bs\.?|ves|bss)\b/ },
  { code: 'USD', re: /\b(dolar(?:es)?|usd|dollars?)\b|\$/ },
  { code: 'EUR', re: /\b(euros?|eur)\b/ },
];

/**
 * Currency mentioned in the text, preferring the one right after the number and
 * ignoring the primary currency (the rate is always quoted in the *other* one).
 */
export function detectFxCurrency(text: string, primary: string): string | null {
  const t = fold(text);
  const numMatch = t.match(/\d[\d.,]*/);
  if (numMatch && numMatch.index != null) {
    const tail = t.slice(numMatch.index + numMatch[0].length, numMatch.index + numMatch[0].length + 18);
    for (const { code, re } of CURRENCY_WORDS) {
      if (re.test(tail) && code !== primary) return code;
    }
  }
  const found = CURRENCY_WORDS.filter(({ re }) => re.test(t)).map((c) => c.code);
  return found.find((c) => c !== primary) ?? null;
}

export function formatRate(n: number): string {
  return new Intl.NumberFormat('es-VE', { maximumFractionDigits: 4 }).format(n);
}

/** Currencies on which a rate makes sense (everything except the primary one). */
export function rateCurrencies(fx: ShopFx): string[] {
  return fx.currencies.filter((c) => c !== fx.primary);
}

export type FxTarget =
  | { ok: true; currency: string }
  | { ok: false; reason: 'ambiguous' | 'not_enabled' | 'none'; options: string[] };

export function resolveFxTarget(fx: ShopFx, requested: string | null): FxTarget {
  const options = rateCurrencies(fx);
  if (requested) {
    if (requested === fx.primary) return { ok: false, reason: 'none', options };
    if (options.includes(requested) || requested === fx.quote) return { ok: true, currency: requested };
    return { ok: false, reason: 'not_enabled', options };
  }
  if (fx.quote) return { ok: true, currency: fx.quote };
  if (options.length === 1) return { ok: true, currency: options[0]! };
  return { ok: false, reason: options.length ? 'ambiguous' : 'none', options };
}

/** "1 USD = 3.200 COP" (VES menus quoting USD read "1 USD = X VES"). */
export function rateSentence(primary: string, currency: string, value: number): string {
  if (primary === 'VES' && currency === 'USD') return `1 USD = ${formatRate(value)} VES`;
  return `1 ${primary} = ${formatRate(value)} ${currency}`;
}

/** Human summary of the current rates. */
export function describeFx(fx: ShopFx): string {
  const lines = rateCurrencies(fx).map((c) => {
    const rate = fx.rates[c];
    const mode = fx.modes[c] === 'auto' ? 'automática' : fx.modes[c] === 'manual' ? 'manual' : null;
    return `• ${currencyLabel(c)}: ${rate != null ? `*${rateSentence(fx.primary, c, rate)}*` : 'sin tasa cargada'}${mode ? ` (${mode})` : ''}`;
  });
  return lines.length ? lines.join('\n') : `Ahora el menú solo muestra precios en ${fx.primary}.`;
}
