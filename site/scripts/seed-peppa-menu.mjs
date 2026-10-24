/**
 * Seed Peppa (slug: peppa) menu from the paper menu.
 *
 * - Confirmed USD prices; pending prices use precio 0 + descripcion "A consultar".
 * - Uses option groups where they improve UX (empanada relleno tiers,
 *   arepa multi-contorno, café sizes).
 * - Never deletes existing categories/products unless --force.
 *
 * Usage (from site/):
 *   node --env-file=.env.local scripts/seed-peppa-menu.mjs --dry-run
 *   node --env-file=.env.local scripts/seed-peppa-menu.mjs
 *   node --env-file=.env.local scripts/seed-peppa-menu.mjs --force
 */

import { createClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';

const dryRun = process.argv.includes('--dry-run');
const force = process.argv.includes('--force');

const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '').trim();
const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
if (!url || !serviceKey) {
  console.error('Need NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const SLUG = 'peppa';

function oid(prefix) {
  return `${prefix}_${randomBytes(4).toString('hex')}`;
}

function uniqueGroup({ nombre, tipo = 'unica', obligatorio = true, min = 1, max = 1, opciones }) {
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

/** Shared contorno names for multi-fill arepas (confirmed fillings only). */
const AREPA_CONTORNOS = [
  'Queso guayanés',
  'Reina pepiada',
  'Ropa vieja',
  'Huevo de codorniz',
  'Lengua guisada',
  'Salchicha',
  'Llanera',
  'Pernil horneado',
  'Carne mechada',
  'Pollo mechado',
  'Cazón',
  'Queso amarillo',
  'Cochino asado',
  'Camarones rebosados',
  'Mariscos',
  'Asadura',
  'Muchacho redondo',
  'Perico',
];

function buildMenu() {
  /** @type {Array<{ nombre: string, productos: Array<{ nombre: string, precio: number, descripcion?: string, opciones_menu?: object }> }>} */
  const categories = [];

  categories.push({
    nombre: 'Empanadas',
    productos: [
      {
        nombre: 'Empanada tradicional',
        precio: 2.5,
        descripcion: 'Elige el relleno · $2,50 c/u',
        opciones_menu: withGroups([
          uniqueGroup({
            nombre: 'Relleno',
            opciones: [
              { nombre: 'Carne mechada' },
              { nombre: 'Carne molida' },
              { nombre: 'Pollo' },
              { nombre: 'Asadura' },
              { nombre: 'Queso' },
              { nombre: 'Salchicha' },
              { nombre: 'Jamón y queso' },
              { nombre: 'Cazón' },
            ],
          }),
        ]),
      },
      {
        nombre: 'Empanada especial',
        precio: 3.0,
        descripcion: 'Elige el relleno · $3,00 c/u',
        opciones_menu: withGroups([
          uniqueGroup({
            nombre: 'Relleno',
            opciones: [
              { nombre: 'Gordon Bleu de pollo' },
              { nombre: 'Gordon Bleu de carne' },
              { nombre: 'Lengua' },
              { nombre: 'Pabellón' },
              { nombre: 'Combinada' },
            ],
          }),
        ]),
      },
      {
        nombre: 'Empanada premium',
        precio: 3.6,
        descripcion: 'Elige el relleno · $3,60 c/u',
        opciones_menu: withGroups([
          uniqueGroup({
            nombre: 'Relleno',
            opciones: [
              { nombre: 'Guiso de mariscos' },
              { nombre: 'Cochino asado / queso amarillo' },
              { nombre: 'Asado negro' },
              { nombre: 'Pernil / queso amarillo' },
            ],
          }),
        ]),
      },
    ],
  });

  categories.push({
    nombre: 'Desayunos',
    productos: [
      { nombre: 'Desayuno oriental', precio: 10.5 },
      { nombre: 'Desayuno criollo', precio: 10.5 },
      { nombre: 'Desayuno americano', precio: 10.5 },
      { nombre: 'Omelette', precio: 6.8 },
    ],
  });

  categories.push({
    nombre: 'Almuerzos',
    productos: [
      {
        nombre: 'Bistec encebollado',
        precio: 6.5,
        descripcion: 'Acompañado de arroz, ensalada, tajadas y puré',
      },
      {
        nombre: 'Pollo a la plancha',
        precio: 6.5,
        descripcion: 'Acompañado de arroz, ensalada, tajadas y puré',
      },
      {
        nombre: 'Pasta boloñesa',
        precio: 6.5,
      },
      {
        nombre: 'Asado negro',
        precio: 6.5,
        descripcion: 'Acompañado de arroz, ensalada, tajadas y puré',
      },
      {
        nombre: 'Lengua guisada',
        precio: 6.5,
        descripcion: 'Acompañado de arroz, ensalada, tajadas y puré',
      },
      {
        nombre: 'Pernil horneado',
        precio: 6.5,
        descripcion: 'Acompañado de arroz, ensalada, tajadas y puré',
      },
    ],
  });

  const arepaProducts = [
    { nombre: 'Arepa de queso guayanés', precio: 8.5 },
    { nombre: 'Arepa reina pepiada', precio: 7.5 },
    { nombre: 'Arepa de ropa vieja', precio: 7.5 },
    { nombre: 'Arepa de huevo de codorniz', precio: 7.5 },
    { nombre: 'Arepa de lengua guisada', precio: 7.0 },
    { nombre: 'Arepa de salchicha', precio: 7.5 },
    { nombre: 'Arepa llanera', precio: 8.0 },
    { nombre: 'Arepa de pernil horneado', precio: 8.5 },
    { nombre: 'Arepa de carne mechada', precio: 8.5 },
    { nombre: 'Arepa de pollo mechado', precio: 8.5 },
    { nombre: 'Arepa de cazón', precio: 7.0 },
    { nombre: 'Arepa de queso amarillo', precio: 7.0 },
    { nombre: 'Arepa de cochino asado', precio: 8.0 },
    { nombre: 'Arepa de camarones rebosados', precio: 11.0 },
    { nombre: 'Arepa de mariscos', precio: 12.5 },
    {
      nombre: 'Arepa de asadura',
      precio: 7.15,
      descripcion: 'Precio según última lectura del menú',
    },
    { nombre: 'Arepa de muchacho redondo', precio: 8.5 },
    { nombre: 'Arepa de perico', precio: 7.5 },
    {
      nombre: 'Arepa de 2 contornos',
      precio: 8.8,
      descripcion: 'Elige 2 rellenos',
      opciones_menu: withGroups([
        uniqueGroup({
          nombre: 'Contornos',
          tipo: 'multiple',
          obligatorio: true,
          min: 2,
          max: 2,
          opciones: AREPA_CONTORNOS.map((nombre) => ({ nombre })),
        }),
      ]),
    },
    {
      nombre: 'Arepa de 3 contornos',
      precio: 8.8,
      descripcion: 'Elige 3 rellenos',
      opciones_menu: withGroups([
        uniqueGroup({
          nombre: 'Contornos',
          tipo: 'multiple',
          obligatorio: true,
          min: 3,
          max: 3,
          opciones: AREPA_CONTORNOS.map((nombre) => ({ nombre })),
        }),
      ]),
    },
    {
      nombre: 'Arepa mediana (2 contornos)',
      precio: 6.0,
      descripcion: 'Elige 2 rellenos',
      opciones_menu: withGroups([
        uniqueGroup({
          nombre: 'Contornos',
          tipo: 'multiple',
          obligatorio: true,
          min: 2,
          max: 2,
          opciones: AREPA_CONTORNOS.map((nombre) => ({ nombre })),
        }),
      ]),
    },
    { nombre: 'Sándwich clásico', precio: 4.5 },
  ];

  categories.push({ nombre: 'Arepas', productos: arepaProducts });

  categories.push({
    nombre: 'Raciones',
    productos: [
      { nombre: 'Mini empanaditas (6 unidades)', precio: 3.5 },
      { nombre: 'Mini pastelitos (6 unidades)', precio: 3.5 },
      { nombre: 'Mini tequeños (8 unidades)', precio: 3.0 },
    ],
  });

  categories.push({
    nombre: 'Jugos naturales',
    productos: [
      { nombre: 'Jugo de melón', precio: 2.5 },
      { nombre: 'Jugo de lechosa', precio: 2.5 },
      { nombre: 'Jugo de piña', precio: 2.5 },
      { nombre: 'Jugo de fresa', precio: 2.5 },
      { nombre: 'Jugo de parchita', precio: 3.0 },
      { nombre: 'Jugo de limón', precio: 3.0 },
      { nombre: 'Jugo de mora', precio: 3.0 },
    ],
  });

  categories.push({
    nombre: 'Merengadas',
    productos: [
      { nombre: 'Merengada de melón', precio: 3.5 },
      { nombre: 'Merengada de lechosa', precio: 3.5 },
      { nombre: 'Merengada de fresa', precio: 3.5 },
      { nombre: 'Merengada de Oreo', precio: 3.5 },
      { nombre: 'Merengada de Samba', precio: 3.5 },
      { nombre: 'Merengada de Brownie', precio: 3.5 },
      { nombre: 'Toddy frío', precio: 5.0 },
    ],
  });

  categories.push({
    nombre: 'Café',
    productos: [
      {
        nombre: 'Guayoyo',
        precio: 0.7,
        descripcion: 'Elige el tamaño',
        opciones_menu: withGroups([
          uniqueGroup({
            nombre: 'Tamaño',
            opciones: [
              { nombre: 'Pequeño', precio: 0, predeterminada: true },
              { nombre: 'Grande', precio: 0.5 },
            ],
          }),
        ]),
      },
      {
        nombre: 'Café con leche',
        precio: 1.3,
        descripcion: 'Elige el tamaño',
        opciones_menu: withGroups([
          uniqueGroup({
            nombre: 'Tamaño',
            opciones: [
              { nombre: 'Pequeño', precio: 0, predeterminada: true },
              { nombre: 'Grande', precio: 1.4 },
            ],
          }),
        ]),
      },
      {
        nombre: 'Marrón',
        precio: 1.3,
        descripcion: 'Elige el tamaño',
        opciones_menu: withGroups([
          uniqueGroup({
            nombre: 'Tamaño',
            opciones: [
              { nombre: 'Pequeño', precio: 0, predeterminada: true },
              { nombre: 'Grande', precio: 1.4 },
            ],
          }),
        ]),
      },
      { nombre: 'Capuccino', precio: 3.5 },
      { nombre: 'Capuvainilla', precio: 3.5 },
      { nombre: 'Caramel Frapu', precio: 3.5 },
    ],
  });

  categories.push({
    nombre: 'Infusiones',
    productos: [
      { nombre: 'Té de menta', precio: 2.1 },
      { nombre: 'Té de Jamaica', precio: 2.1 },
      { nombre: 'Té verde', precio: 2.1 },
      { nombre: 'Té de manzanilla', precio: 2.1 },
      { nombre: 'Té de frutos del bosque', precio: 2.3 },
      { nombre: 'Té frío', precio: 2.3 },
    ],
  });

  return categories;
}

async function main() {
  const menu = buildMenu();
  const productCount = menu.reduce((n, c) => n + c.productos.length, 0);
  console.log(`Menu plan: ${menu.length} categories, ${productCount} products`);
  for (const cat of menu) {
    console.log(`  · ${cat.nombre} (${cat.productos.length})`);
  }

  const { data: comercio, error: comercioError } = await supabase
    .from('comercios')
    .select('id,slug,nombre,moneda')
    .eq('slug', SLUG)
    .maybeSingle();
  if (comercioError) throw comercioError;
  if (!comercio) {
    console.error(`Comercio slug=${SLUG} not found`);
    process.exit(1);
  }
  console.log(`Comercio: ${comercio.nombre} (${comercio.slug}) ${comercio.id} moneda=${comercio.moneda}`);

  const { count: existingProducts } = await supabase
    .from('productos')
    .select('id', { count: 'exact', head: true })
    .eq('comercio_id', comercio.id);
  const { count: existingCats } = await supabase
    .from('categorias')
    .select('id', { count: 'exact', head: true })
    .eq('comercio_id', comercio.id);

  if ((existingProducts ?? 0) > 0 || (existingCats ?? 0) > 0) {
    if (!force) {
      console.error(
        `Peppa already has ${existingCats} categories / ${existingProducts} products. Pass --force to wipe and recreate.`,
      );
      process.exit(1);
    }
    console.warn('--force: deleting existing Peppa catalog rows…');
    if (!dryRun) {
      const { error: delProd } = await supabase
        .from('productos')
        .delete()
        .eq('comercio_id', comercio.id);
      if (delProd) throw delProd;
      const { error: delCat } = await supabase
        .from('categorias')
        .delete()
        .eq('comercio_id', comercio.id);
      if (delCat) throw delCat;
      const { error: delCatalog } = await supabase
        .from('catalogos')
        .delete()
        .eq('comercio_id', comercio.id);
      if (delCatalog) throw delCatalog;
    }
  }

  if (dryRun) {
    console.log('Dry run OK. No DB writes.');
    return;
  }

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
  console.log('Catalog:', catalog.id);

  let ordenCat = 0;
  let insertedProducts = 0;
  for (const cat of menu) {
    const { data: category, error: catError } = await supabase
      .from('categorias')
      .insert({
        comercio_id: comercio.id,
        catalogo_id: catalog.id,
        nombre: cat.nombre,
        orden: ordenCat,
        activo: true,
      })
      .select('id')
      .single();
    if (catError) throw catError;
    ordenCat += 1;

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
    insertedProducts += rows.length;
    console.log(`  + ${cat.nombre}: ${rows.length} products`);
  }

  console.log(`Done. Inserted ${insertedProducts} products across ${menu.length} categories.`);
  console.log(
    'Skipped (por confirmar): arepas sin precio, adicionales de arepa, Vanilla/Caramel Latte, Mocaccino, Bombón.',
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
