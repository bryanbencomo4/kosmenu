/**
 * Read-only catalog verification for Pizzas El Trueno (no Gemini).
 * Usage: node --env-file=.env.local scripts/verify-trueno-catalog.mjs
 */
import { createClient } from '@supabase/supabase-js';

const COMMERCE_ID = '0aa8c53b-07f1-446e-8b88-66c2b7ae89ea';
const SLUG = 'pizzas-el-trueno';

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
  .select('id,slug,nombre,en_linea,moneda')
  .eq('id', COMMERCE_ID)
  .maybeSingle();
if (cErr || !comercio || comercio.slug !== SLUG) {
  console.error('Commerce mismatch', cErr?.message || comercio);
  process.exit(1);
}

const { data: categorias, error: catErr } = await sb
  .from('categorias')
  .select('id,nombre,orden')
  .eq('comercio_id', COMMERCE_ID)
  .order('orden');
if (catErr) {
  console.error(catErr.message);
  process.exit(1);
}

const { data: productos, error: pErr } = await sb
  .from('productos')
  .select(
    'id,nombre,precio,disponible,categoria_id,descripcion,opciones_menu,comercio_id',
  )
  .eq('comercio_id', COMMERCE_ID);
if (pErr) {
  console.error(pErr.message);
  process.exit(1);
}

const foreign = (productos || []).filter((p) => p.comercio_id !== COMMERCE_ID);
const withOptions = (productos || []).filter((p) => p.opciones_menu != null);
const unavailable = (productos || []).filter((p) => p.disponible === false);
const pizzas = (productos || []).filter((p) => {
  const cat = (categorias || []).find((c) => c.id === p.categoria_id);
  return (cat?.nombre || '').toUpperCase() === 'PIZZAS';
});

const optionGroups = [];
for (const p of withOptions) {
  const raw = p.opciones_menu;
  let parsed = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = null;
    }
  }
  const groups = Array.isArray(parsed)
    ? parsed
    : parsed?.grupos || parsed?.groups || parsed?.options || [];
  optionGroups.push({
    name: p.nombre,
    groupCount: Array.isArray(groups) ? groups.length : 0,
  });
}

const report = {
  commerce: {
    id: comercio.id,
    slug: comercio.slug,
    nombre: comercio.nombre,
    en_linea: comercio.en_linea,
    moneda: comercio.moneda,
  },
  counts: {
    categorias: (categorias || []).length,
    productos: (productos || []).length,
    pizzas: pizzas.length,
    withOpcionesMenu: withOptions.length,
    unavailable: unavailable.length,
    foreignTenantLeak: foreign.length,
  },
  categoryNames: (categorias || []).map((c) => c.nombre),
  samplePizzas: pizzas.slice(0, 5).map((p) => ({
    nombre: p.nombre,
    precio: p.precio,
    disponible: p.disponible,
    descripcion: (p.descripcion || '').slice(0, 60),
  })),
  optionGroupSamples: optionGroups.slice(0, 5),
  ok:
    (productos || []).length === 35 &&
    foreign.length === 0 &&
    (categorias || []).length >= 1,
};

console.log(JSON.stringify(report, null, 2));
process.exit(report.ok ? 0 : 2);
