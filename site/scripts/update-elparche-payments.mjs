/**
 * Update El Parche del Gato payment methods with real account data.
 *
 * Usage (from site/):
 *   node --env-file=.env.local scripts/update-elparche-payments.mjs
 */
import { createClient } from '@supabase/supabase-js';

const SLUG = 'el-parche-del-gato';

const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
if (!url || !serviceKey) {
  console.error('Need Supabase env');
  process.exit(1);
}

const sb = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function digital(name, fields) {
  return JSON.stringify({ name, fields });
}

function paymentRows(comercioId) {
  return [
    // --- VES ---
    {
      comercio_id: comercioId,
      tipo: 'efectivo__ves',
      nombre: 'Efectivo',
      descripcion: 'Pago en efectivo en bolívares.',
      detalles: 'Por favor, usa billetes en buen estado.',
    },
    {
      comercio_id: comercioId,
      tipo: 'transferencia__ves__1',
      nombre: 'Pago digital: Pago Móvil',
      descripcion: 'Pago Móvil · Banco del Tesoro',
      detalles: digital('Pago Móvil', [
        { type: 'telefono', label: 'Teléfono', value: '0412-2056761' },
        { type: 'id', label: 'Cédula', value: 'V-19777122' },
        { type: 'texto', label: 'Banco', value: 'Banco del Tesoro' },
      ]),
    },
    {
      comercio_id: comercioId,
      tipo: 'transferencia__ves__2',
      nombre: 'Pago digital: Transferencia Bancaria',
      descripcion: 'Transferencia · Banco del Tesoro',
      detalles: digital('Transferencia Bancaria', [
        {
          type: 'numero_cuenta',
          label: 'Nro. Cuenta',
          value: '01630304623043031207',
        },
        { type: 'id', label: 'Cédula', value: 'V-19777122' },
        { type: 'texto', label: 'Banco', value: 'Banco del Tesoro' },
        { type: 'texto', label: 'Titular', value: 'Eber Rivas' },
      ]),
    },

    // --- USD ---
    {
      comercio_id: comercioId,
      tipo: 'efectivo__usd',
      nombre: 'Efectivo',
      descripcion: 'Pago en efectivo en dólares.',
      detalles: 'Por favor, usa billetes en buen estado.',
    },
    {
      comercio_id: comercioId,
      tipo: 'transferencia__usd__1',
      nombre: 'Pago digital: Binance',
      descripcion: 'Pago con Binance',
      detalles: digital('Binance', [
        { type: 'correo', label: 'Email', value: 'eberarivas15@gmail.com' },
      ]),
    },
    {
      comercio_id: comercioId,
      tipo: 'transferencia__usd__2',
      nombre: 'Pago digital: Zelle',
      descripcion: 'Pago con Zelle',
      detalles: digital('Zelle', [
        { type: 'telefono', label: 'Número', value: '9419528946' },
        { type: 'texto', label: 'Titular', value: 'Haydee Casares' },
      ]),
    },
    // --- COP / PCO ---
    {
      comercio_id: comercioId,
      tipo: 'efectivo__cop',
      nombre: 'Efectivo',
      descripcion: 'Pago en efectivo en pesos colombianos (PCO).',
      detalles: 'Por favor, usa billetes en buen estado.',
    },
    {
      comercio_id: comercioId,
      tipo: 'transferencia__cop__1',
      nombre: 'Pago digital: Bancolombia',
      descripcion: 'Transferencia Bancolombia',
      detalles: digital('Bancolombia', [
        { type: 'numero_cuenta', label: 'Nro. Cuenta', value: '6858924' },
        { type: 'texto', label: 'Tipo', value: 'Ahorros' },
        {
          type: 'texto',
          label: 'Titular',
          value: 'Eber Alexander Rivas Vivas',
        },
      ]),
    },
  ];
}

async function main() {
  const { data: comercio, error: cErr } = await sb
    .from('comercios')
    .select('id,nombre,branding_ia')
    .eq('slug', SLUG)
    .single();
  if (cErr) throw cErr;

  const branding = structuredClone(comercio.branding_ia || {});
  branding.config_negocio = branding.config_negocio || {};
  branding.config_negocio.metodos_pago = ['efectivo', 'transferencia'];
  branding.config_negocio.inicio_menu = {
    ...(branding.config_negocio.inicio_menu || {}),
    ver_metodos_pago: true,
  };

  const { error: updErr } = await sb
    .from('comercios')
    .update({
      metodos_pago: ['Efectivo', 'Transferencia'],
      metodo_pago_predeterminado: 'Transferencia',
      branding_ia: branding,
      updated_at: new Date().toISOString(),
    })
    .eq('id', comercio.id);
  if (updErr) throw updErr;
  console.log('Comercio updated (ver_metodos_pago=true)');

  const { error: delErr } = await sb
    .from('metodos_pago')
    .delete()
    .eq('comercio_id', comercio.id);
  if (delErr) throw delErr;

  const rows = paymentRows(comercio.id);
  const { error: insErr } = await sb.from('metodos_pago').insert(rows);
  if (insErr) throw insErr;

  console.log(`Inserted ${rows.length} payment methods:`);
  for (const r of rows) console.log(' -', r.tipo, r.nombre);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
