/**
 * Enable "venta sugerida" / productos sugeridos for Sushi Delivery.
 * - Category roles: Bebidas=drink, Postres=dessert, Extras=side
 * - Pre-checkout upsell_config
 * - upsell_settings hub (add-to-cart / cart / checkout)
 *
 * Usage (from site/):
 *   node --env-file=.env.local scripts/enable-sushidelivery-upsell.mjs
 */
import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL.trim(),
  process.env.SUPABASE_SERVICE_ROLE_KEY.trim(),
  { auth: { persistSession: false } },
);

const SLUG = 'sushidelivery';

const { data: comercio, error: cErr } = await sb
  .from('comercios')
  .select('id,nombre,upsell_config')
  .eq('slug', SLUG)
  .single();
if (cErr) throw cErr;

const COMERCIO_ID = comercio.id;
const { data: cats, error: catErr } = await sb
  .from('categorias')
  .select('id,nombre,rol,orden')
  .eq('comercio_id', COMERCIO_ID)
  .order('orden');
if (catErr) throw catErr;

const byName = Object.fromEntries((cats || []).map((c) => [c.nombre, c]));
const need = (name) => {
  const row = byName[name];
  if (!row) throw new Error(`Missing category: ${name}`);
  return row;
};

const bebidas = need('Bebidas');
const postres = need('Postres');
const extras = need('Extras');

// Food / main categories that should trigger suggestions.
const originNames = [
  'Entradas',
  'Ensaladas',
  'Temakis',
  'Rolls',
  'Rolls especiales',
  'Rolls tempurizados',
  'Rolls sin arroz',
  'Rolls papel de soya',
  'Hosomaki',
  'Sushi niguiri',
  'Sashimi',
  'Combos',
  'Combos tempurizados',
  'Menú tempura',
  'Pokes',
];

const roleUpdates = [
  { id: bebidas.id, rol: 'drink' },
  { id: postres.id, rol: 'dessert' },
  { id: extras.id, rol: 'side' },
  ...originNames.map((name) => ({ id: need(name).id, rol: 'main' })),
];

for (const row of roleUpdates) {
  const { error } = await sb
    .from('categorias')
    .update({ rol: row.rol })
    .eq('id', row.id)
    .eq('comercio_id', COMERCIO_ID);
  if (error) throw error;
}
console.log('category roles updated');

const suggestionKinds = ['bebida', 'postre', 'acompanamiento'];
const listed = [
  { id: bebidas.id, tipo: 'bebida' },
  { id: postres.id, tipo: 'postre' },
  { id: extras.id, tipo: 'acompanamiento' },
];

const originCats = originNames.map((name) => need(name));
// Also suggest when cart already has drinks/desserts/extras (cross-sell others).
const allOrigins = [...originCats, bebidas, postres, extras];

const reglas = allOrigins.map((cat) => ({
  categoria_id: cat.id,
  categoria_origen: cat.nombre,
  sugerir_tipos: suggestionKinds,
}));

const upsell_config = {
  ...(comercio.upsell_config && typeof comercio.upsell_config === 'object'
    ? comercio.upsell_config
    : {}),
  upselling: true,
  pre_checkout: {
    activo: true,
    tipos: suggestionKinds,
    max_productos: 12,
    categorias: listed,
    reglas,
  },
};

const { error: updateErr } = await sb
  .from('comercios')
  .update({
    upsell_config,
    updated_at: new Date().toISOString(),
  })
  .eq('id', COMERCIO_ID);
if (updateErr) throw updateErr;
console.log('upsell_config saved');

const { error: settingsErr } = await sb.from('upsell_settings').upsert(
  {
    comercio_id: COMERCIO_ID,
    enabled: true,
    show_add_to_cart: true,
    show_cart: true,
    show_checkout: true,
    max_add_suggestions: 2,
    max_cart_suggestions: 3,
    max_checkout_suggestions: 2,
    free_delivery_order_types: ['delivery'],
  },
  { onConflict: 'comercio_id' },
);
if (settingsErr) throw settingsErr;
console.log('upsell_settings enabled');

const { data: verifyCats } = await sb
  .from('categorias')
  .select('nombre,rol')
  .eq('comercio_id', COMERCIO_ID)
  .order('orden');
const { data: verify } = await sb
  .from('comercios')
  .select('upsell_config')
  .eq('id', COMERCIO_ID)
  .single();
const { data: settings } = await sb
  .from('upsell_settings')
  .select('*')
  .eq('comercio_id', COMERCIO_ID)
  .maybeSingle();

console.log(
  JSON.stringify(
    {
      comercio: comercio.nombre,
      upselling: verify.upsell_config?.upselling,
      pre_checkout: {
        activo: verify.upsell_config?.pre_checkout?.activo,
        tipos: verify.upsell_config?.pre_checkout?.tipos,
        max_productos: verify.upsell_config?.pre_checkout?.max_productos,
        categorias: verify.upsell_config?.pre_checkout?.categorias,
        reglas: verify.upsell_config?.pre_checkout?.reglas?.length,
      },
      settings: {
        enabled: settings?.enabled,
        show_add_to_cart: settings?.show_add_to_cart,
        show_cart: settings?.show_cart,
        show_checkout: settings?.show_checkout,
      },
      category_roles: verifyCats,
    },
    null,
    2,
  ),
);
