import { getServiceSupabaseClient } from '../../_lib/supabase-server';

import { normalizeCurrency, type ShopFx } from './fx';

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function positive(v: unknown): number | null {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function loadShopFx(comercioId: string): Promise<ShopFx | null> {
  const sb = getServiceSupabaseClient();
  const { data: row } = await sb
    .from('comercios')
    .select(
      'moneda,exchange_rate_value,exchange_rate_mode,exchange_rate_quote_currency,tasa_cambio_pesos,branding_ia',
    )
    .eq('id', comercioId)
    .maybeSingle();
  if (!row) return null;
  const primary = normalizeCurrency(row.moneda) || 'USD';
  const quoteRaw = normalizeCurrency(row.exchange_rate_quote_currency);
  const quote = quoteRaw && quoteRaw !== primary ? quoteRaw : null;
  const value = positive(row.exchange_rate_value) ?? positive(row.tasa_cambio_pesos);
  const cfg = asRecord(asRecord(row.branding_ia).config_negocio);

  const currencies = new Set<string>([primary]);
  for (const key of ['checkout_currencies', 'currencies'] as const) {
    const list = cfg[key];
    if (Array.isArray(list)) for (const c of list) {
      const code = normalizeCurrency(c);
      if (code) currencies.add(code);
    }
  }
  const rates: Record<string, number | null> = {};
  for (const [k, v] of Object.entries(asRecord(cfg.exchange_rates))) {
    const code = normalizeCurrency(k);
    if (code) {
      rates[code] = positive(v);
      currencies.add(code);
    }
  }
  const modes: Record<string, string> = {};
  for (const [k, v] of Object.entries(asRecord(cfg.exchange_rate_modes))) {
    const code = normalizeCurrency(k);
    if (code) modes[code] = String(v ?? '').trim().toLowerCase();
  }
  if (quote) {
    currencies.add(quote);
    if (value != null && rates[quote] == null) rates[quote] = value;
    if (!modes[quote] && row.exchange_rate_mode) {
      modes[quote] = String(row.exchange_rate_mode).trim().toLowerCase();
    }
  }
  return {
    primary,
    quote,
    value,
    mode: row.exchange_rate_mode ? String(row.exchange_rate_mode).toLowerCase() : null,
    rates,
    modes,
    currencies: [...currencies],
  };
}

