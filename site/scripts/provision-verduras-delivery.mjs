/**
 * Provision "Verduras Delivery" (slug: verduras-delivery):
 * auth user, comercio, logo, gift card, payments, menu (Bs→USD BCV),
 * Alegria delivery zones + exchange rate.
 *
 * Usage (from site/):
 *   node --env-file=.env.local scripts/provision-verduras-delivery.mjs --dry-run
 *   node --env-file=.env.local scripts/provision-verduras-delivery.mjs
 */

import { createClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const dryRun = process.argv.includes('--dry-run');
const SLUG = 'verduras-delivery';
const NOMBRE = 'Verduras Delivery';
const EMAIL = 'verduras-delivery@1xp.fr';
const PASSWORD = '123456789';
const WHATSAPP = '+584120706627';
const DIRECCION =
  'Urbanización Urdaneta\nMaracaibo 4001, Zulia\nVenezuela\nReferencia: Urb. Urdaneta, Avenida Principal, Vereda 23';
const COLOR = '#2F8F46';
const CATEGORIA = 'Abastos y minimarket';
const ALEGRIA_ID = '51a4be30-27b6-4e53-8761-9fddc9837790';
const LOGO_PATH = resolve(
  process.env.USERPROFILE || '',
  '.cursor/projects/c-Users-bryan-Documents-projects-kosmenu-app/assets/c__Users_bryan_AppData_Roaming_Cursor_User_workspaceStorage_53cc2968cfd4bdf0512a57da28cf1ff5_images_image-c665d43b-d42a-488c-954d-6b86b41230b6.png',
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

function oid(prefix) {
  return `${prefix}_${randomBytes(4).toString('hex')}`;
}

function usdFromBs(bs, rate) {
  const n = Number(bs) / Number(rate);
  return Math.round(n * 100) / 100;
}

function withUnitChoice({ nombre, bs1, unit1, bs2, unit2, rate }) {
  const base = usdFromBs(bs1, rate);
  const total2 = usdFromBs(bs2, rate);
  const delta = Math.round((total2 - base) * 100) / 100;
  return {
    nombre,
    precio: base,
    descripcion: PRODUCT_DESC.Cambur,
    opciones_menu: {
      activadas: true,
      grupos: [
        {
          id: oid('g'),
          nombre: 'Presentación',
          tipo: 'unica',
          obligatorio: true,
          min: 1,
          max: 1,
          opciones: [
            {
              id: oid('o'),
              nombre: unit1,
              precio: 0,
              activo: true,
              predeterminada: true,
            },
            {
              id: oid('o'),
              nombre: unit2,
              precio: delta,
              activo: true,
            },
          ],
        },
      ],
    },
  };
}

const PRODUCT_DESC = {
  Papa: 'Papa blanca fresca, ideal para hervir, freír o guisar. Venta por kilogramo.',
  Zanahoria:
    'Zanahoria fresca y crujiente, perfecta para sopas, jugos o ensaladas. Venta por kilogramo.',
  Cebolla:
    'Cebolla fresca de buen tamaño, base esencial para sofritos y guisos. Venta por kilogramo.',
  Tomate:
    'Tomate maduro y jugoso, ideal para ensaladas, salsas y jugos. Venta por kilogramo.',
  Pimentón:
    'Pimentón fresco, dulce y aromático para rellenos, guisos y asados. Venta por kilogramo.',
  Ají: 'Ají fresco para dar picante y sabor a tus comidas. Venta por kilogramo.',
  Apio: 'Apio fresco, ideal para sopas, jugos verdes y sofritos. Venta por kilogramo.',
  Batata:
    'Batata fresca, dulce y versátil para hervir, asar o freír. Venta por kilogramo.',
  Ocumo: 'Ocumo fresco, típico para sopas y hervidos criollos. Venta por kilogramo.',
  Remolacha:
    'Remolacha fresca, ideal para ensaladas, jugos y guarniciones. Venta por kilogramo.',
  Pepino:
    'Pepino fresco y crocante, perfecto para ensaladas y acompañamientos. Venta por kilogramo.',
  Calabacín:
    'Calabacín tierno, ideal para guisos, saltados y cremas. Venta por kilogramo.',
  'Lechuga Americana':
    'Lechuga americana fresca y crujiente, lista para ensaladas y wraps. Venta por kilogramo.',
  Jojoto: 'Jojoto tierno y dulce, perfecto para hervir o asar. Precio por unidad.',
  Plátano:
    'Plátano verde o maduro según disponibilidad, ideal para tostones, patacones o frito. Precio por unidad.',
  'Aguacate polo':
    'Aguacate polo cremoso, ideal para arepas, ensaladas y guacamole. Precio por unidad.',
  Cambur: 'Cambur maduro y dulce. Elige 1 kg o el paquete de 2 kg.',
  Limón:
    'Limón fresco y jugoso para aderezos, jugos y marinados. Venta por kilogramo.',
  Coco: 'Coco fresco, ideal para jugos, postres y cocina criolla. Precio por unidad.',
  Mora: 'Mora fresca, perfecta para jugos, merengadas y postres. Precio por bolsa.',
  'Manzana roja':
    'Manzana roja pequeña, crujiente y dulce. Precio por unidad.',
  'Manzana verde':
    'Manzana verde fresca, ácida y crocante. Precio por unidad.',
  Repollo:
    'Repollo fresco, ideal para ensaladas, guisos y acompañamientos. Venta por kilogramo.',
  Auyama:
    'Auyama fresca, perfecta para sopas, cremas y hervidos. Venta por kilogramo.',
  Yuca: 'Yuca fresca, ideal para hervir, freír o acompañar platos criollos. Venta por kilogramo.',
  Topocho:
    'Topocho fresco, típico para tostones y acompañamientos. Venta por kilogramo.',
  Lechosa:
    'Lechosa madura y dulce, ideal para comer fresca o en jugos. Venta por kilogramo.',
  Melón:
    'Melón dulce y jugoso, perfecto para postres y ensaladas de frutas. Venta por kilogramo.',
  Cebollín:
    'Cebollín fresco para adornar y aromatizar guisos, carnes y ensaladas. Venta por kilogramo.',
  Cilantro:
    'Cilantro fresco y aromático para salsas, sopas y aderezos. Venta por kilogramo.',
  Celery:
    'Celery (apio europeo) fresco, ideal para jugos y ensaladas. Venta por kilogramo.',
  'Ajo Porro':
    'Ajo porro fresco, suave y aromático para sopas y sofritos. Venta por kilogramo.',
  Aliño: 'Aliño listo para sazonar carnes, pollo y guisos.',
  Adobo: 'Adobo en polvo para marinar y sazonar carnes y aves.',
  Comino: 'Comino molido, aroma intenso para guisos, carnes y arroz.',
  Carmencita: 'Mezcla Carmencita para sazonar platos del día a día.',
  Curry: 'Curry en polvo, ideal para guisos, pollo y arroces.',
  Cúrcuma: 'Cúrcuma en polvo, color y sabor para guisos y marinados.',
  Paprika: 'Paprika (pimentón dulce) para dar color y sabor suave.',
  Pimienta: 'Pimienta molida para sazonar al gusto.',
  'Orégano entero':
    'Orégano entero aromático para pizzas, carnes y salsas.',
  Bicarbonato: 'Bicarbonato de sodio para cocina y uso doméstico.',
  'Polvo royal':
    'Polvo de hornear (royal) para tortas y masas esponjosas.',
  'Ácido Bórico':
    'Ácido bórico para uso doméstico según indicaciones del envase.',
  Clavito: 'Clavo de olor entero, ideal para guisos, postres y marinados.',
  'Canela molida':
    'Canela molida para postres, bebidas y recetas dulces.',
};

const WEIGHT_SALE = {
  unidad: 'kg',
  paso: 0.05,
  minimo: 0.1,
  maximo: 25,
};

function buildMenu(rate) {
  const item = (nombre, bs, { byWeight = false } = {}) => ({
    nombre,
    precio: usdFromBs(bs, rate),
    descripcion: PRODUCT_DESC[nombre] || nombre,
    ...(byWeight ? { opciones_menu: { venta_por_peso: WEIGHT_SALE } } : {}),
  });

  return [
    {
      nombre: 'Verduras y Frutas',
      productos: [
        item('Papa', 1700, { byWeight: true }),
        item('Zanahoria', 1300, { byWeight: true }),
        item('Cebolla', 1800, { byWeight: true }),
        item('Tomate', 3000, { byWeight: true }),
        item('Pimentón', 1600, { byWeight: true }),
        item('Ají', 2500, { byWeight: true }),
        item('Apio', 2600, { byWeight: true }),
        item('Batata', 2600, { byWeight: true }),
        item('Ocumo', 2600, { byWeight: true }),
        item('Remolacha', 1500, { byWeight: true }),
        item('Pepino', 1500, { byWeight: true }),
        item('Calabacín', 1500, { byWeight: true }),
        item('Lechuga Americana', 2500, { byWeight: true }),
        item('Jojoto', 600),
        item('Plátano', 700),
        item('Aguacate polo', 2000),
        {
          ...withUnitChoice({
            nombre: 'Cambur',
            bs1: 650,
            unit1: '1 Kg',
            bs2: 1000,
            unit2: '2 Kg',
            rate,
          }),
          descripcion: PRODUCT_DESC.Cambur,
        },
        item('Limón', 3500, { byWeight: true }),
        item('Coco', 1200),
        item('Mora', 900),
        item('Manzana roja', 450),
        item('Manzana verde', 450),
        item('Repollo', 800, { byWeight: true }),
        item('Auyama', 900, { byWeight: true }),
        item('Yuca', 1000, { byWeight: true }),
        item('Topocho', 700, { byWeight: true }),
        item('Lechosa', 1600, { byWeight: true }),
        item('Melón', 2000, { byWeight: true }),
        item('Cebollín', 2000, { byWeight: true }),
        item('Cilantro', 4000, { byWeight: true }),
        item('Celery', 2000, { byWeight: true }),
        item('Ajo Porro', 2000, { byWeight: true }),
      ],
    },
    // Granos: no disponible — omitimos categoría vacía
    {
      nombre: 'Condimentos y Otros',
      productos: [
        item('Aliño', 300),
        item('Adobo', 300),
        item('Comino', 300),
        item('Carmencita', 300),
        item('Curry', 300),
        item('Cúrcuma', 500),
        item('Paprika', 500),
        item('Pimienta', 300),
        item('Orégano entero', 300),
        item('Bicarbonato', 300),
        item('Polvo royal', 300),
        item('Ácido Bórico', 500),
        item('Clavito', 500),
        item('Canela molida', 300),
      ],
    },
  ];
}

function brandingPayload(alegria, rate) {
  const delivery = structuredClone(
    alegria.branding_ia?.config_negocio?.delivery_config || {},
  );
  return {
    schema_version: 2,
    color_principal: COLOR,
    color_secundario: '#F4A261',
    fuente_titulos: 'Montserrat',
    fuente_cuerpo: 'Open Sans',
    estilo_botones: 'rounded',
    mood_tags: ['fresco', 'natural', 'saludable', 'cercano'],
    descripcion_visual:
      'Verduras y frutas frescas a domicilio en Maracaibo.',
    layout_type: 'grid',
    colores_personalizados: {
      background: '#F7FBF5',
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
      metodos_pago: ['efectivo'],
      order_management_mode: 'whatsapp_manual',
      whatsapp_order_format: 'detailed',
      checkout_currencies: ['USD', 'VES'],
      moneda_default: 'USD',
      inicio_menu: {
        redes: false,
        catalogo: false,
        delivery: true,
        ver_menu: false,
        ubicacion: true,
        comer_aqui: false,
        para_llevar: true,
        calificacion: true,
        ver_metodos_pago: true,
      },
      delivery_config: delivery,
      exchange_rates: { VES: rate },
      exchange_rate_modes: { VES: 'auto' },
      exchange_rate_sources: { VES: 'bcv_usd' },
    },
  };
}

async function geocode(address) {
  if (!mapsKey) return { lat: 10.6666, lng: -71.6125 };
  const uri = new URL('https://maps.googleapis.com/maps/api/geocode/json');
  uri.searchParams.set('address', address);
  uri.searchParams.set('region', 've');
  uri.searchParams.set('language', 'es');
  uri.searchParams.set('key', mapsKey);
  const res = await fetch(uri);
  const json = await res.json();
  const loc = json?.results?.[0]?.geometry?.location;
  if (!loc) return { lat: 10.6666, lng: -71.6125 };
  return { lat: loc.lat, lng: loc.lng };
}

async function main() {
  const { data: alegria, error: alegriaErr } = await supabase
    .from('comercios')
    .select(
      'exchange_rate_mode,exchange_rate_source,exchange_rate_value,exchange_rate_quote_currency,last_rate_update,branding_ia',
    )
    .eq('id', ALEGRIA_ID)
    .single();
  if (alegriaErr) throw alegriaErr;

  // Delivery zones from Alegria; FX from BCV USD (not EUR).
  const { data: usdRef } = await supabase
    .from('comercios')
    .select('exchange_rate_value,last_rate_update')
    .eq('exchange_rate_source', 'bcv_usd')
    .eq('exchange_rate_mode', 'auto')
    .gt('exchange_rate_value', 1)
    .order('last_rate_update', { ascending: false })
    .limit(1)
    .maybeSingle();

  const rate = Number(usdRef?.exchange_rate_value);
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new Error('Could not resolve a live BCV USD rate');
  }
  console.log(`BCV USD rate: ${rate} VES (delivery zones from Alegria)`);

  const menu = buildMenu(rate);
  const productCount = menu.reduce((n, c) => n + c.productos.length, 0);
  console.log(`Menu: ${menu.length} categories, ${productCount} products`);
  console.log(
    'Sample Papa USD:',
    menu[0].productos.find((p) => p.nombre === 'Papa')?.precio,
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
    'Urbanización Urdaneta, Maracaibo 4001, Zulia, Venezuela',
  );
  console.log('Geocode', coords);

  if (dryRun) {
    console.log('Dry run OK. Would create', EMAIL, SLUG, 'password fixed');
    return;
  }

  let ownerId = null;
  const { data: listed } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 200,
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

  const branding = brandingPayload(alegria, rate);
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
      moneda: 'USD',
      moneda_principal: 'USD',
      exchange_rate_quote_currency: 'VES',
      exchange_rate_mode: 'auto',
      exchange_rate_source: 'bcv_usd',
      exchange_rate_value: rate,
      last_rate_update: usdRef?.last_rate_update || new Date().toISOString(),
      permite_delivery: true,
      recibe_pedidos_whatsapp: true,
      mostrar_en_directorio_publico: true,
      negocio_virtual: false,
      onboarding_completed: true,
      ai_enabled: true,
      en_linea: false,
      metodos_pago: ['Efectivo'],
      estados_operacion: ['zulia'],
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

  const { error: payErr } = await supabase.from('metodos_pago').insert([
    {
      comercio_id: comercio.id,
      tipo: 'efectivo__usd',
      nombre: 'Efectivo USD',
      descripcion: 'Pago en efectivo en dólares.',
    },
    {
      comercio_id: comercio.id,
      tipo: 'efectivo__ves',
      nombre: 'Efectivo VES',
      descripcion: 'Pago en efectivo en bolívares.',
    },
  ]);
  if (payErr) throw payErr;

  const { data: issued, error: issueError } = await supabase.rpc(
    'issue_gift_cards',
    {
      p_count: 1,
      p_months: 1,
      p_batch_label: 'verduras-delivery-launch',
      p_expires_at: null,
      p_note: 'Activación Verduras Delivery',
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
    const rows = cat.productos.map((p) => ({
      comercio_id: comercio.id,
      categoria_id: category.id,
      nombre: p.nombre,
      descripcion: p.descripcion ?? '',
      precio: p.precio,
      disponible: true,
      orden: ordenProd++,
      ...(p.opciones_menu ? { opciones_menu: p.opciones_menu } : {}),
    }));
    const { error: prodError } = await supabase.from('productos').insert(rows);
    if (prodError) throw prodError;
    inserted += rows.length;
    console.log(`  + ${cat.nombre}: ${rows.length}`);
  }

  await supabase
    .from('comercios')
    .update({ en_linea: true, onboarding_completed: true })
    .eq('id', comercio.id);

  console.log('\n=== DONE ===');
  console.log(`Menu: ${inserted} products`);
  console.log(`Rate: ${rate} (bcv_usd)`);
  console.log(`Delivery zones: ${branding.config_negocio.delivery_config?.zones?.length || 0}`);
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
