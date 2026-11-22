/**
 * READ-ONLY: Trueno moneda + tasas + combo contracts (no writes, no Gemini).
 * Usage: node --env-file=.env.local scripts/_audit-trueno-currency-combo-readonly.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const COMMERCE_ID = '0aa8c53b-07f1-446e-8b88-66c2b7ae89ea';
const SLUG = 'pizzas-el-trueno';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, '..', '.data', 'qa-validation');
mkdirSync(outDir, { recursive: true });

const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
if (!url || !key) {
  console.error('Missing Supabase env');
  process.exit(1);
}

const sb = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: comercio, error: cErr } = await sb
  .from('comercios')
  .select(
    [
      'id',
      'slug',
      'nombre',
      'en_linea',
      'moneda',
      'moneda_principal',
      'exchange_rate_value',
      'exchange_rate_mode',
      'exchange_rate_source',
      'exchange_rate_quote_currency',
      'tasa_cambio_pesos',
      'last_rate_update',
      'branding_ia',
      'whatsapp',
    ].join(','),
  )
  .eq('id', COMMERCE_ID)
  .maybeSingle();

if (cErr || !comercio || comercio.slug !== SLUG) {
  console.error('Commerce mismatch', cErr?.message || comercio);
  process.exit(1);
}

const branding =
  comercio.branding_ia && typeof comercio.branding_ia === 'object'
    ? comercio.branding_ia
    : {};
const cfg =
  branding.config_negocio && typeof branding.config_negocio === 'object'
    ? branding.config_negocio
    : {};

const { data: productos, error: pErr } = await sb
  .from('productos')
  .select('id,nombre,precio,disponible,opciones_menu,categoria_id')
  .eq('comercio_id', COMMERCE_ID);
if (pErr) {
  console.error(pErr.message);
  process.exit(1);
}

function fold(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .trim();
}

const granjera = (productos || []).find((p) => fold(p.nombre) === 'granjera');
const campesina = (productos || []).find((p) => fold(p.nombre) === 'campesina');

function parseOptions(raw) {
  let parsed = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  return parsed && typeof parsed === 'object' ? parsed : null;
}

function comboMeta(p) {
  const opts = parseOptions(p?.opciones_menu);
  const combo = opts?.personalizacion?.combinacion;
  if (!combo || combo.activada !== true) return null;
  return {
    activada: true,
    titulo: combo.titulo,
    regla_precio: combo.regla_precio,
    productos_compatibles: combo.productos_compatibles || [],
    pregunta_activada: combo.pregunta_activada === true,
  };
}

const granjeraCombo = comboMeta(granjera);
const campesinaCombo = comboMeta(campesina);

// Load compiled helpers via tsx-less path: duplicate MAX rule inline for audit,
// then also try dynamic import of built modules is hard — compute with same rule.
function sizeOptionPrice(product, sizeLabel) {
  const opts = parseOptions(product.opciones_menu);
  const groups = opts?.grupos || [];
  const sizeGroup = groups.find((g) =>
    /tamano|tamaño|size/i.test(String(g.nombre || '')),
  );
  if (!sizeGroup) return Number(product.precio) || 0;
  const want = fold(sizeLabel);
  const opt = (sizeGroup.opciones || []).find(
    (o) => fold(o.nombre) === want || fold(o.nombre).includes(want),
  );
  const base = Number(product.precio) || 0;
  const add = Number(opt?.precio) || 0;
  return base + add;
}

const priceGranjeraGrande = granjera
  ? sizeOptionPrice(granjera, 'Grande')
  : null;
const priceCampesinaGrande = campesina
  ? sizeOptionPrice(campesina, 'Grande')
  : null;
const maxCombined =
  priceGranjeraGrande != null && priceCampesinaGrande != null
    ? Math.max(priceGranjeraGrande, priceCampesinaGrande)
    : null;

const report = {
  auditedAt: new Date().toISOString(),
  mutatedProduction: false,
  geminiCalls: 0,
  commerce: {
    id: comercio.id,
    slug: comercio.slug,
    nombre: comercio.nombre,
    en_linea: comercio.en_linea,
    moneda: comercio.moneda ?? null,
    moneda_principal: comercio.moneda_principal ?? null,
    exchange_rate_value: comercio.exchange_rate_value ?? null,
    exchange_rate_mode: comercio.exchange_rate_mode ?? null,
    exchange_rate_source: comercio.exchange_rate_source ?? null,
    exchange_rate_quote_currency:
      comercio.exchange_rate_quote_currency ?? null,
    tasa_cambio_pesos: comercio.tasa_cambio_pesos ?? null,
    last_rate_update: comercio.last_rate_update ?? null,
  },
  branding_config_negocio: {
    checkout_currencies: cfg.checkout_currencies ?? cfg.currencies ?? null,
    exchange_rates: cfg.exchange_rates ?? null,
    exchange_rate_modes: cfg.exchange_rate_modes ?? null,
    exchange_rate_sources: cfg.exchange_rate_sources ?? null,
    exchange_rate_adjustments: cfg.exchange_rate_adjustments
      ? Object.keys(cfg.exchange_rate_adjustments)
      : null,
  },
  discrepancy: {
    expected_primary_by_owner: 'COP',
    effective_menu_currency_field: comercio.moneda ?? null,
    moneda_principal_field: comercio.moneda_principal ?? null,
    chatbot_uses: 'resolveMenuCurrency(comercio.moneda) → ISO code (PCO→COP)',
    likely_usd_cause:
      String(comercio.moneda || '').toUpperCase() === 'USD'
        ? 'comercio.moneda is USD in DB — chat and menu both treat USD as principal'
        : String(comercio.moneda_principal || '').toUpperCase() === 'USD' &&
            String(comercio.moneda || '').toUpperCase() !== 'USD'
          ? 'moneda_principal=USD conflicts with moneda'
          : 'Check checkout currency selector / formatting path',
  },
  combo: {
    granjera: granjera
      ? {
          id: granjera.id,
          precio_base: granjera.precio,
          disponible: granjera.disponible,
          combinacion: granjeraCombo,
        }
      : null,
    campesina: campesina
      ? {
          id: campesina.id,
          precio_base: campesina.precio,
          disponible: campesina.disponible,
          combinacion: campesinaCombo,
        }
      : null,
    granjera_allows_campesina: Boolean(
      granjeraCombo?.productos_compatibles?.includes(campesina?.id),
    ),
    traditional_max_rule_grande: {
      granjera_grande: priceGranjeraGrande,
      campesina_grande: priceCampesinaGrande,
      combined_unit_price_max: maxCombined,
      currency_of_prices: comercio.moneda ?? null,
      note: 'Same Math.max rule as resolveCombinedUnitPrice',
    },
  },
};

const outPath = path.join(outDir, 'trueno-currency-combo-readonly.json');
writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf8');
console.log(JSON.stringify(report, null, 2));
console.error(`Wrote ${outPath}`);
