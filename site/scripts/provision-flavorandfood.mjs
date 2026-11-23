/**
 * Provision "Flavor and Food" (slug: flavorandfood) — San Cristóbal / La Concordia.
 * - COP base + USD/VES checkout; FX mirrors Doleto
 * - Delivery zones from Auto Pizzas Nápoles (Táchira)
 * - Menu + extras from merchant brief; photos cropped from flyers
 *
 * Usage (from site/):
 *   node --env-file=.env.local scripts/provision-flavorandfood.mjs --dry-run
 *   node --env-file=.env.local scripts/provision-flavorandfood.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

const require = createRequire(import.meta.url);
const sharp = require('sharp');

const dryRun = process.argv.includes('--dry-run');
const SLUG = 'flavorandfood';
const NOMBRE = 'Flavor and Food';
const EMAIL = 'flavorandfood.adm@gmail.com';
const PASSWORD = '123456789';
const WHATSAPP = '+584247693565';
const INSTAGRAM = 'https://www.instagram.com/flavorandfood_/';
const TIKTOK = 'https://www.tiktok.com/@flavorandfood';
const FACEBOOK = 'https://www.facebook.com/FlavorAndFood';
const DIRECCION =
  'La Concordia Calle 3, San Cristóbal, Táchira, Venezuela\nReferencia: Diagonal a Politáchira. Bajando por el Inces Industrial y subiendo por la Licorería Madrid';
const COLOR = '#F15A24';
const CATEGORIA = 'Comida rápida / Burgers';
const NAPOLES_ID = '72965186-b3b9-4974-85d6-53bef1b4a400';
const DOLETO_ID = '85f14385-c187-407a-841f-a05dfd0c46fc';
const LAT = 7.7596804;
const LNG = -72.2332672;
const ASSETS = resolve(
  process.env.USERPROFILE || '',
  '.cursor/projects/c-Users-bryan-Documents-projects-kosmenu-app/assets',
);
const LOGO_PATH = join(
  ASSETS,
  'c__Users_bryan_AppData_Roaming_Cursor_User_workspaceStorage_53cc2968cfd4bdf0512a57da28cf1ff5_images_image-1d363439-1cb0-48bb-b7cb-636eb73aac37.jpg',
);
const FLYER_DOGS = join(
  ASSETS,
  'c__Users_bryan_AppData_Roaming_Cursor_User_workspaceStorage_53cc2968cfd4bdf0512a57da28cf1ff5_images_image-cd7ab28b-49d7-45f7-811c-013039c15b62.png',
);
const FLYER_BURGERS = join(
  ASSETS,
  'c__Users_bryan_AppData_Roaming_Cursor_User_workspaceStorage_53cc2968cfd4bdf0512a57da28cf1ff5_images_image-e00ec6f3-f033-4e52-84f3-8c282c513dcc.png',
);
const FLYER_ANTOJOS = join(
  ASSETS,
  'c__Users_bryan_AppData_Roaming_Cursor_User_workspaceStorage_53cc2968cfd4bdf0512a57da28cf1ff5_images_image-ccf5909f-4098-4b1c-b76a-4fb1124d908a.png',
);
const CROP_DIR = resolve('scripts/_flavor_imgs');
const PRODUCT_BUCKET = 'product-images';
const LOGO_BUCKET = 'logos-comercios';
const EXTRA_PRICE = 2000;

const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const anonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim();
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

function removals(ingredientNames) {
  return {
    version: 1,
    exclusiones: {
      activadas: true,
      titulo: '¿Quieres quitar algo?',
      pregunta_activada: true,
      pregunta: '¿Quieres quitar algún ingrediente?',
      desde_descripcion: false,
      ingredientes: ingredientNames.map((nombre) => ({ id: oid('r'), nombre })),
    },
  };
}

function withGroupsAndRemovals(groups, ingredientNames) {
  return {
    ...withGroups(groups),
    personalizacion: removals(ingredientNames),
  };
}

function extrasGroup(names) {
  return group({
    nombre: 'Extras',
    tipo: 'multiple',
    obligatorio: false,
    min: 0,
    max: Math.max(names.length, 1),
    opciones: names.map((nombre) => ({ nombre, precio: EXTRA_PRICE })),
  });
}

const REFRESCO_SABORES = [
  'Coca-Cola',
  'Pepsi',
  'Frescolita',
  'Naranja',
  'Uva',
  'Chinoto',
  'Lima-limón',
];

function refrescoSaboresGroup() {
  return group({
    nombre: 'Sabores',
    opciones: REFRESCO_SABORES.map((nombre) => ({ nombre })),
  });
}

const DOG_EXTRAS = ['Queso amarillo', 'Queso blanco', 'Tocineta', 'Maíz', 'Salchicha'];
const BURGER_EXTRAS = [
  'Huevo',
  'Tocineta',
  'Croqueta de pollo',
  'Croqueta de carne',
  'Lomo de cerdo',
  'Carne mechada',
  'Pollo mechado',
  'Loncha de queso',
  'Loncha de jamón',
];
const SALCHIPAPA_EXTRAS = [
  'Maíz',
  'Tocineta',
  'Queso amarillo',
  'Carne mechada',
  'Pollo mechado',
];

const DOG_SENCILLO_REMOVALS = [
  'Salchicha',
  'Vegetales',
  'Papitas al hilo',
  'Queso blanco',
  'Salsas',
];
const DOG_ESPECIAL_REMOVALS = [
  'Salchicha',
  'Vegetales',
  'Mechada',
  'Papitas al hilo',
  'Queso blanco',
  'Salsas',
];
const BURGER_BASE_REMOVALS = [
  'Huevo',
  'Jamón',
  'Queso amarillo',
  'Tomate',
  'Cebolla',
  'Lechuga',
  'Papitas al hilo',
  'Salsas',
];
const BURGER_TRIPLE_REMOVALS = [
  'Carne',
  'Pollo',
  'Lomo ahumado',
  'Huevo',
  'Jamón',
  'Queso amarillo',
  'Vegetales',
  'Papitas al hilo',
  'Salsas',
];
const BURGER_MECHADA_REMOVALS = [
  'Mechada',
  'Huevo',
  'Jamón',
  'Queso amarillo',
  'Tomate',
  'Cebolla',
  'Lechuga',
  'Papitas al hilo',
  'Salsas',
];
const BURGER_MECHADA_2_REMOVALS = [
  'Mechada',
  'Croqueta 1',
  'Croqueta 2',
  'Huevo',
  'Jamón',
  'Queso amarillo',
  'Tomate',
  'Cebolla',
  'Lechuga',
  'Papitas al hilo',
  'Salsas',
];
const BURGER_CRISPY_REMOVALS = [
  'Pollo crispy',
  'Lechuga',
  'Tomate',
  'Cebolla',
  'Jamón',
  'Queso amarillo',
  'Tocineta',
  'Salsas',
];

function buildMenu() {
  return [
    {
      nombre: 'Flavor Dogs',
      productos: [
        {
          nombre: "Dog's sencillo",
          precio: 5000,
          descripcion:
            'Salchicha, vegetales, papitas al hilo, queso blanco y salsas.',
          imageKey: 'dog-sencillo',
          opciones_menu: withGroupsAndRemovals(
            [extrasGroup(DOG_EXTRAS)],
            DOG_SENCILLO_REMOVALS,
          ),
        },
        {
          nombre: "Dog's especial",
          precio: 10000,
          descripcion:
            'Salchicha, vegetales, pollo o carne mechada, papitas al hilo, queso blanco y salsas.',
          imageKey: 'dog-especial',
          opciones_menu: withGroupsAndRemovals(
            [
              group({
                nombre: 'Mechada',
                opciones: [
                  { nombre: 'Carne mechada' },
                  { nombre: 'Pollo mechado' },
                ],
              }),
              extrasGroup(DOG_EXTRAS),
            ],
            DOG_ESPECIAL_REMOVALS,
          ),
        },
      ],
    },
    {
      nombre: 'Flavor Burgers',
      productos: [
        {
          nombre: 'Hamburguesa sencilla',
          precio: 12000,
          descripcion:
            'Croqueta de carne, pollo o lomo en pan pequeño, con huevo, jamón, queso amarillo, tomate, cebolla, lechuga, papitas al hilo y salsas.',
          imageKey: 'burger-sencilla',
          opciones_menu: withGroupsAndRemovals(
            [
              group({
                nombre: 'Croqueta',
                opciones: [
                  { nombre: 'Carne' },
                  { nombre: 'Pollo' },
                  { nombre: 'Lomo ahumado' },
                ],
              }),
              extrasGroup(BURGER_EXTRAS),
            ],
            BURGER_BASE_REMOVALS,
          ),
        },
        {
          nombre: 'Hamburguesa triple',
          precio: 20000,
          descripcion:
            'Pan grande con carne, pollo y lomo ahumado, más los acompañamientos (huevo, jamón, queso, vegetales, papitas al hilo y salsas).',
          imageKey: 'burger-triple',
          opciones_menu: withGroupsAndRemovals(
            [extrasGroup(BURGER_EXTRAS)],
            BURGER_TRIPLE_REMOVALS,
          ),
        },
        {
          nombre: 'Hamburguesa de carne o pollo mechado',
          precio: 20000,
          descripcion:
            'En pan grande, con los acompañamientos. Elige carne o pollo mechado.',
          imageKey: 'burger-especial',
          opciones_menu: withGroupsAndRemovals(
            [
              group({
                nombre: 'Mechada',
                opciones: [
                  { nombre: 'Carne mechada' },
                  { nombre: 'Pollo mechado' },
                ],
              }),
              extrasGroup(BURGER_EXTRAS),
            ],
            BURGER_MECHADA_REMOVALS,
          ),
        },
        {
          nombre: 'Hamburguesa mechada con 2 croquetas',
          precio: 23000,
          descripcion:
            'Carne o pollo mechado más dos croquetas a elección, con los acompañamientos.',
          imageKey: 'burger-combinada',
          opciones_menu: withGroupsAndRemovals(
            [
              group({
                nombre: 'Mechada',
                opciones: [
                  { nombre: 'Carne mechada' },
                  { nombre: 'Pollo mechado' },
                ],
              }),
              group({
                nombre: 'Croqueta 1',
                opciones: [
                  { nombre: 'Carne' },
                  { nombre: 'Pollo' },
                  { nombre: 'Lomo ahumado' },
                ],
              }),
              group({
                nombre: 'Croqueta 2',
                opciones: [
                  { nombre: 'Carne' },
                  { nombre: 'Pollo' },
                  { nombre: 'Lomo ahumado' },
                ],
              }),
              extrasGroup(BURGER_EXTRAS),
            ],
            BURGER_MECHADA_2_REMOVALS,
          ),
        },
        {
          nombre: 'Hamburguesa Crispy',
          precio: 23000,
          descripcion:
            'Pollo crispy, lechuga, tomate, cebolla, jamón, queso amarillo, tocineta y salsas.',
          imageKey: null,
          opciones_menu: withGroupsAndRemovals(
            [extrasGroup(BURGER_EXTRAS)],
            BURGER_CRISPY_REMOVALS,
          ),
        },
      ],
    },
    {
      nombre: 'Flavor Antojos',
      productos: [
        {
          nombre: 'Ración de papas 200 g',
          precio: 8000,
          descripcion: 'Porción de papas fritas (200 g). Sin extras.',
          imageKey: 'papas',
        },
        {
          nombre: 'Salchipapa clásica con queso',
          precio: 14000,
          descripcion: 'Salchipapa clásica con queso amarillo.',
          imageKey: 'salchipapa-clasica',
          opciones_menu: withGroups([extrasGroup(SALCHIPAPA_EXTRAS)]),
        },
        {
          nombre: 'Salchipapa especial mechada',
          precio: 20000,
          descripcion: 'Salchipapa especial de carne o pollo mechado.',
          imageKey: 'salchipapa-especial',
          opciones_menu: withGroups([
            group({
              nombre: 'Mechada',
              opciones: [
                { nombre: 'Carne mechada' },
                { nombre: 'Pollo mechado' },
              ],
            }),
            extrasGroup(SALCHIPAPA_EXTRAS),
          ]),
        },
        {
          nombre: 'Salchipapa especial maíz, queso y tocineta',
          precio: 25000,
          descripcion: 'Salchipapa especial con maíz, queso y tocineta.',
          imageKey: null,
          opciones_menu: withGroups([extrasGroup(SALCHIPAPA_EXTRAS)]),
        },
        {
          nombre: 'Nuggets con papas (5 und)',
          precio: 20000,
          descripcion: '5 nuggets con papas fritas. Sin extras.',
          imageKey: 'nuggets',
        },
        {
          nombre: 'Pollo a la broaster con papas (2 piezas)',
          precio: 20000,
          descripcion: '2 piezas de pollo a la broaster con papas. Sin extras.',
          imageKey: 'broaster',
        },
        {
          nombre: 'Teque Flavor (4 und)',
          precio: 12000,
          descripcion:
            '4 tequeños de 10 cm. Elige el relleno. Sin extras adicionales.',
          imageKey: 'tequenos',
          opciones_menu: withGroups([
            group({
              nombre: 'Relleno',
              opciones: [
                { nombre: 'Queso' },
                { nombre: 'Jamón con queso' },
                { nombre: 'Bocadillo con queso' },
              ],
            }),
          ]),
        },
        {
          nombre: 'Shawarma mixto',
          precio: 0,
          descripcion: 'Precio a consultar. Sin extras por el momento.',
          imageKey: null,
        },
      ],
    },
    {
      nombre: 'Bebidas',
      productos: [
        {
          nombre: 'Refresco personal',
          precio: 3000,
          descripcion: 'Gaseosa personal fría, botella individual.',
          imageKey: null,
          opciones_menu: withGroups([refrescoSaboresGroup()]),
        },
        {
          nombre: 'Refresco de 1 litro',
          precio: 6000,
          descripcion: 'Gaseosa de 1 litro, ideal para compartir.',
          imageKey: null,
          opciones_menu: withGroups([refrescoSaboresGroup()]),
        },
        {
          nombre: 'Agua de panela',
          precio: 3000,
          descripcion: 'Agua de panela natural, servida fría.',
          imageKey: null,
        },
        {
          nombre: 'Jugo de mora',
          precio: 4000,
          descripcion: 'Jugo natural de mora, fresco y batido.',
          imageKey: null,
        },
        {
          nombre: 'Jugo de parchita',
          precio: 4000,
          descripcion: 'Jugo natural de parchita (maracuyá), fresco y batido.',
          imageKey: null,
        },
        {
          nombre: 'Nestea',
          precio: 3500,
          descripcion: 'Té frío Nestea con hielo.',
          imageKey: null,
        },
        {
          nombre: 'Pulp',
          precio: 3500,
          descripcion: 'Jugo Pulp embotellado, listo para tomar.',
          imageKey: null,
        },
      ],
    },
  ];
}

function digital(name, fields) {
  return JSON.stringify({ name, fields });
}

function paymentRows(comercioId) {
  return [
    {
      comercio_id: comercioId,
      tipo: 'efectivo__cop',
      nombre: 'Efectivo',
      descripcion: 'Pago en efectivo en pesos colombianos.',
      detalles: 'Por favor, usa billetes en buen estado.',
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
      tipo: 'efectivo__ves',
      nombre: 'Efectivo',
      descripcion: 'Pago en efectivo en bolívares.',
      detalles: 'Por favor, usa billetes en buen estado.',
    },
    {
      comercio_id: comercioId,
      tipo: 'transferencia__ves__1',
      nombre: 'Pago digital: Pago Móvil BDV',
      descripcion: 'Cuenta de pago digital',
      detalles: digital('Pago Móvil BDV', [
        { type: 'texto', label: 'Banco', value: '0102 Banco de Venezuela' },
        { type: 'id', label: 'Cédula', value: 'V-24743964' },
        { type: 'telefono', label: 'Telf', value: '+584247693565' },
      ]),
    },
    {
      comercio_id: comercioId,
      tipo: 'transferencia__ves__2',
      nombre: 'Pago digital: Pago Móvil Provincial',
      descripcion: 'Cuenta de pago digital',
      detalles: digital('Pago Móvil Provincial', [
        { type: 'texto', label: 'Banco', value: '0108 Provincial (BBVA)' },
        { type: 'id', label: 'Cédula', value: 'V-19910224' },
        { type: 'telefono', label: 'Telf', value: '+584247815956' },
      ]),
    },
    {
      comercio_id: comercioId,
      tipo: 'transferencia__ves__3',
      nombre: 'Pago digital: Pago Móvil BDV / Banesco',
      descripcion: 'Cuenta de pago digital',
      detalles: digital('Pago Móvil BDV / Banesco', [
        { type: 'texto', label: 'Bancos', value: '0102 BDV / 0134 Banesco' },
        { type: 'id', label: 'Cédula', value: 'V-19910224' },
        { type: 'telefono', label: 'Telf', value: '+584121174522' },
      ]),
    },
    {
      comercio_id: comercioId,
      tipo: 'transferencia__cop__1',
      nombre: 'Pago digital: Nequi',
      descripcion: 'Cuenta de pago digital',
      detalles: digital('Nequi', [
        { type: 'texto', label: 'Titular', value: 'Julio Leandro Pérez' },
        { type: 'telefono', label: 'Número', value: '+573202078703' },
      ]),
    },
    {
      comercio_id: comercioId,
      tipo: 'transferencia__cop__2',
      nombre: 'Pago digital: Bancolombia',
      descripcion: 'Cuenta de pago digital',
      detalles: digital('Bancolombia', [
        { type: 'texto', label: 'Titular', value: 'Julio Leandro Pérez' },
        { type: 'texto', label: 'Tipo', value: 'Ahorro' },
        { type: 'numero_cuenta', label: 'Nro. Cuenta', value: '81696029822' },
      ]),
    },
  ];
}

function brandingPayload({ delivery, rates, modes, sources }) {
  return {
    schema_version: 2,
    color_principal: COLOR,
    color_secundario: '#3C2415',
    fuente_titulos: 'Montserrat',
    fuente_cuerpo: 'Open Sans',
    estilo_botones: 'rounded',
    mood_tags: ['burgers', 'hotdogs', 'streetfood', 'familiar'],
    descripcion_visual:
      'Flavor and Food — dogs, burgers y antojos en La Concordia, San Cristóbal.',
    layout_type: 'grid',
    colores_personalizados: {
      background: '#FFF8F0',
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
      social_links: {
        instagram: INSTAGRAM,
        tiktok: TIKTOK,
        facebook: FACEBOOK,
      },
      order_management_mode: 'whatsapp_manual',
      whatsapp_order_format: 'detailed',
      checkout_currencies: ['COP', 'USD', 'VES'],
      moneda_default: 'COP',
      inicio_menu: {
        redes: true,
        catalogo: false,
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

async function cropFlyerPanels() {
  mkdirSync(CROP_DIR, { recursive: true });
  /** @type {Record<string, string>} */
  const map = {};

  async function cropFour(file, keys) {
    const meta = await sharp(file).metadata();
    const w = meta.width || 576;
    const h = meta.height || 1024;
    const panelH = Math.floor(h / 4);
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      if (!key) continue;
      const out = join(CROP_DIR, `${key}.webp`);
      // Prefer the photo side of each banner (right half alternating).
      const leftBias = i % 2 === 1;
      const cropW = Math.floor(w * 0.58);
      const left = leftBias ? 0 : w - cropW;
      await sharp(file)
        .extract({
          left: Math.max(0, left),
          top: i * panelH,
          width: Math.min(cropW, w),
          height: panelH,
        })
        .resize({ width: 1000, height: 1000, fit: 'cover' })
        .webp({ quality: 85 })
        .toFile(out);
      map[key] = out;
    }
  }

  // Dogs flyer: especial, sencillo, salchipapa clasica, salchipapa especial
  await cropFour(FLYER_DOGS, [
    'dog-especial',
    'dog-sencillo',
    'salchipapa-clasica',
    'salchipapa-especial',
  ]);
  // Burgers: triple, sencilla/croqueta, especial, combinada
  await cropFour(FLYER_BURGERS, [
    'burger-triple',
    'burger-sencilla',
    'burger-especial',
    'burger-combinada',
  ]);
  // Antojos: nuggets, papas, broaster, tequenos
  await cropFour(FLYER_ANTOJOS, ['nuggets', 'papas', 'broaster', 'tequenos']);

  return map;
}

async function invokeFunction(name, body, comercioId) {
  const res = await fetch(`${url}/functions/v1/${name}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${serviceKey}`,
      apikey: anonKey,
      'Content-Type': 'application/json',
      'x-comercio-id': comercioId,
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`${name} ${res.status}: ${json.message || json.error || res.statusText}`);
  }
  return json;
}

async function main() {
  const menu = buildMenu();
  const productCount = menu.reduce((n, c) => n + c.productos.length, 0);
  console.log(`Menu categories: ${menu.length}, products: ${productCount}`);

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
  delivery.enabled = true;
  delivery.currency = delivery.currency || 'COP';
  const doletoCfg = doleto.branding_ia?.config_negocio || {};
  const rates = structuredClone(doletoCfg.exchange_rates || {});
  const modes = structuredClone(doletoCfg.exchange_rate_modes || {});
  const sources = structuredClone(doletoCfg.exchange_rate_sources || {});

  console.log('Delivery zones from Napoles:', delivery?.zones?.length || 0);
  console.log('FX from Doleto:', { rates, modes, sources });
  console.log('Coords', LAT, LNG);
  console.log('Logo exists:', existsSync(LOGO_PATH));

  if (dryRun) {
    console.log('Dry run OK. Would create', EMAIL, SLUG);
    for (const cat of menu) {
      console.log(`- ${cat.nombre}`);
      for (const p of cat.productos) {
        console.log(`  · ${p.nombre} · $${p.precio} COP`);
      }
    }
    return;
  }

  const imageFiles = await cropFlyerPanels();
  console.log('Cropped images:', Object.keys(imageFiles).length);

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
      metodos_pago: ['Efectivo', 'Transferencia'],
      metodo_pago_predeterminado: 'Efectivo',
      estados_operacion: ['tachira'],
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
      .from(LOGO_BUCKET)
      .upload(objectPath, bytes, { contentType: 'image/jpeg', upsert: true });
    if (upErr) console.warn('Logo upload failed:', upErr.message);
    else {
      const logoUrl = supabase.storage.from(LOGO_BUCKET).getPublicUrl(objectPath)
        .data.publicUrl;
      await supabase.from('comercios').update({ logo_url: logoUrl }).eq('id', comercio.id);
      console.log('Logo', logoUrl);
    }
  }

  const { error: payErr } = await supabase
    .from('metodos_pago')
    .insert(paymentRows(comercio.id));
  if (payErr) throw payErr;
  console.log('Payment methods inserted');

  const { data: issued, error: issueError } = await supabase.rpc('issue_gift_cards', {
    p_count: 1,
    p_months: 1,
    p_batch_label: 'flavorandfood-launch',
    p_expires_at: null,
    p_note: 'Activación Flavor and Food',
    p_plan_code: 'menu_monthly',
  });
  if (issueError) throw issueError;
  const card = issued?.cards?.[0];
  if (!card?.id || !card?.code) throw new Error('Gift card issue failed');

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
  await supabase
    .from('gift_cards')
    .update({
      status: 'redeemed',
      redeemed_by_business: comercio.id,
      redeemed_by_user: ownerId,
      redeemed_at: new Date().toISOString(),
    })
    .eq('id', card.id);
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
  for (const cat of menu) {
    const rol =
      cat.nombre === 'Bebidas'
        ? 'drink'
        : cat.nombre === 'Flavor Antojos'
          ? 'side'
          : 'main';
    const { data: category, error } = await supabase
      .from('categorias')
      .insert({
        comercio_id: comercio.id,
        catalogo_id: catalog.id,
        nombre: cat.nombre,
        orden: ordenCat++,
        activo: true,
        rol,
      })
      .select('id')
      .single();
    if (error) throw error;
    categoryIds.set(cat.nombre, category.id);
  }

  /** @type {Array<{id:string,nombre:string,imageKey:string|null,needsAi:boolean}>} */
  const inserted = [];
  for (const cat of menu) {
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
          disponible: true,
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
        imageKey: p.imageKey || null,
        needsAi: !p.imageKey,
        categoria: cat.nombre,
        descripcion: p.descripcion || '',
      });
    }
  }
  console.log(`Inserted ${inserted.length} products`);

  // Upload flyer crops
  let imgOk = 0;
  for (const item of inserted) {
    if (!item.imageKey || !imageFiles[item.imageKey]) continue;
    const bytes = readFileSync(imageFiles[item.imageKey]);
    const objectPath = `${comercio.id}/ff_${item.id}.webp`;
    const { error: upErr } = await supabase.storage
      .from(PRODUCT_BUCKET)
      .upload(objectPath, bytes, { contentType: 'image/webp', upsert: true });
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
  console.log(`Flyer images applied: ${imgOk}`);

  // Upsell / venta sugerida
  const bebidasId = categoryIds.get('Bebidas');
  const antojosId = categoryIds.get('Flavor Antojos');
  const suggestionKinds = ['bebida', 'acompanamiento'];
  const upsellCategorias = [
    { id: bebidasId, tipo: 'bebida' },
    ...(antojosId ? [{ id: antojosId, tipo: 'acompanamiento' }] : []),
  ];
  const reglas = [...categoryIds.entries()].map(([nombre, categoria_id]) => ({
    categoria_id,
    categoria_origen: nombre,
    sugerir_tipos: suggestionKinds,
  }));
  const { data: comercioRow } = await supabase
    .from('comercios')
    .select('upsell_config')
    .eq('id', comercio.id)
    .single();
  const upsell_config = {
    ...(comercioRow?.upsell_config && typeof comercioRow.upsell_config === 'object'
      ? comercioRow.upsell_config
      : {}),
    upselling: true,
    pre_checkout: {
      activo: true,
      tipos: suggestionKinds,
      max_productos: 12,
      categorias: upsellCategorias,
      reglas,
    },
  };
  await supabase
    .from('comercios')
    .update({
      upsell_config,
      en_linea: true,
      onboarding_completed: true,
      updated_at: new Date().toISOString(),
    })
    .eq('id', comercio.id);
  await supabase.from('upsell_settings').upsert(
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
  console.log('Upsell enabled');

  // AI images for products without flyer photo
  const needAi = inserted.filter((p) => p.needsAi);
  if (needAi.length) {
    await supabase.rpc('ensure_ai_credits_wallet', {
      p_commerce_id: comercio.id,
      p_initial_credits: 30,
    });
    const { data: wallet } = await supabase
      .from('ai_credits_wallet')
      .select('credits_balance')
      .eq('commerce_id', comercio.id)
      .maybeSingle();
    const need = needAi.length + 5;
    if (Number(wallet?.credits_balance || 0) < need) {
      const add = need - Number(wallet?.credits_balance || 0);
      const { error: addErr } = await supabase.rpc('add_ai_credits', {
        p_commerce_id: comercio.id,
        p_amount: add,
        p_reason: 'flavorandfood_ai_images',
        p_metadata: { slug: SLUG },
      });
      if (addErr) {
        await supabase
          .from('ai_credits_wallet')
          .update({
            credits_balance: Number(wallet?.credits_balance || 0) + add,
            updated_at: new Date().toISOString(),
          })
          .eq('commerce_id', comercio.id);
      }
    }

    const items = needAi.map((p) => ({
      type: 'product',
      id: p.id,
      name: p.nombre,
      description: p.descripcion,
      category_name: p.categoria,
    }));
    try {
      const result = await invokeFunction(
        'generate-product-images-ai',
        { comercio_id: comercio.id, items },
        comercio.id,
      );
      console.log('AI images enqueued:', result.enqueued_jobs ?? items.length);
    } catch (err) {
      console.warn('AI enqueue failed:', err.message);
    }
  }

  console.log('\n=== DONE ===');
  console.log(`URL: https://elmenuxfa.com/v/${SLUG}`);
  console.log(`Admin: https://app.elmenuxfa.com`);
  console.log(`Email: ${EMAIL}`);
  console.log(`Password: ${PASSWORD}`);
  console.log(`WhatsApp: ${WHATSAPP}`);
  console.log(`Instagram: ${INSTAGRAM}`);
  console.log(`Gift card (redeemed): ${card.code}`);
  console.log(`Comercio id: ${comercio.id}`);
  console.log(`Products: ${inserted.length} | flyer imgs: ${imgOk} | AI pending: ${needAi.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
