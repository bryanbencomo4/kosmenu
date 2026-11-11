/**
 * Provision "Toro Bravo Steak House" (slug: torobravo) as if registered from app.elmenuxfa.com.
 * - Menu USD from client board + product photos from Desktop folder
 * - Delivery interval zones copied from Alegría
 * - FX / checkout currencies mirrored from Alegría (USD + VES)
 * - Payment: Pago Móvil (tasa € BCV), Binance, Zelle
 *
 * Usage (from site/):
 *   node --env-file=.env.local scripts/provision-torobravo.mjs --dry-run
 *   node --env-file=.env.local scripts/provision-torobravo.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { randomUUID } from 'node:crypto';

const dryRun = process.argv.includes('--dry-run');
const SLUG = 'torobravo';
const NOMBRE = 'Toro Bravo Steak House';
const EMAIL = 'torobravo@1xp.fr';
const PASSWORD = '123456789';
const WHATSAPP = '+584141785158';
const INSTAGRAM = 'https://www.instagram.com/torobravorest/';
const DIRECCION =
  'Terraza del Restaurante Toro Bravo, Fuerte Tiuna, Caracas, Venezuela';
const COLOR = '#6B2B1F';
const CATEGORIA = 'Parrilla / Steak House';
const ALEGRIA_ID = '51a4be30-27b6-4e53-8761-9fddc9837790';
const PRODUCT_BUCKET = 'product-images';
const LOGO_BUCKET = 'logos-comercios';
const IMAGES_DIR = resolve(
  process.env.USERPROFILE || '',
  'OneDrive/Desktop/TORO BRAVO REST PRODUCTOS',
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

function oid(prefix = 'g') {
  return `${prefix}_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
}

function group({
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
    opciones: opciones.map((o, i) => ({
      id: oid('o'),
      nombre: o.nombre,
      precio: Number(o.precio ?? 0),
      activo: true,
      ...(i === 0 && tipo === 'unica' && obligatorio ? { predeterminada: true } : {}),
    })),
  };
}

function withGroups(groups) {
  return { activadas: true, grupos: groups };
}

const CONTORNOS = [
  'Tostones en Sombrerito',
  'Pasta Larga 4 Quesos',
  'Arroz Blanco',
  'Arroz Amarillo',
  'Palitos de Yuca Frita',
  'Papas Colombianas',
  'Ensalada Rallada',
  'Ensalada César',
  'Ensalada Mixta',
];

function contornosGroup() {
  return group({
    nombre: 'Elige 2 contornos',
    tipo: 'multiple',
    obligatorio: true,
    min: 2,
    max: 2,
    opciones: CONTORNOS.map((nombre) => ({ nombre, precio: 0 })),
  });
}

function buildHorarios() {
  const day = { open: true, ranges: [{ start: '12:00', end: '22:30' }] };
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
    color_secundario: '#1A1A1A',
    fuente_titulos: 'Montserrat',
    fuente_cuerpo: 'Open Sans',
    estilo_botones: 'rounded',
    mood_tags: ['parrilla', 'steakhouse', 'caracas', 'fuerte-tiuna'],
    descripcion_visual:
      'Toro Bravo Steak House — terraza en Fuerte Tiuna, Caracas. Carnes, parrillas y entradas.',
    layout_type: 'grid',
    colores_personalizados: {
      background: '#F6F1EA',
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
      checkout_currencies: ['USD', 'VES'],
      moneda_default: 'USD',
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
      exchange_rate_adjustments: adj || undefined,
    },
  };
}

function paymentRows(comercioId) {
  return [
    {
      comercio_id: comercioId,
      tipo: 'efectivo__usd',
      nombre: 'Efectivo',
      descripcion: 'Pago en efectivo en dólares.',
      detalles: 'Por favor, usa billetes en buen estado.',
    },
    {
      comercio_id: comercioId,
      tipo: 'transferencia__ves__1',
      nombre: 'Pago digital: Pago Móvil',
      descripcion: 'Pago Móvil · Tasa € BCV',
      detalles: digital('Pago Móvil', [
        { type: 'texto', label: 'Titular', value: 'Servio Marquez' },
        { type: 'id', label: 'Cédula', value: 'V-8875117' },
        { type: 'telefono', label: 'Teléfono', value: '0414 1785158' },
        {
          type: 'texto',
          label: 'Bancos',
          value: 'Bancamiga · Venezuela · Banesco',
        },
        { type: 'nota', label: 'Tasa', value: 'Tasa € BCV' },
      ]),
    },
    {
      comercio_id: comercioId,
      tipo: 'transferencia__usd__1',
      nombre: 'Pago digital: Zelle',
      descripcion: 'Cuenta de pago digital',
      detalles: digital('Zelle', [
        {
          type: 'correo',
          label: 'Correo',
          value: 'gabrielson.son@gmail.com',
        },
      ]),
    },
    {
      comercio_id: comercioId,
      tipo: 'transferencia__usd__2',
      nombre: 'Pago digital: Binance',
      descripcion: 'Cuenta de pago digital',
      detalles: digital('Binance', [
        { type: 'texto', label: 'ID', value: '426348956' },
      ]),
    },
    {
      comercio_id: comercioId,
      tipo: 'efectivo__ves',
      nombre: 'Efectivo',
      descripcion: 'Pago en efectivo en bolívares.',
      detalles: 'Por favor, usa billetes en buen estado.',
    },
  ];
}

/** @type {Array<{nombre:string,rol:string,productos:Array<object>}>} */
const MENU = [
  {
    nombre: 'Entradas',
    rol: 'side',
    productos: [
      { nombre: 'Pork Belly', precio: 11.9, image: '4.jpeg' },
      { nombre: 'Palitos Yuca Frita', precio: 3.9, image: '18.jpeg' },
      { nombre: 'Bollitos Aliñados', precio: 3.9 },
      { nombre: 'Teq Doble Queso', precio: 4.9, image: '14.jpeg' },
      { nombre: 'Arepitas con Nata', precio: 4.9, image: '5.jpeg' },
    ],
  },
  {
    nombre: 'Carnes y Aves',
    rol: 'main',
    productos: [
      {
        nombre: 'Churrasquito Solomo AA',
        precio: 10.9,
        image: '16.jpeg',
        opciones_menu: withGroups([contornosGroup()]),
      },
      {
        nombre: 'Cortes Carne Ahumada',
        precio: 12,
        image: '4.jpeg',
        opciones_menu: withGroups([contornosGroup()]),
      },
      {
        nombre: 'Parrilla Individual',
        precio: 10.9,
        image: '12.jpeg',
        descripcion:
          'Elige proteína y acompañante: Solomo, Pollo, Carne Ahumada, Chorizo Montserratina, Bollitos Aliñados o Palitos Yuca.',
        opciones_menu: withGroups([
          group({
            nombre: 'Proteína',
            opciones: [
              { nombre: 'Solomo' },
              { nombre: 'Pollo' },
              { nombre: 'Carne Ahumada' },
              { nombre: 'Chorizo Montserratina' },
            ],
          }),
          group({
            nombre: 'Acompañante',
            opciones: [
              { nombre: 'Bollitos Aliñados' },
              { nombre: 'Palitos Yuca' },
            ],
          }),
        ]),
      },
      {
        nombre: 'Parrilla Familiar',
        precio: 29.99,
        image: '18.jpeg',
        descripcion:
          'Solomo 200 grs, Carne Ahumada, Chorizos Montserratina, Arepitas, Bollitos Aliñados, Palitos Yuca Frita, Queso en Plancha y rac de ensalada.',
      },
      {
        nombre: 'Churrasquito de Pollo a la Ajillo',
        precio: 7.9,
        image: '1.jpeg',
        opciones_menu: withGroups([contornosGroup()]),
      },
      {
        nombre: 'Fajitas de Pollo con Vegetales Salteados',
        precio: 11.9,
        opciones_menu: withGroups([contornosGroup()]),
      },
      {
        nombre: 'Brochetas Carne y Pollo',
        precio: 7.9,
        image: '18.jpeg',
        opciones_menu: withGroups([contornosGroup()]),
      },
      {
        nombre: 'Hamburguesas Pollo Crispy o Carne',
        precio: 5.9,
        image: '6.jpeg',
        opciones_menu: withGroups([
          group({
            nombre: 'Tipo',
            opciones: [
              { nombre: 'Pollo Crispy' },
              { nombre: 'Carne' },
            ],
          }),
        ]),
      },
      {
        nombre: 'Chuleta Ahumada',
        precio: 6.9,
        image: '4.jpeg',
        opciones_menu: withGroups([contornosGroup()]),
      },
    ],
  },
  {
    nombre: 'Contornos',
    rol: 'side',
    productos: CONTORNOS.map((nombre) => ({
      nombre,
      precio: 0,
      descripcion:
        'Incluidos con tu carne: elige 2 al pedir (se seleccionan en el plato principal).',
      image:
        nombre === 'Tostones en Sombrerito'
          ? '7.jpeg'
          : nombre === 'Palitos de Yuca Frita'
            ? '18.jpeg'
            : undefined,
    })),
  },
  {
    nombre: 'Bebidas',
    rol: 'drink',
    productos: [
      { nombre: 'Jugos Naturales', precio: 4.9 },
      { nombre: 'Café', precio: 2 },
      { nombre: 'Agua 33cl', precio: 1.5 },
      { nombre: 'Refrescos', precio: 2 },
      { nombre: 'Cerveza Tobo x 10', precio: 14.9 },
      { nombre: 'Tinto Verano jarra', precio: 11.9 },
      {
        nombre: 'Mojitos Parchita o Limón',
        precio: 3.9,
        opciones_menu: withGroups([
          group({
            nombre: 'Sabor',
            opciones: [{ nombre: 'Parchita' }, { nombre: 'Limón' }],
          }),
        ]),
      },
      { nombre: 'Whisky 8 Años', precio: 33.9 },
      { nombre: 'Whisky 12 Años', precio: 55.9 },
      { nombre: 'Ron Sta Teresa', precio: 29.9 },
      {
        nombre: 'Vino Español / Chileno',
        precio: 0,
        descripcion: 'Consultar disponibilidad y precio.',
        opciones_menu: withGroups([
          group({
            nombre: 'Origen',
            opciones: [{ nombre: 'Español' }, { nombre: 'Chileno' }],
          }),
        ]),
      },
    ],
  },
  {
    nombre: 'Especiales',
    rol: 'main',
    productos: [
      {
        nombre: 'Plato Navideño',
        precio: 14,
        descripcion: 'Especial de temporada.',
      },
    ],
  },
];

async function geocode() {
  const fallback = { lat: 10.4335, lng: -66.9105 }; // Fuerte Tiuna approx
  if (!mapsKey) return fallback;
  const uri = new URL('https://maps.googleapis.com/maps/api/geocode/json');
  uri.searchParams.set('address', DIRECCION);
  uri.searchParams.set('region', 've');
  uri.searchParams.set('language', 'es');
  uri.searchParams.set('key', mapsKey);
  const res = await fetch(uri);
  const json = await res.json();
  const loc = json?.results?.[0]?.geometry?.location;
  if (!loc) return fallback;
  return { lat: loc.lat, lng: loc.lng };
}

function resolveImageMap() {
  /** @type {Record<string, string>} */
  const map = {};
  if (!existsSync(IMAGES_DIR)) return map;
  for (const name of readdirSync(IMAGES_DIR)) {
    if (!/\.jpe?g$/i.test(name)) continue;
    map[name] = join(IMAGES_DIR, name);
  }
  return map;
}

async function main() {
  const productCount = MENU.reduce((n, c) => n + c.productos.length, 0);
  const imageMap = resolveImageMap();
  console.log(`Menu: ${MENU.length} categories, ${productCount} products`);
  console.log(`Images folder: ${IMAGES_DIR} (${Object.keys(imageMap).length} files)`);

  const { data: existing } = await supabase
    .from('comercios')
    .select('id,slug')
    .eq('slug', SLUG)
    .maybeSingle();
  if (existing) {
    console.error(`Slug ${SLUG} already exists (${existing.id}). Aborting.`);
    process.exit(1);
  }

  const { data: alegria, error: alegriaErr } = await supabase
    .from('comercios')
    .select(
      'branding_ia,exchange_rate_mode,exchange_rate_source,exchange_rate_value,tasa_cambio_pesos,last_rate_update,moneda,moneda_principal',
    )
    .eq('id', ALEGRIA_ID)
    .single();
  if (alegriaErr) throw alegriaErr;

  const alegriaCfg = alegria.branding_ia?.config_negocio || {};
  const deliveryFull = structuredClone(alegriaCfg.delivery_config || {});
  // Interval delivery only (as requested): keep zones pricing, drop heavy area polygons.
  const delivery = {
    ...deliveryFull,
    pricing_type: 'zones',
    currency: deliveryFull.currency || 'USD',
    enabled: true,
    area_zones: [],
    area_zones_fallback: { enabled: false, price: 0 },
  };
  const rates = structuredClone(alegriaCfg.exchange_rates || { VES: 950 });
  const modes = structuredClone(alegriaCfg.exchange_rate_modes || { VES: 'manual' });
  const sources = structuredClone(alegriaCfg.exchange_rate_sources || {});
  const adj = structuredClone(alegriaCfg.exchange_rate_adjustments || {});

  console.log(
    'Delivery intervals from Alegría:',
    (delivery.zones || []).map(
      (z) => `${z.name}: ${z.min_distance}-${z.max_distance} km → $${z.price}`,
    ),
  );

  const coords = await geocode();
  console.log('Coords', coords);

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
      moneda: 'USD',
      moneda_principal: 'USD',
      exchange_rate_quote_currency: 'VES',
      exchange_rate_mode: alegria.exchange_rate_mode || 'manual',
      exchange_rate_source: alegria.exchange_rate_source || 'manual',
      exchange_rate_value: alegria.exchange_rate_value ?? rates.VES ?? 950,
      tasa_cambio_pesos: alegria.tasa_cambio_pesos,
      last_rate_update: alegria.last_rate_update || new Date().toISOString(),
      permite_delivery: true,
      recibe_pedidos_whatsapp: true,
      mostrar_en_directorio_publico: true,
      negocio_virtual: false,
      onboarding_completed: true,
      ai_enabled: true,
      en_linea: false,
      metodos_pago: ['Efectivo', 'Transferencia'],
      metodo_pago_predeterminado: 'Transferencia',
      estados_operacion: ['distrito-capital'],
      horarios: buildHorarios(),
      branding_ia: branding,
    })
    .select('id,slug,nombre')
    .single();
  if (comercioError) throw comercioError;
  console.log('Comercio', comercio.id);

  // Logo: prefer steak plate photo as interim brand mark
  const logoFile = imageMap['16.jpeg'] || imageMap['6.jpeg'];
  if (logoFile && existsSync(logoFile)) {
    const bytes = readFileSync(logoFile);
    const objectPath = `${ownerId}/${SLUG}_${Date.now()}.jpg`;
    const { error: upErr } = await supabase.storage
      .from(LOGO_BUCKET)
      .upload(objectPath, bytes, { contentType: 'image/jpeg', upsert: true });
    if (upErr) console.warn('Logo upload failed:', upErr.message);
    else {
      const logoUrl = supabase.storage.from(LOGO_BUCKET).getPublicUrl(objectPath)
        .data.publicUrl;
      await supabase
        .from('comercios')
        .update({ logo_url: logoUrl })
        .eq('id', comercio.id);
      console.log('Logo', logoUrl);
    }
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
      p_batch_label: 'torobravo-launch',
      p_expires_at: null,
      p_note: 'Activación Toro Bravo Steak House',
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
  }

  /** @type {Array<{id:string,nombre:string,image?:string}>} */
  const inserted = [];
  for (const cat of MENU) {
    let orden = 0;
    for (const p of cat.productos) {
      const { data: product, error } = await supabase
        .from('productos')
        .insert({
          comercio_id: comercio.id,
          categoria_id: categoryIds.get(cat.nombre),
          nombre: p.nombre,
          descripcion: p.descripcion || null,
          precio: p.precio,
          disponible: p.disponible !== false,
          orden: orden++,
          imagen_source_type: 'manual',
          ...(p.opciones_menu ? { opciones_menu: p.opciones_menu } : {}),
        })
        .select('id,nombre')
        .single();
      if (error) throw error;
      inserted.push({
        id: product.id,
        nombre: product.nombre,
        image: p.image,
      });
    }
    console.log(`  + ${cat.nombre}: ${cat.productos.length}`);
  }

  let imgOk = 0;
  for (const item of inserted) {
    if (!item.image || !imageMap[item.image]) continue;
    const bytes = readFileSync(imageMap[item.image]);
    const objectPath = `${comercio.id}/tb_${item.id}.jpg`;
    const { error: upErr } = await supabase.storage
      .from(PRODUCT_BUCKET)
      .upload(objectPath, bytes, { contentType: 'image/jpeg', upsert: true });
    if (upErr) {
      console.warn('Image upload fail', item.nombre, upErr.message);
      continue;
    }
    const publicUrl = supabase.storage
      .from(PRODUCT_BUCKET)
      .getPublicUrl(objectPath).data.publicUrl;
    await supabase
      .from('productos')
      .update({ imagen_url: publicUrl, imagen_source_type: 'manual' })
      .eq('id', item.id);
    imgOk += 1;
  }
  console.log(`Product images uploaded: ${imgOk}`);

  const drinksId = categoryIds.get('Bebidas');
  const startersId = categoryIds.get('Entradas');
  const suggestionKinds = ['acompanamiento', 'bebida'];
  const reglas = [...categoryIds.entries()].map(([nombre, categoria_id]) => ({
    categoria_id,
    categoria_origen: nombre,
    sugerir_tipos:
      nombre === 'Bebidas' || nombre === 'Contornos'
        ? ['acompanamiento']
        : suggestionKinds,
  }));
  const upsell_config = {
    upselling: true,
    pre_checkout: {
      activo: true,
      tipos: suggestionKinds,
      max_productos: 12,
      categorias: [
        { id: startersId, tipo: 'acompanamiento' },
        { id: drinksId, tipo: 'bebida' },
      ],
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

  console.log('\n=== DONE ===');
  console.log(`URL: https://elmenuxfa.com/v/${SLUG}`);
  console.log(`Admin: https://app.elmenuxfa.com`);
  console.log(`Email: ${EMAIL}`);
  console.log(`Password: ${PASSWORD}`);
  console.log(`WhatsApp: ${WHATSAPP}`);
  console.log(`Instagram: ${INSTAGRAM}`);
  console.log(`Products: ${productCount}`);
  console.log(`Delivery zones: ${(delivery.zones || []).length} (from Alegría intervals)`);
  console.log(`Gift card (redeemed): ${card.code}`);
  console.log(`Comercio id: ${comercio.id}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
