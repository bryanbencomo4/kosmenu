import 'server-only';

import { getAdminSupabaseClient } from './admin-supabase';

/** Units of a currency per 1 USD (e.g. COP≈4200, VES≈BCV). */
export type UnitsPerUsd = Partial<Record<string, number>>;

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function positiveRate(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 1) {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value.replace(/,/g, '').trim());
    if (Number.isFinite(parsed) && parsed > 1) return parsed;
  }
  return null;
}

function putRate(target: UnitsPerUsd, code: string, value: unknown) {
  const rate = positiveRate(value);
  if (rate == null) return;
  target[code] = rate;
}

/**
 * Latest marketplace reference rates used to approximate ≈USD when an order
 * was paid in native COP/VES without a USD menu bridge.
 */
export async function loadAdminMarketUnitsPerUsd(): Promise<UnitsPerUsd> {
  const supabase = getAdminSupabaseClient();
  const out: UnitsPerUsd = {};

  try {
    const { data, error } = await supabase
      .from('global_market_rates')
      .select('bcv_rate, p2p_binance_rate, payload')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) return out;

    const row = data as {
      bcv_rate?: number | string | null;
      p2p_binance_rate?: number | string | null;
      payload?: unknown;
    };
    const payload = asRecord(row.payload);
    const googleRates = asRecord(payload.google_rates);
    const bcvRates = asRecord(payload.bcv_rates);

    putRate(out, 'COP', googleRates['USD/COP']);
    putRate(out, 'EUR', googleRates['USD/EUR']);

    // BCV / P2P are VES per 1 USD.
    putRate(out, 'VES', bcvRates.USD ?? row.bcv_rate);
    if (out.VES == null) {
      putRate(out, 'VES', row.p2p_binance_rate);
    }

    // Google sometimes stores VES/USD (USD per 1 VES) — invert if tiny.
    const vesUsd = positiveRate(googleRates['VES/USD']);
    if (out.VES == null && vesUsd != null && vesUsd < 1) {
      out.VES = 1 / vesUsd;
    }
  } catch (error) {
    console.warn(
      '[admin-usd-rates] market rates unavailable',
      error instanceof Error ? error.message : error,
    );
  }

  return out;
}

/**
 * Per-business commercial rates (preferred over market when present).
 */
export async function loadAdminBusinessUnitsPerUsd(
  businessIds: string[],
): Promise<Map<string, UnitsPerUsd>> {
  const unique = [...new Set(businessIds.map((id) => id.trim()).filter(Boolean))];
  const result = new Map<string, UnitsPerUsd>();
  if (unique.length === 0) return result;

  const supabase = getAdminSupabaseClient();

  try {
    const { data, error } = await supabase
      .from('comercios')
      .select(
        'id,moneda,exchange_rate_value,exchange_rate_quote_currency,tasa_cambio_pesos,branding_ia',
      )
      .in('id', unique.slice(0, 500));

    if (error) {
      console.warn('[admin-usd-rates] business rates unavailable', error.message);
      return result;
    }

    for (const raw of (data ?? []) as Array<{
      id?: string | null;
      moneda?: string | null;
      exchange_rate_value?: number | string | null;
      exchange_rate_quote_currency?: string | null;
      tasa_cambio_pesos?: number | string | null;
      branding_ia?: unknown;
    }>) {
      const id = (raw.id ?? '').trim();
      if (!id) continue;

      const units: UnitsPerUsd = {};
      const moneda = (raw.moneda ?? '').trim().toUpperCase();
      const quote = (raw.exchange_rate_quote_currency ?? '').trim().toUpperCase();
      const branding = asRecord(raw.branding_ia);
      const config = asRecord(branding.config_negocio);
      const configuredRates = asRecord(config.exchange_rates);

      putRate(units, 'COP', raw.tasa_cambio_pesos);
      putRate(units, 'COP', config.tasa_cambio_pesos);
      putRate(units, 'COP', configuredRates.COP);

      // exchange_rate_value is typically "quote units per 1 business base",
      // but for VES menus quoting USD it is VES per 1 USD.
      const exchangeValue =
        positiveRate(raw.exchange_rate_value) ??
        positiveRate(config.exchange_rate_value);

      if (exchangeValue != null) {
        if (quote === 'USD' || (!quote && moneda === 'VES')) {
          putRate(units, moneda || 'VES', exchangeValue);
        } else if (moneda === 'USD' && quote) {
          putRate(units, quote, exchangeValue);
        } else if (moneda === 'VES') {
          putRate(units, 'VES', exchangeValue);
        }
      }

      putRate(units, 'VES', configuredRates.VES);
      putRate(units, 'EUR', configuredRates.EUR);

      if (Object.keys(units).length > 0) {
        result.set(id, units);
      }
    }
  } catch (error) {
    console.warn(
      '[admin-usd-rates] business rates unavailable',
      error instanceof Error ? error.message : error,
    );
  }

  return result;
}

export function mergeUnitsPerUsd(
  ...tables: Array<UnitsPerUsd | null | undefined>
): UnitsPerUsd {
  const out: UnitsPerUsd = {};
  for (const table of tables) {
    if (!table) continue;
    for (const [code, rate] of Object.entries(table)) {
      if (rate != null && Number.isFinite(rate) && rate > 1) {
        out[code] = rate;
      }
    }
  }
  return out;
}
