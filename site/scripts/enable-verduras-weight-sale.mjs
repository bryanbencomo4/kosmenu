/**
 * Enable opciones_menu.venta_por_peso on Verduras Delivery products sold by kg.
 *
 *   node --env-file=.env.local scripts/enable-verduras-weight-sale.mjs
 */

import { createClient } from '@supabase/supabase-js';

const SLUG = 'verduras-delivery';
const WEIGHT = {
  unidad: 'kg',
  paso: 0.05,
  minimo: 0.1,
  maximo: 25,
};

const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function main() {
  const { data: c, error: cErr } = await supabase
    .from('comercios')
    .select('id')
    .eq('slug', SLUG)
    .single();
  if (cErr) throw cErr;

  const { data: products, error: pErr } = await supabase
    .from('productos')
    .select('id,nombre,descripcion,opciones_menu')
    .eq('comercio_id', c.id);
  if (pErr) throw pErr;

  let enabled = 0;
  let skipped = 0;
  for (const p of products) {
    const desc = (p.descripcion || '').toLowerCase();
    const byKg =
      desc.includes('venta por kilogramo') ||
      desc.includes('por kilogramo') ||
      /\/\s*kg\b/i.test(desc);
    // Cambur uses discrete pack options — leave as presentation choice.
    if (!byKg || p.nombre === 'Cambur') {
      skipped += 1;
      continue;
    }
    const next = {
      ...(p.opciones_menu && typeof p.opciones_menu === 'object'
        ? p.opciones_menu
        : {}),
      venta_por_peso: WEIGHT,
    };
    const { error } = await supabase
      .from('productos')
      .update({ opciones_menu: next })
      .eq('id', p.id);
    if (error) throw error;
    enabled += 1;
    console.log(`  + ${p.nombre}`);
  }

  console.log(`Done. enabled=${enabled} skipped=${skipped}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
