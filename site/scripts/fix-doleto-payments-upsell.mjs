/**
 * Align Doleto payments with admin options (Efectivo + Transferencia only)
 * and enable pre-checkout ventas sugeridas via upsell_config + category roles.
 *
 * Usage (from site/):
 *   node --env-file=.env.local scripts/fix-doleto-payments-upsell.mjs
 */
import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL.trim(),
  process.env.SUPABASE_SERVICE_ROLE_KEY.trim(),
  { auth: { persistSession: false } },
);

const COMERCIO_ID = '85f14385-c187-407a-841f-a05dfd0c46fc';

const CATS = {
  cervezas: '9de39ae4-b051-45f1-a6c8-e3a70f75ecc8',
  whiskies: 'ece0efbe-9455-4fab-915b-41df581d3c80',
  rones: 'acea382f-f4df-45f9-a854-6b593cf4138a',
  vinos: '295c8fd9-a74d-4922-bd81-9895222acf42',
  refrescos: '717e0b4f-7932-4700-bd27-685397cdce52',
  pasapalos: '71f8d02c-0177-4319-836e-acedb6083967',
  viveres: 'd2395ec8-f50d-440e-8e24-9ba9ce7d66d5',
  cigarrillos: 'cc6f11f3-ddb3-441e-b3cb-362c95a2742b',
};

const CAT_NAMES = {
  [CATS.cervezas]: 'CERVEZAS, SANGRÍAS Y BEBIDAS LISTAS',
  [CATS.whiskies]: 'WHISKIES Y DESTILADOS IMPORTADOS',
  [CATS.rones]: 'RONES, ANISES Y AGUARDIENTES',
  [CATS.vinos]: 'VINOS, SIDRAS, PONCHES Y MEZCLADORES',
  [CATS.refrescos]: 'REFRESCOS, AGUA, JUGOS Y ENERGIZANTES',
  [CATS.pasapalos]: 'PASAPALOS, GOLOSINAS Y SNACKS',
  [CATS.viveres]: 'VÍVERES Y ARTÍCULOS PARA EL HOGAR',
  [CATS.cigarrillos]: 'CIGARRILLOS, CHIMÓ Y ACCESORIOS',
};

// Same shape the Flutter admin panel persists (Efectivo | Transferencia).
const ADMIN_PAYMENT_TYPES = ['Efectivo', 'Transferencia'];

const { data: comercio, error: fetchErr } = await sb
  .from('comercios')
  .select('branding_ia, upsell_config')
  .eq('id', COMERCIO_ID)
  .single();
if (fetchErr) throw fetchErr;

// 1) Remove non-admin payment rows (e.g. tarjeta / Punto de Venta).
const { data: deleted, error: delErr } = await sb
  .from('metodos_pago')
  .delete()
  .eq('comercio_id', COMERCIO_ID)
  .like('tipo', 'tarjeta%')
  .select('id,tipo,nombre');
if (delErr) throw delErr;
console.log(
  'removed non-admin payments',
  (deleted || []).map((r) => `${r.tipo} (${r.nombre})`),
);

const branding = structuredClone(comercio.branding_ia || {});
branding.config_negocio = branding.config_negocio || {};
branding.config_negocio.metodos_pago = ['efectivo', 'transferencia'];

// 2) Category roles used by Venta sugerida in the admin panel.
const roleUpdates = [
  { id: CATS.refrescos, rol: 'drink' },
  { id: CATS.cervezas, rol: 'drink' },
  { id: CATS.pasapalos, rol: 'side' },
  { id: CATS.cigarrillos, rol: 'other' },
  { id: CATS.whiskies, rol: null },
  { id: CATS.rones, rol: null },
  { id: CATS.vinos, rol: null },
  { id: CATS.viveres, rol: null },
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

// 3) Pre-checkout upsell_config (same structure Flutter PreCheckoutUpsellScreen saves).
const suggestionKinds = ['bebida', 'acompanamiento', 'otro'];
const listed = [
  { id: CATS.refrescos, tipo: 'bebida' },
  { id: CATS.cervezas, tipo: 'bebida' },
  { id: CATS.pasapalos, tipo: 'acompanamiento' },
  { id: CATS.cigarrillos, tipo: 'otro' },
];

const originIds = [
  CATS.whiskies,
  CATS.rones,
  CATS.vinos,
  CATS.cervezas,
  CATS.refrescos,
  CATS.pasapalos,
  CATS.viveres,
  CATS.cigarrillos,
];

const reglas = originIds.map((categoria_id) => ({
  categoria_id,
  categoria_origen: CAT_NAMES[categoria_id],
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
    metodos_pago: ADMIN_PAYMENT_TYPES,
    metodo_pago_predeterminado: 'Efectivo',
    branding_ia: branding,
    upsell_config,
    updated_at: new Date().toISOString(),
  })
  .eq('id', COMERCIO_ID);
if (updateErr) throw updateErr;
console.log('comercio payments + upsell_config updated');

// 4) Enable Boost Sales / upsell_settings hub (admin "Aumentar ventas").
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

// Verify
const { data: methods } = await sb
  .from('metodos_pago')
  .select('tipo,nombre')
  .eq('comercio_id', COMERCIO_ID)
  .order('tipo');
const { data: verify } = await sb
  .from('comercios')
  .select('metodos_pago,metodo_pago_predeterminado,upsell_config')
  .eq('id', COMERCIO_ID)
  .single();
const { data: cats } = await sb
  .from('categorias')
  .select('nombre,rol')
  .eq('comercio_id', COMERCIO_ID)
  .order('orden');

console.log(
  JSON.stringify(
    {
      metodos_pago: verify.metodos_pago,
      metodo_pago_predeterminado: verify.metodo_pago_predeterminado,
      payment_rows: methods,
      upselling: verify.upsell_config?.upselling,
      pre_checkout: {
        activo: verify.upsell_config?.pre_checkout?.activo,
        tipos: verify.upsell_config?.pre_checkout?.tipos,
        categorias: verify.upsell_config?.pre_checkout?.categorias,
        reglas: verify.upsell_config?.pre_checkout?.reglas?.length,
      },
      category_roles: cats,
    },
    null,
    2,
  ),
);
