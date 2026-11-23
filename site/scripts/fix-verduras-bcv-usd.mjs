/**
 * Switch Verduras Delivery FX to BCV USD and recalc product prices from original Bs.
 *
 *   node --env-file=.env.local scripts/fix-verduras-bcv-usd.mjs
 */

import { createClient } from '@supabase/supabase-js';

const SLUG = 'verduras-delivery';

const BS = {
  Papa: 1700,
  Zanahoria: 1300,
  Cebolla: 1800,
  Tomate: 3000,
  Pimentón: 1600,
  Ají: 2500,
  Apio: 2600,
  Batata: 2600,
  Ocumo: 2600,
  Remolacha: 1500,
  Pepino: 1500,
  Calabacín: 1500,
  'Lechuga Americana': 2500,
  Jojoto: 600,
  Plátano: 700,
  'Aguacate polo': 2000,
  Cambur: 650,
  Limón: 3500,
  Coco: 1200,
  Mora: 900,
  'Manzana roja': 450,
  'Manzana verde': 450,
  Repollo: 800,
  Auyama: 900,
  Yuca: 1000,
  Topocho: 700,
  Lechosa: 1600,
  Melón: 2000,
  Cebollín: 2000,
  Cilantro: 4000,
  Celery: 2000,
  'Ajo Porro': 2000,
  Aliño: 300,
  Adobo: 300,
  Comino: 300,
  Carmencita: 300,
  Curry: 300,
  Cúrcuma: 500,
  Paprika: 500,
  Pimienta: 300,
  'Orégano entero': 300,
  Bicarbonato: 300,
  'Polvo royal': 300,
  'Ácido Bórico': 500,
  Clavito: 500,
  'Canela molida': 300,
};

const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function usdFromBs(bs, rate) {
  return Math.round((Number(bs) / Number(rate)) * 100) / 100;
}

async function main() {
  const { data: usdRef, error: refErr } = await supabase
    .from('comercios')
    .select('exchange_rate_value,last_rate_update,slug')
    .eq('exchange_rate_source', 'bcv_usd')
    .eq('exchange_rate_mode', 'auto')
    .gt('exchange_rate_value', 1)
    .order('last_rate_update', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (refErr) throw refErr;

  const rate = Number(usdRef?.exchange_rate_value);
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new Error('No live BCV USD rate found');
  }
  console.log(`Using BCV USD ${rate} (from ${usdRef.slug})`);

  const { data: c, error: cErr } = await supabase
    .from('comercios')
    .select('id,branding_ia')
    .eq('slug', SLUG)
    .single();
  if (cErr) throw cErr;

  const branding = structuredClone(c.branding_ia || {});
  branding.config_negocio = branding.config_negocio || {};
  branding.config_negocio.exchange_rates = { VES: rate };
  branding.config_negocio.exchange_rate_modes = { VES: 'auto' };
  branding.config_negocio.exchange_rate_sources = { VES: 'bcv_usd' };

  const { error: uErr } = await supabase
    .from('comercios')
    .update({
      exchange_rate_source: 'bcv_usd',
      exchange_rate_mode: 'auto',
      exchange_rate_value: rate,
      exchange_rate_quote_currency: 'VES',
      last_rate_update: usdRef.last_rate_update || new Date().toISOString(),
      branding_ia: branding,
    })
    .eq('id', c.id);
  if (uErr) throw uErr;

  const { data: products, error: pErr } = await supabase
    .from('productos')
    .select('id,nombre,opciones_menu')
    .eq('comercio_id', c.id);
  if (pErr) throw pErr;

  let updated = 0;
  for (const p of products) {
    const bs = BS[p.nombre];
    if (bs == null) {
      console.warn('No BS map for', p.nombre);
      continue;
    }

    if (p.nombre === 'Cambur') {
      const base = usdFromBs(650, rate);
      const total2 = usdFromBs(1000, rate);
      const delta = Math.round((total2 - base) * 100) / 100;
      const grupos = (p.opciones_menu?.grupos || []).map((g) => ({
        ...g,
        opciones: (g.opciones || []).map((o) => {
          if (/^1\s*Kg/i.test(o.nombre)) {
            return { ...o, precio: 0, predeterminada: true };
          }
          if (/^2\s*Kg/i.test(o.nombre)) {
            return { ...o, precio: delta };
          }
          return o;
        }),
      }));
      const { error } = await supabase
        .from('productos')
        .update({
          precio: base,
          opciones_menu: {
            ...(p.opciones_menu || {}),
            activadas: true,
            grupos,
          },
        })
        .eq('id', p.id);
      if (error) throw error;
    } else {
      const price = usdFromBs(bs, rate);
      const { error } = await supabase
        .from('productos')
        .update({ precio: price })
        .eq('id', p.id);
      if (error) throw error;
    }
    updated += 1;
  }

  const { data: check } = await supabase
    .from('comercios')
    .select('exchange_rate_source,exchange_rate_value,branding_ia')
    .eq('id', c.id)
    .single();
  const { data: sample } = await supabase
    .from('productos')
    .select('nombre,precio,opciones_menu')
    .eq('comercio_id', c.id)
    .in('nombre', ['Papa', 'Tomate', 'Cambur', 'Cilantro', 'Aliño']);

  console.log(
    JSON.stringify(
      {
        updated,
        source: check.exchange_rate_source,
        value: check.exchange_rate_value,
        brandingSource: check.branding_ia?.config_negocio?.exchange_rate_sources,
        brandingRate: check.branding_ia?.config_negocio?.exchange_rates,
        sample,
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
