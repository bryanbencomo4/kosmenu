/**
 * Provision "Pa' Que Komais" (slug: paquekomais) from Menu_Pa_Que_Comais.xlsx.
 * Currencies COP + USD + VES (cash). Delivery from Auto Pizzas Nápoles.
 * FX mirrors Inversiones Doleto. No product-app code changes.
 *
 * Usage (from site/):
 *   node --env-file=.env.local scripts/provision-paquekomais.mjs --dry-run
 *   node --env-file=.env.local scripts/provision-paquekomais.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const XLSX = require('xlsx');

const dryRun = process.argv.includes('--dry-run');
const SLUG = 'paquekomais';
const NOMBRE = "Pa' Que Komais";
const EMAIL = 'paquekomais@1xp.fr';
const PASSWORD = '123456789';
const WHATSAPP = '+584143754727';
const INSTAGRAM = 'https://www.instagram.com/paquekomais';
const DIRECCION =
  'Calle 4, Palmira, Táchira, Venezuela\nReferencia: Calle 4 entre carreras 4 y 5 frente al movistar de Palmira';
/** From maps.app.goo.gl/kwLRVnGKeEdWvh5t8 */
const LAT = 7.839216;
const LNG = -72.227299;
const COLOR = '#C2410C';
const CATEGORIA = 'Pastelería / Comida rápida';
const NAPOLES_ID = '72965186-b3b9-4974-85d6-53bef1b4a400';
const DOLETO_ID = '85f14385-c187-407a-841f-a05dfd0c46fc';
const XLSX_PATH =
  process.argv.find((a, i, arr) => arr[i - 1] === '--xlsx') ||
  'C:/Users/bryan/Downloads/Menu_Pa_Que_Comais.xlsx';

const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
if (!url || !serviceKey) {
  console.error('Need NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function brandingPayload({ delivery, rates, modes, sources }) {
  return {
    schema_version: 2,
    color_principal: COLOR,
    color_secundario: '#1C1917',
    fuente_titulos: 'Montserrat',
    fuente_cuerpo: 'Open Sans',
    estilo_botones: 'rounded',
    mood_tags: ['pasteles', 'arepas', 'pasapalos', 'familiar'],
    descripcion_visual: "Pa' Que Komais — pasteles, arepas y pasapalos en Palmira.",
    layout_type: 'grid',
    colores_personalizados: {
      background: '#FFF7ED',
      card_surface: '#FFFFFF',
      text_on_primary: '#FFFFFF',
    },
    config_visual: {
      menu_sticky: true,
      show_images: true,
      items_per_row: 2,
    },
    config_negocio: {
      promovido: false,
      destacado_directorio: false,
      metodos_pago: ['transferencia'],
      social_links: { instagram: INSTAGRAM },
      order_management_mode: 'whatsapp_manual',
      whatsapp_order_format: 'detailed',
      checkout_currencies: ['COP', 'USD', 'VES'],
      moneda_default: 'COP',
      inicio_menu: {
        redes: true,
        catalogo: true,
        delivery: true,
        ver_menu: false,
        ubicacion: true,
        comer_aqui: true,
        para_llevar: true,
        calificacion: true,
        ver_metodos_pago: true,
      },
      delivery_config: delivery,
      exchange_rates: rates,
      exchange_rate_modes: modes,
      exchange_rate_sources: sources,
    },
  };
}

function digital(name, fields) {
  return JSON.stringify({ name, fields });
}

function paymentRows(comercioId) {
  return [
    {
      comercio_id: comercioId,
      tipo: 'transferencia__usd__1',
      nombre: 'Pago digital: Binance',
      descripcion: 'Pago en USD por Binance.',
      detalles: digital('Binance', [
        {
          type: 'correo',
          label: 'Email',
          value: 'paquecomais2025@gmail.com',
        },
      ]),
    },
    {
      comercio_id: comercioId,
      tipo: 'transferencia__cop__1',
      nombre: 'Pago digital: Bancolombia',
      descripcion: 'Transferencia Bancolombia (PCO).',
      detalles: digital('Bancolombia', [
        { type: 'numero_cuenta', label: 'Nro. Cuenta', value: '08809147364' },
        { type: 'texto', label: 'Tipo', value: 'Ahorro' },
        {
          type: 'texto',
          label: 'Titular',
          value: 'mireya karelis colmenares serrano',
        },
      ]),
    },
    {
      comercio_id: comercioId,
      tipo: 'transferencia__ves__1',
      nombre: 'Pago digital: Pago Móvil',
      descripcion: 'Pago Móvil en bolívares.',
      detalles: digital('Pago Móvil', [
        { type: 'telefono', label: 'Teléfono', value: '+584147292343' },
        { type: 'id', label: 'Cédula', value: 'V-14022843' },
        { type: 'texto', label: 'Banco', value: 'Mercantil' },
      ]),
    },
  ];
}

function parsePrice(raw) {
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) return Math.round(raw);
  const n = Number(String(raw ?? '').replace(/[^\d.]/g, ''));
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

function buildDescription(desc, presentacion, observaciones) {
  const parts = [];
  const d = String(desc || '').trim();
  const p = String(presentacion || '').trim();
  const o = String(observaciones || '').trim();
  if (d) parts.push(d);
  if (p && p.toLowerCase() !== 'unidad' && p.toLowerCase() !== 'no especificada') {
    parts.push(`Presentación: ${p}.`);
  }
  if (o && !/precio visible/i.test(o)) {
    parts.push(o);
  }
  return parts.join(' ').trim();
}

function parseMenu(filePath) {
  const wb = XLSX.readFile(filePath);
  const items = [];

  const general = XLSX.utils.sheet_to_json(wb.Sheets['Menú general'] || {}, {
    defval: '',
    range: 3,
  });
  for (const row of general) {
    const categoria = String(row.Categoría || row.Categoria || '').trim();
    const producto = String(row.Producto || '').trim();
    if (!categoria || !producto) continue;
    const precio = parsePrice(row['Precio (COP)']);
    items.push({
      categoria,
      producto,
      descripcion: buildDescription(
        row['Descripción breve'] || row['Descripcion breve'],
        row.Presentación || row.Presentacion,
        row.Observaciones,
      ),
      precio,
    });
  }

  const pasapalos = XLSX.utils.sheet_to_json(
    wb.Sheets['Pasapalos por cantidad'] || {},
    { defval: '', range: 3 },
  );
  for (const row of pasapalos) {
    const baseCat = String(row.Categoría || row.Categoria || '').trim();
    const productoBase = String(row.Producto || '').trim();
    if (!baseCat || !productoBase) continue;
    const prep = String(row.Preparación || row.Preparacion || '').trim();
    const qty = String(row.Cantidad || '').trim();
    const precio = parsePrice(row['Precio (COP)']);
    const bits = [productoBase];
    if (prep) bits.push(prep);
    if (qty && !/^no indicada$/i.test(qty)) bits.push(qty);
    items.push({
      categoria: `Pasapalos — ${baseCat}`,
      producto: bits.join(' · '),
      descripcion: buildDescription(
        row['Descripción breve'] || row['Descripcion breve'],
        [prep, qty].filter(Boolean).join(' · '),
        row.Observaciones,
      ),
      precio,
    });
  }

  return items;
}

async function main() {
  const menu = parseMenu(XLSX_PATH);
  const withPrice = menu.filter((p) => p.precio != null);
  const withoutPrice = menu.filter((p) => p.precio == null);
  console.log(`Menu rows: ${menu.length} (with price: ${withPrice.length}, missing: ${withoutPrice.length})`);
  if (withoutPrice.length) {
    console.log('Missing price (will create as unavailable):');
    for (const p of withoutPrice) console.log(`  - [${p.categoria}] ${p.producto}`);
  }

  const { data: existing } = await supabase
    .from('comercios')
    .select('id,slug')
    .eq('slug', SLUG)
    .maybeSingle();
  if (existing) {
    console.error(`Slug ${SLUG} already exists (${existing.id}). Aborting.`);
    process.exit(1);
  }

  const { data: napoles, error: napolesErr } = await supabase
    .from('comercios')
    .select('branding_ia')
    .eq('id', NAPOLES_ID)
    .single();
  if (napolesErr) throw napolesErr;

  const { data: doleto, error: doletoErr } = await supabase
    .from('comercios')
    .select(
      'branding_ia,exchange_rate_mode,exchange_rate_source,exchange_rate_value,tasa_cambio_pesos,last_rate_update',
    )
    .eq('id', DOLETO_ID)
    .single();
  if (doletoErr) throw doletoErr;

  const delivery = structuredClone(
    napoles.branding_ia?.config_negocio?.delivery_config || {},
  );
  const doletoCfg = doleto.branding_ia?.config_negocio || {};
  const rates = structuredClone(doletoCfg.exchange_rates || {});
  const modes = structuredClone(doletoCfg.exchange_rate_modes || {});
  const sources = structuredClone(doletoCfg.exchange_rate_sources || {});

  console.log('Delivery zones from Napoles:', delivery?.zones?.length || 0);
  console.log('Coords', LAT, LNG);

  if (dryRun) {
    const cats = [...new Set(menu.map((p) => p.categoria))];
    console.log('Dry run OK. Would create', EMAIL, SLUG, NOMBRE);
    console.log('Categories:', cats.join(', '));
    for (const item of withPrice.slice(0, 12)) {
      console.log(`- [${item.categoria}] ${item.producto} · $${item.precio} COP`);
    }
    if (withPrice.length > 12) console.log(`... +${withPrice.length - 12} more with price`);
    return;
  }

  let ownerId = null;
  const { data: listed } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 500,
  });
  const existingUser = (listed?.users || []).find(
    (u) => (u.email || '').toLowerCase() === EMAIL.toLowerCase(),
  );
  if (existingUser) {
    ownerId = existingUser.id;
    const { error: pwError } = await supabase.auth.admin.updateUserById(ownerId, {
      password: PASSWORD,
      email_confirm: true,
    });
    if (pwError) throw pwError;
    console.log('Owner reused', ownerId, EMAIL);
  } else {
    const { data: createdUser, error: userError } = await supabase.auth.admin.createUser({
      email: EMAIL,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: NOMBRE, commerce_slug: SLUG },
    });
    if (userError) throw userError;
    ownerId = createdUser.user.id;
    console.log('Owner created', ownerId, EMAIL);
  }

  const branding = brandingPayload({ delivery, rates, modes, sources });
  const { data: comercio, error: comercioError } = await supabase
    .from('comercios')
    .insert({
      owner_id: ownerId,
      nombre: NOMBRE,
      slug: SLUG,
      categoria: CATEGORIA,
      color_principal: COLOR,
      direccion: DIRECCION,
      latitud: LAT,
      longitud: LNG,
      whatsapp: WHATSAPP,
      telefonos: WHATSAPP,
      moneda: 'COP',
      moneda_principal: 'COP',
      exchange_rate_quote_currency: 'VES',
      exchange_rate_mode: doleto.exchange_rate_mode || 'auto',
      exchange_rate_source: doleto.exchange_rate_source || 'p2p_binance',
      exchange_rate_value: doleto.exchange_rate_value,
      tasa_cambio_pesos: doleto.tasa_cambio_pesos,
      last_rate_update: doleto.last_rate_update || new Date().toISOString(),
      permite_delivery: true,
      recibe_pedidos_whatsapp: true,
      mostrar_en_directorio_publico: true,
      negocio_virtual: false,
      onboarding_completed: true,
      ai_enabled: true,
      en_linea: false,
      metodos_pago: ['Transferencia'],
      metodo_pago_predeterminado: 'Transferencia',
      estados_operacion: ['tachira'],
      branding_ia: branding,
    })
    .select('id,slug,nombre')
    .single();
  if (comercioError) throw comercioError;
  console.log('Comercio', comercio.id);

  const { error: payErr } = await supabase
    .from('metodos_pago')
    .insert(paymentRows(comercio.id));
  if (payErr) throw payErr;
  console.log('Payment methods inserted (cash COP/USD/VES)');

  const { data: issued, error: issueError } = await supabase.rpc('issue_gift_cards', {
    p_count: 1,
    p_months: 1,
    p_batch_label: 'paquekomais-launch',
    p_expires_at: null,
    p_note: "Activación Pa' Que Komais",
    p_plan_code: 'menu_monthly',
  });
  if (issueError) throw issueError;
  const card = issued?.cards?.[0];
  if (!card?.id || !card?.code) throw new Error('Gift card issue failed');
  console.log('Gift card code:', card.code);

  const { data: grant, error: grantError } = await supabase.rpc('grant_subscription_period', {
    p_business_id: comercio.id,
    p_plan_code: 'menu_monthly',
    p_months: 1,
    p_provider: 'gift_card',
    p_order_id: `gift:${card.id}`,
    p_amount: 0,
    p_currency: 'USD',
  });
  if (grantError) throw grantError;

  const { error: redeemMarkError } = await supabase
    .from('gift_cards')
    .update({
      status: 'redeemed',
      redeemed_by_business: comercio.id,
      redeemed_by_user: ownerId,
      redeemed_at: new Date().toISOString(),
    })
    .eq('id', card.id);
  if (redeemMarkError) throw redeemMarkError;
  console.log('Subscription', grant);

  const { data: catalog, error: catalogError } = await supabase
    .from('catalogos')
    .insert({
      comercio_id: comercio.id,
      nombre: 'Menú principal',
      activo: true,
      orden: 0,
    })
    .select('id')
    .single();
  if (catalogError) throw catalogError;
  console.log('Catalog', catalog.id);

  const cats = [];
  const seenCat = new Set();
  for (const item of menu) {
    if (seenCat.has(item.categoria)) continue;
    seenCat.add(item.categoria);
    cats.push(item.categoria);
  }

  const categoryIds = new Map();
  let ordenCat = 0;
  for (const nombre of cats) {
    const { data: category, error } = await supabase
      .from('categorias')
      .insert({
        comercio_id: comercio.id,
        catalogo_id: catalog.id,
        nombre,
        orden: ordenCat++,
        activo: true,
      })
      .select('id')
      .single();
    if (error) throw error;
    categoryIds.set(nombre, category.id);
  }

  const byCatOrden = new Map();
  let inserted = 0;
  for (const item of menu) {
    const ord = byCatOrden.get(item.categoria) ?? 0;
    byCatOrden.set(item.categoria, ord + 1);
    const hasPrice = item.precio != null;
    const desc = hasPrice
      ? item.descripcion
      : [item.descripcion, 'Precio pendiente de confirmar.'].filter(Boolean).join(' ');
    const { error } = await supabase.from('productos').insert({
      comercio_id: comercio.id,
      categoria_id: categoryIds.get(item.categoria),
      nombre: item.producto,
      descripcion: desc || null,
      precio: hasPrice ? item.precio : 0,
      disponible: hasPrice,
      orden: ord,
      imagen_source_type: 'manual',
    });
    if (error) throw error;
    inserted += 1;
  }
  console.log(`Inserted ${inserted} products in ${cats.length} categories`);

  await supabase
    .from('comercios')
    .update({ en_linea: true, onboarding_completed: true })
    .eq('id', comercio.id);

  console.log('\n=== DONE ===');
  console.log(`URL: https://elmenuxfa.com/v/${SLUG}`);
  console.log(`Admin: https://app.elmenuxfa.com`);
  console.log(`Email: ${EMAIL}`);
  console.log(`Password: ${PASSWORD}`);
  console.log(`WhatsApp: ${WHATSAPP}`);
  console.log(`Instagram: ${INSTAGRAM}`);
  console.log(`Address: ${DIRECCION.replace(/\n/g, ' · ')}`);
  console.log(`Coords: ${LAT}, ${LNG}`);
  console.log(`Delivery zones: ${delivery?.zones?.length || 0} (from Napoles)`);
  console.log(`Gift card (redeemed): ${card.code}`);
  console.log(`Comercio id: ${comercio.id}`);
  console.log(`Products with price: ${withPrice.length} | unavailable (no price): ${withoutPrice.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
