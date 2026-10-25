import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL.trim(),
  process.env.SUPABASE_SERVICE_ROLE_KEY.trim(),
  { auth: { persistSession: false } },
);

const COMERCIO_ID = '85f14385-c187-407a-841f-a05dfd0c46fc';
const WHATSAPP = '+584120736124';
const PAGO_MOVIL_PHONE = '+584120736124';
const PAGO_MOVIL_CI = 'V-15989124';
const INSTAGRAM = 'https://www.instagram.com/doletosc/';
const DIRECCION =
  'Carrera 5 entre calles 3 y 4, Palmira, Táchira, Venezuela\nReferencia: Distribuidora de licores Inversiones Doleto';

const mapsKey =
  process.env.GOOGLE_MAPS_API_KEY ||
  process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ||
  process.env.MAPS_API_KEY;

async function geocode() {
  const uri = new URL('https://maps.googleapis.com/maps/api/geocode/json');
  uri.searchParams.set('address', 'Carrera 5, Palmira, Táchira, Venezuela');
  uri.searchParams.set('region', 've');
  uri.searchParams.set('language', 'es');
  uri.searchParams.set('key', mapsKey);
  const res = await fetch(uri);
  const json = await res.json();
  const loc = json?.results?.[0]?.geometry?.location;
  if (!loc) {
    throw new Error(`Geocode failed: ${json.status} ${json.error_message || ''}`);
  }
  return loc;
}

const day = (open, start, end) =>
  open
    ? { open: true, ranges: [{ start, end }] }
    : { open: false, ranges: [] };

const horarios = {
  timezone: 'America/Caracas',
  days: {
    monday: day(true, '09:00', '21:00'),
    tuesday: day(true, '09:00', '21:00'),
    wednesday: day(true, '09:00', '21:00'),
    thursday: day(true, '09:00', '21:00'),
    friday: day(true, '09:00', '21:00'),
    saturday: day(true, '09:00', '21:00'),
    sunday: day(true, '09:00', '17:00'),
  },
};

function digital(name, fields) {
  return JSON.stringify({ name, fields });
}

const paymentMethods = [
  {
    tipo: 'efectivo__cop',
    nombre: 'Efectivo COP',
    descripcion: 'Pago en efectivo en pesos colombianos.',
    detalles: 'Usa billetes en buen estado.',
  },
  {
    tipo: 'efectivo__usd',
    nombre: 'Efectivo USD',
    descripcion: 'Pago en efectivo en dólares.',
    detalles: null,
  },
  {
    tipo: 'efectivo__ves',
    nombre: 'Efectivo VES',
    descripcion: 'Pago en efectivo en bolívares.',
    detalles: null,
  },
  {
    tipo: 'transferencia__cop__1',
    nombre: 'Pago digital: Bancolombia',
    descripcion: 'Transferencia Bancolombia.',
    detalles: digital('Bancolombia', [
      {
        type: 'texto',
        label: 'Datos',
        value: 'Te compartimos los datos al confirmar el pedido.',
      },
    ]),
  },
  {
    tipo: 'transferencia__usd__1',
    nombre: 'Pago digital: Zelle',
    descripcion: 'Pago con Zelle.',
    detalles: digital('Zelle', [
      {
        type: 'texto',
        label: 'Datos',
        value: 'Te compartimos los datos al confirmar el pedido.',
      },
    ]),
  },
  {
    tipo: 'transferencia__usd__2',
    nombre: 'Pago digital: Binance',
    descripcion: 'Pago con Binance.',
    detalles: digital('Binance', [
      {
        type: 'texto',
        label: 'Datos',
        value: 'Te compartimos los datos al confirmar el pedido.',
      },
    ]),
  },
  {
    tipo: 'transferencia__ves__1',
    nombre: 'Pago digital: Pago Móvil',
    descripcion: 'Pago Móvil BNC.',
    detalles: digital('Pago Móvil', [
      { type: 'telefono', label: 'Telf', value: PAGO_MOVIL_PHONE },
      { type: 'id', label: 'Cédula', value: PAGO_MOVIL_CI },
      { type: 'texto', label: 'Banco', value: 'BNC' },
    ]),
  },
  {
    tipo: 'transferencia__ves__2',
    nombre: 'Pago digital: BNC',
    descripcion: 'Transferencia o pago BNC.',
    detalles: digital('BNC', [
      { type: 'telefono', label: 'Telf', value: PAGO_MOVIL_PHONE },
      { type: 'id', label: 'Cédula', value: PAGO_MOVIL_CI },
      { type: 'texto', label: 'Banco', value: 'BNC' },
    ]),
  },
];

const coords = await geocode();
console.log('coords', coords);

const { data: comercio, error: fetchErr } = await sb
  .from('comercios')
  .select('branding_ia')
  .eq('id', COMERCIO_ID)
  .single();
if (fetchErr) throw fetchErr;

const branding = structuredClone(comercio.branding_ia || {});
branding.config_negocio = branding.config_negocio || {};
branding.config_negocio.social_links = {
  ...(branding.config_negocio.social_links || {}),
  instagram: INSTAGRAM,
};
// Admin panel only knows Efectivo + Transferencia (digital accounts are
// Transferencia drafts: Bancolombia, Zelle, Binance, Pago Móvil, BNC).
branding.config_negocio.metodos_pago = ['efectivo', 'transferencia'];
branding.mood_tags = ['premium', 'noche', 'licores', 'tachira', 'palmira'];
branding.descripcion_visual =
  'Distribuidora de licores Inversiones Doleto — Palmira, Táchira.';

const { error: updateErr } = await sb
  .from('comercios')
  .update({
    whatsapp: WHATSAPP,
    telefonos: WHATSAPP,
    direccion: DIRECCION,
    latitud: coords.lat,
    longitud: coords.lng,
    horarios,
    metodos_pago: ['Efectivo', 'Transferencia'],
    metodo_pago_predeterminado: 'Efectivo',
    branding_ia: branding,
    updated_at: new Date().toISOString(),
  })
  .eq('id', COMERCIO_ID);
if (updateErr) throw updateErr;
console.log('comercio updated');

const { error: delErr } = await sb
  .from('metodos_pago')
  .delete()
  .eq('comercio_id', COMERCIO_ID);
if (delErr) throw delErr;

const rows = paymentMethods.map((m) => ({ ...m, comercio_id: COMERCIO_ID }));
const { data: inserted, error: insErr } = await sb
  .from('metodos_pago')
  .insert(rows)
  .select('tipo,nombre');
if (insErr) throw insErr;
console.log(
  'payments\n' + inserted.map((r) => `  ${r.tipo} → ${r.nombre}`).join('\n'),
);

const { data: verify } = await sb
  .from('comercios')
  .select(
    'whatsapp,telefonos,direccion,latitud,longitud,horarios,metodos_pago,branding_ia',
  )
  .eq('id', COMERCIO_ID)
  .single();
console.log(
  JSON.stringify(
    {
      whatsapp: verify.whatsapp,
      telefonos: verify.telefonos,
      direccion: verify.direccion,
      lat: verify.latitud,
      lng: verify.longitud,
      horarios: verify.horarios,
      metodos_pago: verify.metodos_pago,
      instagram: verify.branding_ia?.config_negocio?.social_links?.instagram,
    },
    null,
    2,
  ),
);
