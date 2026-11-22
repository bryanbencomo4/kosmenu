/**
 * READ-ONLY: Trueno currency display strategy evidence.
 * No writes. No Gemini. Prints parity between menu currency, FX, and COP quote.
 */
import { createClient } from '@supabase/supabase-js';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
// Use compiled path via dynamic import of TS through next isn't available —
// duplicate the commercial numbers from live DB + known helpers via audit JSON.

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, '.data', 'qa-validation');
mkdirSync(outDir, { recursive: true });

const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const COMMERCE = '0aa8c53b-07f1-446e-8b88-66c2b7ae89ea';

if (!url || !key) {
  console.error('missing supabase env');
  process.exit(2);
}

const sb = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: comercio } = await sb
  .from('comercios')
  .select(
    'id,slug,moneda,moneda_principal,exchange_rate_value,exchange_rate_quote_currency,exchange_rate_mode,exchange_rate_source,branding_ia',
  )
  .eq('id', COMMERCE)
  .maybeSingle();

const cfg = comercio?.branding_ia?.config_negocio || {};
const rate = Number(cfg.exchange_rates?.COP ?? comercio?.exchange_rate_value ?? NaN);
const unitUsd = 10.91;
const unitCop = Number.isFinite(rate) ? Math.round(unitUsd * rate * 100) / 100 : null;

const report = {
  mutatedProduction: false,
  storage_currency: String(comercio?.moneda || '').toUpperCase(),
  moneda_principal: String(comercio?.moneda_principal || '').toUpperCase(),
  moneda_default_config: cfg.moneda_default ?? null,
  checkout_currencies: cfg.checkout_currencies ?? cfg.currencies ?? null,
  cop_rate: rate,
  example_combo_grande_usd: unitUsd,
  example_combo_grande_cop_at_rate: unitCop,
  safe_strategy: {
    do_not: 'Set comercio.moneda=COP without rewriting all product prices (would show 10.91 COP).',
    recommended:
      'Keep storage/base currency USD. Offer COP at checkout via existing exchange_rates.COP=3200. Chat quotes COP with get_exchange_rate. Optional authorized config: set config_negocio.moneda_default=COP only after UI prefers that field over businessBaseCurrency.',
    requires_authorization: [
      'Confirm owner wants COP as display default (not storage rewrite).',
      'Confirm commercial rate 1 USD = 3200 COP remains valid.',
      'If wiring moneda_default, authorize that small code preference change separately.',
    ],
    parity_rule:
      'Menu, chatbot proposals, cart, and checkout must all use the same base unit prices in USD; COP figures are conversions of those units via the restaurant rate — never a second price list.',
  },
};

writeFileSync(
  join(outDir, 'trueno-currency-display-readonly.json'),
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report, null, 2));
