/**
 * Provision "El Gran Bebé el Original" (slug: elgranbebeeloriginal):
 * auth user, comercio, logo, gift card redemption, payment methods, full menu.
 *
 * Usage (from site/):
 *   node --env-file=.env.local scripts/provision-elgranbebe.mjs --dry-run
 *   node --env-file=.env.local scripts/provision-elgranbebe.mjs
 */

import { createClient } from '@supabase/supabase-js';
import { createHash, randomBytes } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const dryRun = process.argv.includes('--dry-run');
const SLUG = 'elgranbebeeloriginal';
const NOMBRE = 'El Gran Bebé el Original';
const EMAIL = 'elgranbebeeloriginal@1xp.fr';
const WHATSAPP = '+584225004240';
const INSTAGRAM = 'https://www.instagram.com/elgranbebeeloriginal/';
const DIRECCION =
  'Plaza Perucho Calle 158, Maracaibo, Zulia\nReferencia: Plaza Perucho (El Moradito)';
const COLOR = '#7B2D8E';
const LOGO_CANDIDATES = [
  resolve(
    process.env.USERPROFILE || '',
    '.cursor/projects/c-Users-bryan-Documents-projects-kosmenu-app/assets/c__Users_bryan_AppData_Roaming_Cursor_User_workspaceStorage_53cc2968cfd4bdf0512a57da28cf1ff5_images_image-33f3997a-9bf9-4276-bb1b-d2674cfa99b6.jpg',
  ),
];

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

function uniqueGroup({
  nombre,
  tipo = 'unica',
  obligatorio = true,
  min = 1,
  max = 1,
  opciones,
}) {
  return {
    id: oid('g'),
    nombre,
    tipo,
    obligatorio,
    min,
    max,
    opciones: opciones.map((o) => ({
      id: oid('o'),
      nombre: o.nombre,
      precio: Number(o.precio ?? 0),
      activo: true,
      ...(o.predeterminada ? { predeterminada: true } : {}),
    })),
  };
}

function withGroups(groups) {
  return { activadas: true, grupos: groups };
}

function consultar(nombre, descripcionExtra = '') {
  return {
    nombre,
    precio: 0,
    descripcion: descripcionExtra
      ? `A consultar. ${descripcionExtra}`
      : 'A consultar',
  };
}

const WOPPER_GUISOS = [
  'Carne',
  'Pollo',
  'Carne mechada',
  'Lomito',
  'Pollo crispy',
  'Pernil',
  'Chuleta ahumada',
];
const PROTEIN_GUISOS = [
  'Carne mechada',
  'Pollo',
  'Pernil',
  'Lomito',
];
const JUNIOR_CHOICE = ['Pollo', 'Carne'];

function twoGuisosProduct(nombre, precio, guisos, nota = '') {
  return {
    nombre,
    precio,
    descripcion: [nota, 'Elige 2 guisos'].filter(Boolean).join(' · '),
    opciones_menu: withGroups([
      uniqueGroup({
        nombre: 'Guisos',
        tipo: 'multiple',
        obligatorio: true,
        min: 2,
        max: 2,
        opciones: guisos.map((g) => ({ nombre: g })),
      }),
    ]),
  };
}

function buildMenu() {
  const wopperIncluye =
    'Incluye servicio de papas + 1 helado';

  return [
    {
      nombre: 'Hamburguesas',
      productos: [
        { nombre: 'Mini de Carne', precio: 2 },
        { nombre: 'Mini de Pollo', precio: 2.5 },
        { nombre: 'Mini de Lomito', precio: 3 },
        { nombre: 'Mini de Pollo Crispy', precio: 3 },
        {
          nombre: 'Wopper Sencilla de Carne',
          precio: 5,
          descripcion: wopperIncluye,
        },
        {
          nombre: 'Wopper Sencilla de Pollo',
          precio: 5,
          descripcion: wopperIncluye,
        },
        {
          nombre: 'Wopper Sencilla de Carne Mechada',
          precio: 5,
          descripcion: wopperIncluye,
        },
        {
          nombre: 'Wopper Sencilla de Lomito',
          precio: 6,
          descripcion: wopperIncluye,
        },
        {
          nombre: 'Wopper Especial de Lomito',
          precio: 8,
          descripcion: wopperIncluye,
        },
        {
          nombre: 'Wopper Especial de Pollo Crispy',
          precio: 8,
          descripcion: wopperIncluye,
        },
        {
          nombre: 'Wopper Especial de Pernil',
          precio: 8,
          descripcion: wopperIncluye,
        },
        {
          nombre: 'Wopper Especial de Chuleta Ahumada',
          precio: 8,
          descripcion: wopperIncluye,
        },
        twoGuisosProduct(
          'Wopper Mixta (2 Guisos)',
          9,
          WOPPER_GUISOS,
          wopperIncluye,
        ),
      ],
    },
    {
      nombre: 'Panes',
      productos: [
        { nombre: 'Panes con Huevo', precio: 1.5 },
        { nombre: 'Panes con Queso', precio: 1.5 },
        { nombre: 'Panes de Pollo', precio: 5 },
        { nombre: 'Panes de Pernil', precio: 6 },
        { nombre: 'Panes con Carne Mechada', precio: 5 },
        { nombre: 'Panes de Lomito', precio: 6 },
        twoGuisosProduct('Panes Mixtos (2 Guisos)', 8, PROTEIN_GUISOS),
      ],
    },
    {
      nombre: 'Arepas y Tumbarranchos',
      productos: [
        { nombre: 'Arepa de Queso', precio: 1.5 },
        { nombre: 'Arepa de Carne Mechada', precio: 7 },
        { nombre: 'Arepa de Pollo', precio: 7 },
        { nombre: 'Arepa de Pernil', precio: 8 },
        { nombre: 'Arepa de Lomito', precio: 8 },
        twoGuisosProduct('Arepa Mixta (2 Guisos)', 11, PROTEIN_GUISOS),
      ],
    },
    {
      nombre: 'Patacones',
      productos: [
        { nombre: 'Patacón Personal de Carne Mechada', precio: 10 },
        { nombre: 'Patacón Personal de Pollo', precio: 10 },
        { nombre: 'Patacón Personal de Pernil', precio: 11 },
        { nombre: 'Patacón Personal de Lomito', precio: 11 },
        twoGuisosProduct(
          'Patacón Personal Mixto (2 Guisos)',
          13,
          PROTEIN_GUISOS,
        ),
      ],
    },
    {
      nombre: 'Arepones Familiares',
      productos: [
        { nombre: 'Arepón Familiar de Carne Mechada', precio: 15 },
        { nombre: 'Arepón Familiar de Pollo', precio: 15 },
        { nombre: 'Arepón Familiar de Lomito', precio: 16 },
        { nombre: 'Arepón Familiar de Pernil', precio: 16 },
        twoGuisosProduct(
          'Arepón Familiar Mixto (2 Guisos)',
          18,
          PROTEIN_GUISOS,
        ),
      ],
    },
    {
      nombre: 'Arepones Personales',
      productos: [
        { nombre: 'Arepón Personal de Carne Mechada', precio: 10 },
        { nombre: 'Arepón Personal de Pollo', precio: 10 },
        { nombre: 'Arepón Personal de Lomito', precio: 11 },
        { nombre: 'Arepón Personal de Pernil', precio: 11 },
        twoGuisosProduct(
          'Arepón Personal Mixto (2 Guisos)',
          13,
          PROTEIN_GUISOS,
        ),
      ],
    },
    {
      nombre: 'Salchipanes',
      productos: [
        { nombre: 'Salchicha (Perro Caliente)', precio: 1.5 },
        { nombre: 'Salchicha Plumrose', precio: 1 },
        { nombre: 'Salchiqueso', precio: 2 },
        { nombre: 'Salchihuevo y Queso', precio: 2 },
        { nombre: 'Pan con Huevo y Queso', precio: 2 },
        { nombre: 'Salchipapa Sencilla', precio: 6 },
        {
          nombre: 'Salchipapa con Proteína',
          precio: 12,
          descripcion: 'Elige la proteína',
          opciones_menu: withGroups([
            uniqueGroup({
              nombre: 'Proteína',
              opciones: PROTEIN_GUISOS.map((nombre) => ({ nombre })),
            }),
          ]),
        },
        twoGuisosProduct('Salchipapa Mixta (2 Guisos)', 15, PROTEIN_GUISOS),
      ],
    },
    {
      nombre: 'Servicios Adicionales',
      productos: [
        { nombre: 'Porción de Papas Fritas', precio: 3 },
        { nombre: 'Rueda de Queso Cebú', precio: 0.5 },
        { nombre: 'Arepa Adicional', precio: 0.2 },
        { nombre: 'Papa Crispy', precio: 3 },
      ],
    },
    {
      nombre: 'Bebidas',
      productos: [
        { nombre: 'Refresco de 250 ml', precio: 1 },
        { nombre: 'Refresco de Litro y Medio (1.5 L)', precio: 2 },
        { nombre: 'Vaso de Nestea', precio: 2 },
        consultar('Vaso de Té de Jamaica'),
      ],
    },
    {
      nombre: 'Combos',
      productos: [
        {
          nombre: 'Combo 1 — 4 Hamburguesas',
          precio: 20,
          descripcion:
            '4 Wopper, refresco 1.5 L, servicio de papas fritas y 4 helados',
        },
        consultar(
          'Combo 2 — 4 Patacones',
          '4 patacones, 4 helados, refresco 1.5 L y servicio de papas fritas',
        ),
        consultar(
          'Combo 3 — 4 Wopper Especiales',
          '4 Wopper especiales, 4 barquillas, servicio de papas fritas y refresco 1.5 L',
        ),
        {
          nombre: 'Combo 4 — 10 Hamburguesas Junior de Pollo',
          precio: 20,
          descripcion:
            '10 hamburguesas Junior de Pollo, refresco 1.5 L y servicio de papas fritas',
        },
        {
          nombre: 'Combo 5 — 10 Hamburguesas Junior de Carne',
          precio: 18,
          descripcion:
            '10 hamburguesas Junior de Carne, refresco 1.5 L y servicio de papas fritas',
        },
        {
          nombre: 'Combo 6 — 10 Salchiquesos',
          precio: 18,
          descripcion:
            '10 salchiquesos, refresco 1.5 L y servicio de papas fritas',
        },
        {
          nombre: 'Combo 7 — 3 Hamburguesas Whopper',
          precio: 15,
          descripcion:
            '3 Wopper, refresco 1.5 L, servicio de papas fritas y 3 helados',
        },
        {
          nombre: 'Combo 8 — 10 Tumbarranchos',
          precio: 15,
          descripcion:
            '10 tumbarranchos con rueda de queso Cebú c/u y refresco 1.5 L',
        },
        {
          nombre: 'Combo 9 — Hamburguesas Mixtas',
          precio: 12,
          descripcion:
            '1 Wopper + 2 Junior + refresco 1.5 L + papas + 2 helados',
          opciones_menu: withGroups([
            uniqueGroup({
              nombre: 'Wopper',
              opciones: [
                { nombre: 'Pollo', predeterminada: true },
                { nombre: 'Carne' },
              ],
            }),
            uniqueGroup({
              nombre: 'Junior',
              opciones: JUNIOR_CHOICE.map((nombre) => ({ nombre })),
            }),
          ]),
        },
        {
          nombre: 'Combo 10 — 2 Hamburguesas Wopper Especiales',
          precio: 14,
          descripcion:
            '2 Wopper especiales, refresco 1.5 L, servicio de papas fritas y 2 helados',
        },
        {
          nombre: 'Combo 11 — 10 Perros Calientes',
          precio: 15,
          descripcion:
            '10 perros calientes, refresco 1.5 L y servicio de papas fritas',
        },
      ],
    },
  ];
}

function brandingPayload() {
  return {
    schema_version: 2,
    color_principal: COLOR,
    color_secundario: '#F5C542',
    fuente_titulos: 'Montserrat',
    fuente_cuerpo: 'Open Sans',
    estilo_botones: 'rounded',
    mood_tags: ['audaz', 'callejero', 'sabor', 'maracaibo'],
    descripcion_visual: 'Hamburguesas y comida callejera en Maracaibo.',
    layout_type: 'grid',
    colores_personalizados: {
      background: '#14081A',
      card_surface: '#1F0F28',
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
      moneda_default: 'USD',
      checkout_currencies: ['USD', 'VES'],
      metodos_pago: ['efectivo'],
      social_links: { instagram: INSTAGRAM },
      order_management_mode: 'whatsapp_manual',
      whatsapp_order_format: 'detailed',
      inicio_menu: {
        redes: true,
        catalogo: false,
        delivery: true,
        ver_menu: false,
        ubicacion: true,
        comer_aqui: true,
        para_llevar: true,
        calificacion: true,
        ver_metodos_pago: false,
      },
      delivery_config: {
        enabled: true,
        version: 1,
        currency: 'USD',
        min_order: 0,
        fixed_price: 0,
        pricing_type: 'fixed',
        custom_message: 'Delivery disponible. Confirma por WhatsApp.',
        free_delivery: { enabled: false, minimum_order: 0 },
        distance_config: {
          base_price: 0,
          included_km: 0,
          extra_price_per_km: 0,
        },
        estimated_times: {
          delivery_minutes: 35,
          preparation_minutes: 20,
        },
        zones: [],
      },
      exchange_rates: {},
      exchange_rate_modes: { VES: 'auto' },
      exchange_rate_sources: { VES: 'bcv_usd' },
    },
  };
}

async function geocode(address) {
  if (!mapsKey) return { lat: 10.6545, lng: -71.6365 }; // Maracaibo fallback
  const uri = new URL('https://maps.googleapis.com/maps/api/geocode/json');
  uri.searchParams.set('address', address);
  uri.searchParams.set('region', 've');
  uri.searchParams.set('language', 'es');
  uri.searchParams.set('key', mapsKey);
  const res = await fetch(uri);
  const json = await res.json();
  const loc = json?.results?.[0]?.geometry?.location;
  if (!loc) return { lat: 10.6545, lng: -71.6365 };
  return { lat: loc.lat, lng: loc.lng };
}

async function main() {
  const menu = buildMenu();
  const productCount = menu.reduce((n, c) => n + c.productos.length, 0);
  console.log(`Menu: ${menu.length} categories, ${productCount} products`);

  const { data: existing } = await supabase
    .from('comercios')
    .select('id,slug')
    .eq('slug', SLUG)
    .maybeSingle();
  if (existing) {
    console.error(`Slug ${SLUG} already exists (${existing.id}). Aborting.`);
    process.exit(1);
  }

  const password = `Egb!${randomBytes(6).toString('base64url')}`;
  const coords = await geocode('Plaza Perucho Calle 158, Maracaibo, Zulia, Venezuela');
  console.log('Geocode', coords);

  if (dryRun) {
    console.log('Dry run OK. Would create user', EMAIL, 'and comercio', SLUG);
    return;
  }

  // 1) Auth user (reuse if a previous attempt already created it)
  let ownerId = null;
  let passwordOut = password;
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
      password,
      email_confirm: true,
    });
    if (pwError) throw pwError;
    console.log('Owner reused', ownerId, EMAIL);
  } else {
    const { data: createdUser, error: userError } =
      await supabase.auth.admin.createUser({
        email: EMAIL,
        password,
        email_confirm: true,
        user_metadata: { full_name: NOMBRE, commerce_slug: SLUG },
      });
    if (userError) throw userError;
    ownerId = createdUser.user.id;
    console.log('Owner created', ownerId, EMAIL);
  }

  // 2) Comercio
  const branding = brandingPayload();
  const { data: comercio, error: comercioError } = await supabase
    .from('comercios')
    .insert({
      owner_id: ownerId,
      nombre: NOMBRE,
      slug: SLUG,
      categoria: 'Hamburguesas',
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
      permite_delivery: true,
      recibe_pedidos_whatsapp: true,
      mostrar_en_directorio_publico: true,
      negocio_virtual: false,
      onboarding_completed: true,
      ai_enabled: true,
      en_linea: false, // gift redemption / grant flips to true
      metodos_pago: ['Efectivo'],
      branding_ia: branding,
    })
    .select('id,slug,nombre')
    .single();
  if (comercioError) throw comercioError;
  console.log('Comercio', comercio.id);

  // 3) Logo
  let logoUrl = null;
  const logoPath = LOGO_CANDIDATES.find((p) => existsSync(p));
  if (logoPath) {
    const bytes = readFileSync(logoPath);
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
      logoUrl = supabase.storage.from('logos-comercios').getPublicUrl(objectPath)
        .data.publicUrl;
      await supabase
        .from('comercios')
        .update({ logo_url: logoUrl })
        .eq('id', comercio.id);
      console.log('Logo', logoUrl);
    }
  } else {
    console.warn('Logo file not found; skipping upload');
  }

  // 4) Payment methods USD + VES cash
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

  // 5) Gift card + activate subscription
  const { data: issued, error: issueError } = await supabase.rpc(
    'issue_gift_cards',
    {
      p_count: 1,
      p_months: 1,
      p_batch_label: 'elgranbebe-launch',
      p_expires_at: null,
      p_note: 'Activación El Gran Bebé el Original',
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

  // 6) Catalog + menu
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

  // Ensure online after grant
  await supabase
    .from('comercios')
    .update({ en_linea: true, onboarding_completed: true })
    .eq('id', comercio.id);

  console.log('\n=== DONE ===');
  console.log(`Menu: ${inserted} products`);
  console.log(`URL: https://elmenuxfa.com/v/${SLUG}`);
  console.log(`Email: ${EMAIL}`);
  console.log(`Password: ${password}`);
  console.log(`Gift card (redeemed): ${card.code}`);
  console.log(`Comercio id: ${comercio.id}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
