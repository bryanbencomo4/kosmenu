/**
 * Provision "El Parche del Gato" (slug: el-parche-del-gato) from the client's printed menu.
 * Prices in COP (PCO). Delivery copied from auto-pizzas-napoles. FX mirrors Inversiones Doleto.
 *
 * Usage (from site/):
 *   node --env-file=.env.local scripts/provision-elparchedelgato.mjs --dry-run
 *   node --env-file=.env.local scripts/provision-elparchedelgato.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';

const dryRun = process.argv.includes('--dry-run');
const SLUG = 'el-parche-del-gato';
const NOMBRE = 'El Parche del Gato';
const EMAIL = 'eberarivas15@gmail.com';
const PASSWORD = '123456789';
const WHATSAPP = '+584122057158';
const INSTAGRAM = 'https://www.instagram.com/elparchedelgato_/';
const DIRECCION =
  'Calle 5 con carrera 8 7-90, Sector Santa Teresa, Palmira, Táchira\nReferencia: El Parche del Gato';
const MAPS_COORDS = { lat: 7.8421, lng: -72.227386 };
const COLOR = '#FF8A00';
const COLOR_SEC = '#1A1A1A';
const CATEGORIA = 'Comida rápida';
const NAPOLES_ID = '72965186-b3b9-4974-85d6-53bef1b4a400';
const DOLETO_ID = '85f14385-c187-407a-841f-a05dfd0c46fc';
const LOGO_PATH = resolve(
  process.env.USERPROFILE || '',
  '.cursor/projects/c-Users-bryan-Documents-projects-kosmenu-app/assets/image-b65b2bdf-bd8d-430e-a8e3-413fc588d9d8.jpg',
);

const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
if (!url || !serviceKey) {
  console.error('Need NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function rid(prefix) {
  return `${prefix}_${randomBytes(4).toString('hex')}`;
}

function hexToArgbSigned(hex) {
  const raw = hex.replace('#', '');
  const unsigned = 0xff000000 | parseInt(raw, 16);
  return unsigned > 0x7fffffff ? unsigned - 0x100000000 : unsigned;
}

/** Required single-choice option group. */
function unica(nombre, labels, { min = 1, max = 1 } = {}) {
  return {
    id: rid('g'),
    max,
    min,
    tipo: max > 1 ? 'multiple' : 'unica',
    nombre,
    obligatorio: true,
    opciones: labels.map((label) => ({
      id: rid('o'),
      activo: true,
      nombre: label,
      precio: 0,
    })),
  };
}

function opciones(...grupos) {
  return { activadas: true, grupos };
}

const PROTEINA = ['Carne mechada', 'Pollo mechado'];
const ALITAS_SALSAS = ['BBQ', 'Broaster tradicional', 'Picantes', 'Piña'];
const COSTILLAS_PREP = ['Tradicional', 'Salsa agridulce'];
const AREPA_PROTEINAS = [
  'Carne mechada',
  'Pollo mechado',
  'Estrogonof',
  'Lengua',
  'Mollejas',
  'Asado negro',
  'Lomo de cerdo',
  'Camarones al ajillo',
  'Ternerita',
];
const AREPA_CONTORNOS = [
  'Huevos de codorniz',
  'Salchicha',
  'Chorizo',
  'Queso amarillo',
  'Queso guayanés',
  'Ensalada rusa',
  'Aguacate con pollo',
];
const AREPA_BEBIDAS = ['Refresco', 'Jugo natural', 'Malta', 'Agua'];
const AREPA_DESC =
  'Arepa con relleno a elección. Incluye una bebida gratis.';

const BURGER_NOTE =
  'Incluye jamón, queso, huevo, vegetales, papas al hilo y salsas.';

const MENU = [
  {
    nombre: 'Hamburguesas',
    rol: 'main',
    productos: [
      {
        nombre: 'Pollo Crispy',
        precio: 22000,
        descripcion: `Croqueta de pollo empanizado 180 g. ${BURGER_NOTE}`,
      },
      {
        nombre: 'Carne o Pollo Mechado',
        precio: 19000,
        descripcion: `160 g de carne o pollo mechado. ${BURGER_NOTE}`,
        opciones_menu: opciones(unica('Proteína', PROTEINA)),
      },
      {
        nombre: 'Croqueta',
        precio: 19000,
        descripcion: `Croqueta de carne molida 180 g. ${BURGER_NOTE}`,
      },
      {
        nombre: 'Lomito',
        precio: 21000,
        descripcion: `Lomito de res 180 g. ${BURGER_NOTE}`,
      },
      {
        nombre: 'Lomo de Cerdo',
        precio: 21000,
        descripcion: `Chuletón / lomo de cerdo ahumado. ${BURGER_NOTE}`,
      },
      {
        nombre: 'Milanesa',
        precio: 20000,
        descripcion: `Milanesa de pollo a la plancha. ${BURGER_NOTE}`,
      },
    ],
  },
  {
    nombre: 'Woper',
    rol: 'main',
    productos: [
      {
        nombre: 'Woper Carne o Pollo Mechado',
        precio: 14000,
        descripcion: `Porción pequeña 130 g de carne o pollo mechado. ${BURGER_NOTE}`,
        opciones_menu: opciones(unica('Proteína', PROTEINA)),
      },
      {
        nombre: 'Woper Croqueta',
        precio: 14000,
        descripcion: `Porción pequeña 130 g de croqueta de carne. ${BURGER_NOTE}`,
      },
    ],
  },
  {
    nombre: 'Perros Calientes',
    rol: 'main',
    productos: [
      {
        nombre: 'Normal',
        precio: 7000,
        descripcion: 'Salchicha, ensalada, papas, queso y salsas.',
      },
      {
        nombre: 'Frankfurt',
        precio: 14000,
        descripcion: 'Salchicha Frankfurt, ensalada, papas, queso y salsas.',
      },
      {
        nombre: 'Kosaka',
        precio: 14000,
        descripcion: 'Salchicha Kosaka (picante), ensalada, papas, queso y salsas.',
      },
      {
        nombre: 'Polaca',
        precio: 16000,
        descripcion: 'Salchicha polaca, ensalada, papas, queso y salsas.',
      },
      {
        nombre: 'Carne o Pollo Mechado',
        precio: 15000,
        descripcion:
          'Salchicha con carne o pollo mechado, ensalada, papas, queso y salsas.',
        opciones_menu: opciones(unica('Proteína', PROTEINA)),
      },
      {
        nombre: 'Salchiqueso',
        precio: 10000,
        descripcion: 'Ensalada, papas, queso y salsas.',
      },
      {
        nombre: 'Chorifrito',
        precio: 11000,
        descripcion: 'Ensalada, papas y queso.',
      },
    ],
  },
  {
    nombre: 'Salchipapas',
    rol: 'main',
    productos: [
      {
        nombre: 'Clásica',
        precio: 13000,
        descripcion:
          '200 g de papas fritas, salchichas, queso gratinado con maíz y salsas.',
      },
      {
        nombre: 'Carne o Pollo Mechado',
        precio: 17000,
        descripcion:
          '200 g de papas fritas, carne o pollo mechado, queso gratinado con maíz y salsas.',
        opciones_menu: opciones(unica('Proteína', PROTEINA)),
      },
      {
        nombre: 'Salchi Dúo',
        precio: 26000,
        descripcion:
          '370 g de papas fritas, carne y pollo mechado, salchichas, queso gratinado con maíz y salsas.',
      },
      {
        nombre: 'Salchi Crispy',
        precio: 22000,
        descripcion:
          '300 g de papas fritas, milanesa de pollo crispy, salchichas, huevos de codorniz, queso fundido con maíz y salsas.',
      },
      {
        nombre: 'Cochinita',
        precio: 18000,
        descripcion:
          '200 g de papas fritas, costillitas de cochino, salchichas, queso gratinado con maíz y salsas.',
      },
      {
        nombre: 'Cochinita Dúo',
        precio: 27000,
        descripcion:
          '370 g de papas fritas, costillitas de cochino, salchichas, queso gratinado con maíz y salsas.',
      },
      {
        nombre: 'Salchiparrilla',
        precio: 18000,
        descripcion:
          '200 g de papas fritas, carne de res, pulpa de cochino y chorizos, salchichas, queso gratinado con maíz y salsas.',
      },
      {
        nombre: 'Salchiparrilla Dúo',
        precio: 27000,
        descripcion:
          '370 g de papas fritas, carne de res, pulpa de cochino y chorizos, salchichas, queso gratinado con maíz y salsas.',
      },
    ],
  },
  {
    nombre: 'Pollo Broaster',
    rol: 'main',
    productos: [
      {
        nombre: '1/4 Pollo Broaster',
        precio: 20000,
        descripcion:
          '2 piezas de pollo, 3 arepitas, 200 g de papas fritas, ensalada y salsas.',
        opciones_menu: opciones(unica('Salsa favorita', ALITAS_SALSAS)),
      },
      {
        nombre: '1/2 Pollo Broaster',
        precio: 35000,
        descripcion:
          '5 piezas de pollo, 5 arepitas, 200 g de papas fritas, ensalada y salsas.',
        opciones_menu: opciones(unica('Salsa favorita', ALITAS_SALSAS)),
      },
    ],
  },
  {
    nombre: 'Alitas',
    rol: 'main',
    productos: [
      {
        nombre: 'Alitas Personal',
        precio: 18000,
        descripcion: '6 alitas (1 sabor a elegir) + 200 g de papas fritas.',
        opciones_menu: opciones(
          unica('Salsa favorita', ALITAS_SALSAS, { min: 1, max: 1 }),
        ),
      },
      {
        nombre: 'Alitas Dúo',
        precio: 32000,
        descripcion:
          '10 alitas (2 sabores a elegir), 350 g de papas fritas y 4 tequeños de queso.',
        opciones_menu: opciones(
          unica('Sabores (elige 2)', ALITAS_SALSAS, { min: 2, max: 2 }),
        ),
      },
      {
        nombre: 'Super Wings',
        precio: 50000,
        descripcion:
          '16 alitas (3 sabores a elegir), 350 g de papas fritas y 6 tequeños.',
        opciones_menu: opciones(
          unica('Sabores (elige 3)', ALITAS_SALSAS, { min: 3, max: 3 }),
        ),
      },
    ],
  },
  {
    nombre: 'Entradas',
    rol: 'side',
    productos: [
      {
        nombre: 'Tequeños',
        precio: 10000,
        descripcion: '6 tequeños de queso con salsa casera.',
      },
      {
        nombre: 'Nuggets',
        precio: 11000,
        descripcion: '6 nuggets de pollo + 200 g de papas fritas.',
      },
      {
        nombre: 'Papas Fritas',
        precio: 6000,
        descripcion: '200 g de papas fritas.',
      },
    ],
  },
  {
    nombre: 'Arroz Chino',
    rol: 'main',
    productos: [
      {
        nombre: 'Arroz Chino Tradicional',
        precio: 20000,
        descripcion: 'Pollo, jamón y camarones acompañado de salsa agridulce.',
      },
      {
        nombre: 'Porción de Costillas',
        precio: 15000,
        descripcion: 'Costillas de cerdo ahumadas.',
        opciones_menu: opciones(unica('Preparación', COSTILLAS_PREP)),
      },
      {
        nombre: 'Lumpias',
        precio: 8000,
        descripcion:
          'Lumpias de jamón, cerdo y vegetales. Precio estimado — confirmar con el local.',
        disponible: false,
      },
    ],
  },
  {
    nombre: 'Arepas',
    rol: 'main',
    productos: [
      {
        nombre: '1 proteína + 2 contornos',
        precio: 12000,
        descripcion: `${AREPA_DESC} Elige 1 proteína y 2 contornos.`,
        opciones_menu: opciones(
          unica('Proteína', AREPA_PROTEINAS),
          unica('Contornos', AREPA_CONTORNOS, { min: 2, max: 2 }),
          unica('Bebida incluida', AREPA_BEBIDAS),
        ),
      },
      {
        nombre: '2 proteínas + 1 contorno',
        precio: 15000,
        descripcion: `${AREPA_DESC} Elige 2 proteínas y 1 contorno.`,
        opciones_menu: opciones(
          unica('Proteínas', AREPA_PROTEINAS, { min: 2, max: 2 }),
          unica('Contorno', AREPA_CONTORNOS),
          unica('Bebida incluida', AREPA_BEBIDAS),
        ),
      },
    ],
  },
  {
    nombre: 'Bebidas',
    rol: 'drink',
    productos: [
      { nombre: 'Jugos naturales', precio: 4000, descripcion: 'Jugo natural.' },
      { nombre: 'Merengadas', precio: 5000, descripcion: 'Merengada.' },
      { nombre: 'Plastichip', precio: 3500, descripcion: 'Plastichip.' },
      { nombre: 'Refresco (botella)', precio: 3500, descripcion: 'Refresco personal.' },
      { nombre: 'Refresco 1 Litro', precio: 6000, descripcion: 'Refresco 1 L.' },
      { nombre: 'Refresco 1.25 Litros', precio: 7000, descripcion: 'Refresco 1.25 L.' },
      { nombre: 'Refresco 1.5 Litros', precio: 8000, descripcion: 'Refresco 1.5 L.' },
      { nombre: 'Refresco 2 Litros', precio: 9000, descripcion: 'Refresco 2 L.' },
      {
        nombre: 'Jugo del Valle 1.5 Litros',
        precio: 7000,
        descripcion: 'Jugo del Valle 1.5 L.',
      },
      {
        nombre: 'Jugo del Valle 500 ml',
        precio: 3500,
        descripcion: 'Jugo del Valle 500 ml.',
      },
      { nombre: 'Agua mineral', precio: 3000, descripcion: 'Agua mineral.' },
      { nombre: 'Malta', precio: 3000, descripcion: 'Malta.' },
    ],
  },
];

function buildHorarios() {
  const day = { open: true, ranges: [{ start: '11:00', end: '22:00' }] };
  const weekend = { open: true, ranges: [{ start: '11:00', end: '23:00' }] };
  return {
    timezone: 'America/Caracas',
    days: {
      monday: day,
      tuesday: day,
      wednesday: day,
      thursday: day,
      friday: weekend,
      saturday: weekend,
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
    color_secundario: COLOR_SEC,
    fuente_titulos: 'Montserrat',
    fuente_cuerpo: 'Open Sans',
    estilo_botones: 'rounded',
    mood_tags: ['fastfood', 'hamburguesas', 'delivery', 'palmira', 'gato'],
    descripcion_visual:
      'El Parche del Gato — hamburguesas, perros, salchipapas y alitas en Palmira.',
    layout_type: 'grid',
    colores_personalizados: {
      background: '#FFF8F0',
      card_surface: '#FFFFFF',
      text_on_primary: '#111111',
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
  const productCount = MENU.reduce((n, c) => n + c.productos.length, 0);
  console.log(`Menu: ${MENU.length} categories, ${productCount} products`);
  console.log('Logo exists:', existsSync(LOGO_PATH), LOGO_PATH);

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
    (delivery?.zones || []).map(
      (z) => `${z.name || z.nombre || z.id}: ${z.cost ?? z.precio ?? z.price}`,
    ),
  );
  console.log('Coords', MAPS_COORDS);

  if (dryRun) {
    console.log('Dry run OK. Would create', EMAIL, SLUG, NOMBRE);
    return;
  }

  let ownerId = null;
  const { data: listed } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
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
      menu_palette_primary: hexToArgbSigned(COLOR),
      menu_palette_accent: hexToArgbSigned(COLOR_SEC),
      menu_theme_mode: 'light',
      direccion: DIRECCION,
      latitud: MAPS_COORDS.lat,
      longitud: MAPS_COORDS.lng,
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
      p_batch_label: 'elparchedelgato-launch',
      p_expires_at: null,
      p_note: 'Activación El Parche del Gato',
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
      disponible: p.disponible !== false,
      orden: ordenProd++,
      ...(p.opciones_menu ? { opciones_menu: p.opciones_menu } : {}),
    }));
    const { error: prodError } = await supabase.from('productos').insert(rows);
    if (prodError) throw prodError;
    console.log(`  + ${cat.nombre}: ${rows.length}`);
  }

  const sidesId = categoryIds.get('Entradas');
  const drinksId = categoryIds.get('Bebidas');
  const suggestionKinds = ['acompanamiento', 'bebida'];
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
      categorias: [
        { id: sidesId, tipo: 'acompanamiento' },
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
  console.log('Nota: Lumpias quedó no disponible (precio no legible en el menú).');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
