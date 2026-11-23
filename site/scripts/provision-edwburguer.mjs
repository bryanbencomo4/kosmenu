/**
 * Provision "Edw Burguer SC" (slug: edwburguer) from the client's menu board.
 * Prices are approximate COP (PCO). Delivery copied from auto-pizzas-napoles.
 * FX mirrors Inversiones Doleto. Payment rows are test data for COP, USD and VES.
 * Home screen hides payment methods. Pre-checkout ventas sugeridas enabled.
 *
 * Usage (from site/):
 *   node --env-file=.env.local scripts/provision-edwburguer.mjs --dry-run
 *   node --env-file=.env.local scripts/provision-edwburguer.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const dryRun = process.argv.includes('--dry-run');
const SLUG = 'edwburguer';
const NOMBRE = 'Edw Burguer SC';
const EMAIL = 'edwburguer@1xp.fr';
const PASSWORD = '123456789';
const WHATSAPP = '+584247314128';
const INSTAGRAM = 'https://www.instagram.com/edwburguer.sc/';
const DIRECCION =
  'Barrio Obrero, San Cristóbal, Táchira, Venezuela\nReferencia: Edw Burguer SC — hamburguesas gourmet';
const COLOR = '#9A1B1B';
const CATEGORIA = 'Hamburguesas';
const NAPOLES_ID = '72965186-b3b9-4974-85d6-53bef1b4a400';
const DOLETO_ID = '85f14385-c187-407a-841f-a05dfd0c46fc';
const LOGO_PATH = resolve(
  process.env.USERPROFILE || '',
  '.cursor/projects/c-Users-bryan-Documents-projects-kosmenu-app/assets/c__Users_bryan_AppData_Roaming_Cursor_User_workspaceStorage_53cc2968cfd4bdf0512a57da28cf1ff5_images_image-92f2401a-e85a-4d0a-9726-2448b9f3eabc.jpg',
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

/** Approximate gourmet-burger prices in COP for San Cristóbal. */
const MENU = [
  {
    nombre: 'Hamburguesas clásicas',
    rol: 'main',
    productos: [
      {
        nombre: 'Classic',
        precio: 18000,
        descripcion:
          'Pan brioche, carne de solomo jugosa, cheddar, vegetales, pepinillos y salsa.',
      },
      {
        nombre: 'Cheeseburger',
        precio: 20000,
        descripcion:
          'Pan brioche, solomo jugoso, doble cheddar, cebolla en cuadritos, pepinillos y salsas de la casa.',
      },
      {
        nombre: 'Double Cheddar & Bacon',
        precio: 28000,
        descripcion:
          'Pan brioche, dos carnes de solomo, extra cheddar, tocineta y salsas.',
      },
      {
        nombre: 'Hawaiana Tropical',
        precio: 24000,
        descripcion:
          'Pan brioche, solomo jugoso, piña fresca caramelizada, cheddar, vegetales y salsas.',
      },
      {
        nombre: 'Lunch Bowl',
        precio: 22000,
        descripcion:
          'Base de papas fritas, pollo crispy, ensalada fresca, queso rallado y maíz.',
      },
    ],
  },
  {
    nombre: 'Hamburguesas especiales',
    rol: 'main',
    productos: [
      {
        nombre: 'Oklahoma',
        precio: 32000,
        descripcion:
          'Pan brioche, dos carnes de solomo, cebolla en juliana, tocineta, cheddar, pepinillos y salsas.',
      },
      {
        nombre: 'Crispy',
        precio: 24000,
        descripcion:
          'Pan brioche, pollo crispy, cheddar, tocineta, vegetales, pepinillos y salsas.',
      },
      {
        nombre: 'Chuleta',
        precio: 26000,
        descripcion:
          'Pan brioche, chuleta ahumada, vegetales, salsa y queso cheddar.',
      },
      {
        nombre: 'Criolla',
        precio: 28000,
        descripcion:
          'Pan brioche, carne mechada, vegetales, maíz, huevo, aguacate y salsas.',
      },
      {
        nombre: 'Hamburguesa Mixta',
        precio: 32000,
        descripcion:
          'Pan brioche, carne de solomo, chuleta ahumada, vegetales, cheddar y salsas.',
      },
      {
        nombre: 'Burger Wrap',
        precio: 20000,
        descripcion:
          'Tortilla tostada, pollo crispy, queso cheddar, vegetales y salsas.',
      },
      {
        nombre: 'Perro Caliente',
        precio: 14000,
        descripcion:
          'Salchicha jumbo, pan artesanal, cebolla picada, papas hilo, queso rallado y salsa de la casa.',
      },
    ],
  },
  {
    nombre: 'Acompañamientos',
    rol: 'side',
    productos: [
      {
        nombre: 'Cheese Fries',
        precio: 14000,
        descripcion: 'Papas francesas, queso cheddar, tocineta y pollo crispy.',
      },
      {
        nombre: 'Crispy Onion Rings',
        precio: 10000,
        descripcion: 'Aros de cebolla crujientes con salsa BBQ de la casa.',
      },
      {
        nombre: 'Alitas a la Broster',
        precio: 22000,
        descripcion:
          'Alitas crujientes estilo broaster, papas francesas y salsa recién hecha.',
      },
    ],
  },
];

function buildHorarios() {
  const day = { open: true, ranges: [{ start: '15:00', end: '23:00' }] };
  return {
    timezone: 'America/Caracas',
    days: {
      monday: day,
      tuesday: day,
      wednesday: day,
      thursday: day,
      friday: day,
      saturday: day,
      sunday: day,
    },
  };
}

function digital(name, fields) {
  return JSON.stringify({ name, fields });
}

function brandingPayload({ delivery, rates, modes, sources, adj }) {
  return {
    schema_version: 2,
    color_principal: COLOR,
    color_secundario: '#F3E2C2',
    fuente_titulos: 'Montserrat',
    fuente_cuerpo: 'Open Sans',
    estilo_botones: 'rounded',
    mood_tags: ['burgers', 'gourmet', 'delivery', 'tachira'],
    descripcion_visual:
      'Edw Burguer SC — hamburguesas gourmet en Barrio Obrero, San Cristóbal.',
    layout_type: 'grid',
    colores_personalizados: {
      background: '#FFF8F2',
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
      metodos_pago: ['efectivo', 'transferencia'],
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
        ver_metodos_pago: false,
      },
      delivery_config: delivery,
      exchange_rates: rates,
      exchange_rate_modes: modes,
      exchange_rate_sources: sources,
      exchange_rate_adjustments: adj || undefined,
    },
  };
}

function paymentRows(comercioId) {
  return [
    {
      comercio_id: comercioId,
      tipo: 'efectivo__cop',
      nombre: 'Efectivo',
      descripcion: 'Pago en efectivo en pesos colombianos (PCO). Datos de prueba.',
      detalles: 'Datos de ejemplo. Usa billetes en buen estado.',
    },
    {
      comercio_id: comercioId,
      tipo: 'transferencia__cop__1',
      nombre: 'Pago digital: Bancolombia',
      descripcion: 'Transferencia Bancolombia (datos de prueba).',
      detalles: digital('Bancolombia', [
        { type: 'numero_cuenta', label: 'Nro. Cuenta', value: '00000000000' },
        { type: 'texto', label: 'Tipo', value: 'Ahorro' },
        { type: 'texto', label: 'Titular', value: 'Edw Burguer SC (ejemplo)' },
      ]),
    },
    {
      comercio_id: comercioId,
      tipo: 'efectivo__usd',
      nombre: 'Efectivo',
      descripcion: 'Pago en efectivo en dólares. Datos de prueba.',
      detalles: 'Datos de ejemplo.',
    },
    {
      comercio_id: comercioId,
      tipo: 'transferencia__usd__1',
      nombre: 'Pago digital: Zelle',
      descripcion: 'Zelle (datos de prueba).',
      detalles: digital('Zelle', [
        { type: 'correo', label: 'Correo', value: 'pagos.edwburguer@example.com' },
        { type: 'texto', label: 'Titular', value: 'Edw Burguer SC (ejemplo)' },
      ]),
    },
    {
      comercio_id: comercioId,
      tipo: 'efectivo__ves',
      nombre: 'Efectivo',
      descripcion: 'Pago en efectivo en bolívares. Datos de prueba.',
      detalles: 'Datos de ejemplo.',
    },
    {
      comercio_id: comercioId,
      tipo: 'transferencia__ves__1',
      nombre: 'Pago digital: Pago Móvil',
      descripcion: 'Pago Móvil (datos de prueba).',
      detalles: digital('Pago Móvil', [
        { type: 'telefono', label: 'Telf', value: '+584240000000' },
        { type: 'id', label: 'Cédula', value: 'V-00000000' },
        { type: 'texto', label: 'Banco', value: 'Venezuela' },
      ]),
    },
  ];
}

async function geocode() {
  const fallback = { lat: 7.7669, lng: -72.225 };
  if (!mapsKey) return fallback;
  const uri = new URL('https://maps.googleapis.com/maps/api/geocode/json');
  uri.searchParams.set(
    'address',
    'Barrio Obrero, San Cristóbal, Táchira, Venezuela',
  );
  uri.searchParams.set('region', 've');
  uri.searchParams.set('language', 'es');
  uri.searchParams.set('key', mapsKey);
  const res = await fetch(uri);
  const json = await res.json();
  const loc = json?.results?.[0]?.geometry?.location;
  if (!loc) return fallback;
  return { lat: loc.lat, lng: loc.lng };
}

async function main() {
  const productCount = MENU.reduce((n, c) => n + c.productos.length, 0);
  console.log(`Menu: ${MENU.length} categories, ${productCount} products`);

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
  const adj = structuredClone(doletoCfg.exchange_rate_adjustments || {});

  console.log(
    'Delivery zones from Napoles:',
    (delivery?.zones || []).map((z) => `${z.name || z.nombre || z.id}: ${z.cost ?? z.precio ?? z.price}`),
  );
  console.log('FX from Doleto:', { rates, modes, sources, adj });

  const coords = await geocode();
  console.log('Coords', coords);
  console.log('Logo exists:', existsSync(LOGO_PATH));

  if (dryRun) {
    console.log('Dry run OK. Would create', EMAIL, SLUG, NOMBRE);
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
    const { error: pwError } = await supabase.auth.admin.updateUserById(
      ownerId,
      { password: PASSWORD, email_confirm: true },
    );
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

  const branding = brandingPayload({ delivery, rates, modes, sources, adj });
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
      metodos_pago: ['Efectivo', 'Transferencia'],
      metodo_pago_predeterminado: 'Efectivo',
      estados_operacion: ['tachira'],
      horarios: buildHorarios(),
      branding_ia: branding,
    })
    .select('id,slug,nombre')
    .single();
  if (comercioError) throw comercioError;
  console.log('Comercio', comercio.id);

  if (existsSync(LOGO_PATH)) {
    const bytes = readFileSync(LOGO_PATH);
    const objectPath = `${ownerId}/${SLUG}_${Date.now()}.jpg`;
    const { error: upErr } = await supabase.storage
      .from('logos-comercios')
      .upload(objectPath, bytes, {
        contentType: 'image/jpeg',
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
    .insert(paymentRows(comercio.id));
  if (payErr) throw payErr;
  console.log('Payment methods inserted');

  const { data: issued, error: issueError } = await supabase.rpc(
    'issue_gift_cards',
    {
      p_count: 1,
      p_months: 1,
      p_batch_label: 'edwburguer-launch',
      p_expires_at: null,
      p_note: 'Activación Edw Burguer SC',
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
  console.log('Subscription', grant?.period_end || grant);

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

  const categoryIds = new Map();
  let ordenCat = 0;
  for (const cat of MENU) {
    const { data: category, error } = await supabase
      .from('categorias')
      .insert({
        comercio_id: comercio.id,
        catalogo_id: catalog.id,
        nombre: cat.nombre,
        orden: ordenCat++,
        activo: true,
        rol: cat.rol,
      })
      .select('id')
      .single();
    if (error) throw error;
    categoryIds.set(cat.nombre, category.id);

    let ordenProd = 0;
    const rows = cat.productos.map((p) => ({
      comercio_id: comercio.id,
      categoria_id: category.id,
      nombre: p.nombre,
      descripcion: p.descripcion,
      precio: p.precio,
      disponible: true,
      orden: ordenProd++,
    }));
    const { error: prodError } = await supabase.from('productos').insert(rows);
    if (prodError) throw prodError;
    console.log(`  + ${cat.nombre}: ${rows.length}`);
  }

  const sidesId = categoryIds.get('Acompañamientos');
  const suggestionKinds = ['acompanamiento'];
  const reglas = [...categoryIds.entries()].map(([nombre, categoria_id]) => ({
    categoria_id,
    categoria_origen: nombre,
    sugerir_tipos: suggestionKinds,
  }));
  const upsell_config = {
    upselling: true,
    pre_checkout: {
      activo: true,
      tipos: suggestionKinds,
      max_productos: 12,
      categorias: [{ id: sidesId, tipo: 'acompanamiento' }],
      reglas,
    },
  };

  const { error: upsellErr } = await supabase
    .from('comercios')
    .update({
      upsell_config,
      en_linea: true,
      onboarding_completed: true,
      updated_at: new Date().toISOString(),
    })
    .eq('id', comercio.id);
  if (upsellErr) throw upsellErr;

  const { error: settingsErr } = await supabase.from('upsell_settings').upsert(
    {
      comercio_id: comercio.id,
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
  console.log('Upsell enabled');

  console.log('\n=== DONE ===');
  console.log(`URL: https://elmenuxfa.com/v/${SLUG}`);
  console.log(`Admin: https://app.elmenuxfa.com`);
  console.log(`Email: ${EMAIL}`);
  console.log(`Password: ${PASSWORD}`);
  console.log(`WhatsApp: ${WHATSAPP}`);
  console.log(`Instagram: ${INSTAGRAM}`);
  console.log(`Products: ${productCount}`);
  console.log(`Delivery zones: ${delivery?.zones?.length || 0} (from Napoles)`);
  console.log(`Gift card (redeemed): ${card.code}`);
  console.log(`Comercio id: ${comercio.id}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
