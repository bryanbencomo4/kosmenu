/**
 * Provision "Inversiones Doleto" (slug: inversiones-doleto) from the Táchira
 * liquor menu spreadsheet. Prices in COP. Delivery + COP↔VES 3.1 adjustment
 * copied from auto-pizzas-napoles. No product images.
 *
 * Usage (from site/):
 *   node --env-file=.env.local scripts/provision-inversiones-doleto.mjs --dry-run
 *   node --env-file=.env.local scripts/provision-inversiones-doleto.mjs
 */

import { createClient } from '@supabase/supabase-js';
import { createRequire } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const require = createRequire(import.meta.url);
const XLSX = require('xlsx');

const dryRun = process.argv.includes('--dry-run');
const SLUG = 'inversiones-doleto';
const NOMBRE = 'Inversiones Doleto';
const EMAIL = 'inversiones-doleto@1xp.fr';
const PASSWORD = '123456789';
const WHATSAPP = '+584147001234';
const DIRECCION =
  'Av. Libertador, San Cristóbal 5001, Táchira\nVenezuela\nReferencia: Distribuidora de licores (datos de ejemplo)';
const COLOR = '#C9A227';
const CATEGORIA = 'Licoreria';
const NAPOLES_ID = '72965186-b3b9-4974-85d6-53bef1b4a400';
const XLSX_PATH = resolve(
  process.env.USERPROFILE || '',
  'Downloads/Menu_Licoreria_Tachira_Editable.xlsx',
);
const LOGO_PATH = resolve(
  process.env.USERPROFILE || '',
  '.cursor/projects/c-Users-bryan-Documents-projects-kosmenu-app/assets/c__Users_bryan_AppData_Roaming_Cursor_User_workspaceStorage_53cc2968cfd4bdf0512a57da28cf1ff5_images_image-f5b308bf-ff52-4951-a7f1-f781ab8f10e5.png',
);

const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const mapsKey = (
  process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ||
  process.env.GOOGLE_MAPS_API_KEY ||
  ''
).trim();
if (!url || !serviceKey) {
  console.error('Need NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function parseMenuFromXlsx(filePath) {
  if (!existsSync(filePath)) {
    throw new Error(`Excel not found: ${filePath}`);
  }
  const wb = XLSX.readFile(filePath);
  const sheet = wb.Sheets['Menú COP'] || wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  let currentCategory = null;
  const categories = [];
  const byName = new Map();

  for (const row of rows) {
    const name = String(row[0] || '').trim();
    const desc = String(row[1] || '').trim();
    const priceRaw = row[2];
    if (!name) continue;
    if (
      name === 'PRODUCTO' ||
      name.startsWith('MENÚ') ||
      name.startsWith('Valores') ||
      /^\d+\s+productos/i.test(name)
    ) {
      continue;
    }
    const price =
      typeof priceRaw === 'number'
        ? priceRaw
        : Number(String(priceRaw).replace(/[^0-9.]/g, ''));
    if (!Number.isFinite(price) || price <= 0) {
      currentCategory = name;
      if (!byName.has(currentCategory)) {
        byName.set(currentCategory, []);
        categories.push(currentCategory);
      }
      continue;
    }
    if (!currentCategory) {
      currentCategory = 'General';
      if (!byName.has(currentCategory)) {
        byName.set(currentCategory, []);
        categories.push(currentCategory);
      }
    }
    byName.get(currentCategory).push({
      nombre: name,
      descripcion: desc,
      precio: Math.round(price * 100) / 100,
    });
  }

  return categories.map((nombre) => ({
    nombre,
    productos: byName.get(nombre) || [],
  }));
}

function brandingPayload(napoles) {
  const negocio = structuredClone(napoles.branding_ia?.config_negocio || {});
  const delivery = structuredClone(negocio.delivery_config || {});
  const vesAdj = structuredClone(
    negocio.exchange_rate_adjustments?.VES || {
      enabled: true,
      factor: 1,
      reference_value: 3.1,
      reference_inverted: true,
    },
  );
  vesAdj.reference_value = 3.1;
  vesAdj.reference_inverted = true;
  vesAdj.enabled = true;

  return {
    schema_version: 2,
    color_principal: COLOR,
    color_secundario: '#FFFFFF',
    fuente_titulos: 'Montserrat',
    fuente_cuerpo: 'Open Sans',
    estilo_botones: 'rounded',
    mood_tags: ['premium', 'noche', 'licores', 'tachira'],
    descripcion_visual:
      'Distribuidora de licores Inversiones Doleto — catálogo en pesos colombianos.',
    layout_type: 'grid',
    colores_personalizados: {
      background: '#0B0B0B',
      card_surface: '#161616',
      text_on_primary: '#0B0B0B',
    },
    config_visual: {
      menu_sticky: true,
      show_images: true,
      items_per_row: 2,
    },
    config_negocio: {
      promovido: false,
      destacado_directorio: false,
      metodos_pago: ['efectivo', 'pago móvil', 'transferencia'],
      order_management_mode: 'whatsapp_manual',
      whatsapp_order_format: 'detailed',
      checkout_currencies: ['COP', 'USD', 'VES'],
      moneda_default: 'COP',
      inicio_menu: {
        redes: false,
        catalogo: true,
        delivery: true,
        ver_menu: false,
        ubicacion: true,
        comer_aqui: false,
        para_llevar: true,
        calificacion: true,
        ver_metodos_pago: true,
      },
      delivery_config: delivery,
      exchange_rates: {
        VES: Number(negocio.exchange_rates?.VES) || 0.16160134840435733,
      },
      exchange_rate_modes: {
        VES: 'auto',
        USD: 'auto',
      },
      exchange_rate_sources: {
        VES: negocio.exchange_rate_sources?.VES || 'p2p_binance',
        USD: 'google',
      },
      exchange_rate_adjustments: {
        VES: vesAdj,
      },
    },
  };
}

function examplePaymentMethods(comercioId) {
  return [
    {
      comercio_id: comercioId,
      tipo: 'efectivo__cop',
      nombre: 'Efectivo COP',
      descripcion: 'Pago en efectivo en pesos colombianos.',
      detalles: 'Datos de ejemplo. Usa billetes en buen estado.',
    },
    {
      comercio_id: comercioId,
      tipo: 'transferencia__cop__1',
      nombre: 'Pago digital: Bancolombia',
      descripcion: 'Transferencia Bancolombia (ejemplo).',
      detalles: JSON.stringify({
        name: 'Bancolombia',
        fields: [
          { type: 'numero_cuenta', label: 'Nro. Cuenta', value: '00000000000' },
          { type: 'texto', label: 'Tipo', value: 'Ahorro' },
          { type: 'texto', label: 'Titular', value: 'Inversiones Doleto (ejemplo)' },
        ],
      }),
    },
    {
      comercio_id: comercioId,
      tipo: 'efectivo__usd',
      nombre: 'Efectivo USD',
      descripcion: 'Pago en efectivo en dólares.',
      detalles: 'Datos de ejemplo.',
    },
    {
      comercio_id: comercioId,
      tipo: 'transferencia__usd__1',
      nombre: 'Pago digital: Zelle',
      descripcion: 'Zelle (ejemplo).',
      detalles: JSON.stringify({
        name: 'Zelle',
        fields: [
          { type: 'correo', label: 'Correo', value: 'pagos.doleto@example.com' },
          { type: 'texto', label: 'Titular', value: 'Inversiones Doleto' },
        ],
      }),
    },
    {
      comercio_id: comercioId,
      tipo: 'transferencia__usd__2',
      nombre: 'Pago digital: PayPal',
      descripcion: 'PayPal (ejemplo).',
      detalles: JSON.stringify({
        name: 'PayPal',
        fields: [
          { type: 'correo', label: 'Correo', value: 'paypal.doleto@example.com' },
          { type: 'texto', label: 'Titular', value: 'Inversiones Doleto' },
        ],
      }),
    },
    {
      comercio_id: comercioId,
      tipo: 'efectivo__ves',
      nombre: 'Efectivo VES',
      descripcion: 'Pago en efectivo en bolívares.',
      detalles: 'Datos de ejemplo.',
    },
    {
      comercio_id: comercioId,
      tipo: 'transferencia__ves__1',
      nombre: 'Pago digital: Pago Móvil',
      descripcion: 'Pago Móvil (ejemplo).',
      detalles: JSON.stringify({
        name: 'Pago Móvil',
        fields: [
          { type: 'telefono', label: 'Telf', value: '+584140000000' },
          { type: 'id', label: 'Cédula', value: 'V-00000000' },
          { type: 'texto', label: 'Banco', value: 'Venezuela' },
        ],
      }),
    },
  ];
}

async function geocode(address) {
  // San Cristóbal, Táchira fallback
  if (!mapsKey) return { lat: 7.7669, lng: -72.225 };
  const uri = new URL('https://maps.googleapis.com/maps/api/geocode/json');
  uri.searchParams.set('address', address);
  uri.searchParams.set('region', 've');
  uri.searchParams.set('language', 'es');
  uri.searchParams.set('key', mapsKey);
  const res = await fetch(uri);
  const json = await res.json();
  const loc = json?.results?.[0]?.geometry?.location;
  if (!loc) return { lat: 7.7669, lng: -72.225 };
  return { lat: loc.lat, lng: loc.lng };
}

async function main() {
  const menu = parseMenuFromXlsx(XLSX_PATH);
  const productCount = menu.reduce((n, c) => n + c.productos.length, 0);
  console.log(`Menu: ${menu.length} categories, ${productCount} products`);
  for (const cat of menu) {
    console.log(`  · ${cat.nombre}: ${cat.productos.length}`);
  }

  const { data: napoles, error: napolesErr } = await supabase
    .from('comercios')
    .select(
      'exchange_rate_mode,exchange_rate_source,exchange_rate_value,exchange_rate_quote_currency,last_rate_update,branding_ia,moneda,moneda_principal',
    )
    .eq('id', NAPOLES_ID)
    .single();
  if (napolesErr) throw napolesErr;

  const adj = napoles.branding_ia?.config_negocio?.exchange_rate_adjustments?.VES;
  console.log('Napoles VES adjustment', adj);
  console.log(
    'Delivery zones',
    napoles.branding_ia?.config_negocio?.delivery_config?.zones?.length,
  );

  const { data: existing } = await supabase
    .from('comercios')
    .select('id,slug')
    .eq('slug', SLUG)
    .maybeSingle();
  if (existing) {
    console.error(`Slug ${SLUG} already exists (${existing.id}). Aborting.`);
    process.exit(1);
  }

  const coords = await geocode(
    'Avenida Libertador, San Cristóbal, Táchira, Venezuela',
  );
  console.log('Geocode', coords);

  if (dryRun) {
    console.log('Dry run OK. Would create', EMAIL, SLUG);
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
    const { data: createdUser, error: userError } =
      await supabase.auth.admin.createUser({
        email: EMAIL,
        password: PASSWORD,
        email_confirm: true,
        user_metadata: { full_name: NOMBRE, commerce_slug: SLUG },
      });
    if (userError) throw userError;
    ownerId = createdUser.user.id;
    console.log('Owner created', ownerId, EMAIL);
  }

  const branding = brandingPayload(napoles);
  const { data: comercio, error: comercioError } = await supabase
    .from('comercios')
    .insert({
      owner_id: ownerId,
      nombre: NOMBRE,
      slug: SLUG,
      categoria: CATEGORIA,
      color_principal: COLOR,
      direccion: DIRECCION,
      latitud: coords.lat,
      longitud: coords.lng,
      whatsapp: WHATSAPP,
      moneda: 'COP',
      moneda_principal: 'COP',
      exchange_rate_quote_currency: 'VES',
      exchange_rate_mode: 'auto',
      exchange_rate_source:
        napoles.branding_ia?.config_negocio?.exchange_rate_sources?.VES ||
        'p2p_binance',
      exchange_rate_value:
        Number(napoles.branding_ia?.config_negocio?.exchange_rates?.VES) ||
        0.16160134840435733,
      last_rate_update: napoles.last_rate_update || new Date().toISOString(),
      permite_delivery: true,
      recibe_pedidos_whatsapp: true,
      mostrar_en_directorio_publico: true,
      negocio_virtual: false,
      onboarding_completed: true,
      ai_enabled: true,
      en_linea: false,
      metodos_pago: ['Efectivo', 'Transferencia', 'Pago Móvil'],
      estados_operacion: ['tachira'],
      branding_ia: branding,
    })
    .select('id,slug,nombre')
    .single();
  if (comercioError) throw comercioError;
  console.log('Comercio', comercio.id);

  if (existsSync(LOGO_PATH)) {
    const bytes = readFileSync(LOGO_PATH);
    const objectPath = `${ownerId}/${SLUG}_${Date.now()}.png`;
    const { error: upErr } = await supabase.storage
      .from('logos-comercios')
      .upload(objectPath, bytes, {
        contentType: 'image/png',
        upsert: true,
      });
    if (upErr) {
      console.warn('Logo upload failed:', upErr.message);
    } else {
      const logoUrl = supabase.storage
        .from('logos-comercios')
        .getPublicUrl(objectPath).data.publicUrl;
      await supabase
        .from('comercios')
        .update({ logo_url: logoUrl })
        .eq('id', comercio.id);
      console.log('Logo', logoUrl);
    }
  } else {
    console.warn('Logo file not found:', LOGO_PATH);
  }

  const { error: payErr } = await supabase
    .from('metodos_pago')
    .insert(examplePaymentMethods(comercio.id));
  if (payErr) throw payErr;
  console.log('Payment methods inserted');

  const { data: issued, error: issueError } = await supabase.rpc(
    'issue_gift_cards',
    {
      p_count: 1,
      p_months: 1,
      p_batch_label: 'inversiones-doleto-launch',
      p_expires_at: null,
      p_note: 'Activación Inversiones Doleto',
      p_plan_code: 'menu_monthly',
    },
  );
  if (issueError) throw issueError;
  const card = issued?.cards?.[0];
  if (!card?.id || !card?.code) throw new Error('Gift card issue failed');
  console.log('Gift card code:', card.code);

  const { data: grant, error: grantError } = await supabase.rpc(
    'grant_subscription_period',
    {
      p_business_id: comercio.id,
      p_plan_code: 'menu_monthly',
      p_months: 1,
      p_provider: 'gift_card',
      p_order_id: `gift:${card.id}`,
      p_amount: 0,
      p_currency: 'USD',
    },
  );
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

  let ordenCat = 0;
  let inserted = 0;
  for (const cat of menu) {
    const { data: category, error: catError } = await supabase
      .from('categorias')
      .insert({
        comercio_id: comercio.id,
        catalogo_id: catalog.id,
        nombre: cat.nombre,
        orden: ordenCat++,
        activo: true,
      })
      .select('id')
      .single();
    if (catError) throw catError;

    let ordenProd = 0;
    // Insert in chunks to avoid payload limits
    const chunkSize = 50;
    for (let i = 0; i < cat.productos.length; i += chunkSize) {
      const slice = cat.productos.slice(i, i + chunkSize);
      const rows = slice.map((p) => ({
        comercio_id: comercio.id,
        categoria_id: category.id,
        nombre: p.nombre,
        descripcion: p.descripcion ?? '',
        precio: p.precio,
        disponible: true,
        orden: ordenProd++,
      }));
      const { error: prodError } = await supabase.from('productos').insert(rows);
      if (prodError) throw prodError;
      inserted += rows.length;
    }
    console.log(`  + ${cat.nombre}: ${cat.productos.length}`);
  }

  await supabase
    .from('comercios')
    .update({ en_linea: true, onboarding_completed: true })
    .eq('id', comercio.id);

  console.log('\n=== DONE ===');
  console.log(`Menu: ${inserted} products (no images)`);
  console.log(
    `VES ref 3.1 inverted · delivery zones: ${branding.config_negocio.delivery_config?.zones?.length || 0}`,
  );
  console.log(`URL: https://elmenuxfa.com/v/${SLUG}`);
  console.log(`Email: ${EMAIL}`);
  console.log(`Password: ${PASSWORD}`);
  console.log(`Gift card (redeemed): ${card.code}`);
  console.log(`Comercio id: ${comercio.id}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
