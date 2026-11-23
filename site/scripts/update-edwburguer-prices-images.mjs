/**
 * Apply Edw Burguer SC real COP prices, product photos and adicionales.
 * "15 cop" on the client's list is 15.000 COP. Huevo is written as 1.000 COP.
 *
 * Usage (from site/):
 *   node --env-file=.env.local scripts/update-edwburguer-prices-images.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import sharp from 'sharp';

const COMERCIO_ID = '7eab3062-690e-4857-8c3f-258c516549d7';
const ZIP_PATH = join(
  process.env.USERPROFILE || '',
  'Downloads/EDW_BURGUER_15_productos_individuales.zip',
);
const BUCKET = 'product-images';
let imgDir = '';

function imageDir() {
  if (imgDir) return imgDir;
  imgDir = mkdtempSync(join(tmpdir(), 'edwburguer-'));
  execFileSync('tar', ['-xf', ZIP_PATH, '-C', imgDir]);
  return imgDir;
}

const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
if (!url || !serviceKey) {
  console.error('Need NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const ADICIONALES = [
  { id: 'tocineta', nombre: 'Tocineta', precio: 3000 },
  { id: 'maiz', nombre: 'Maíz', precio: 3000 },
  { id: 'queso', nombre: 'Queso', precio: 3000 },
  { id: 'huevo', nombre: 'Huevo', precio: 1000 },
  { id: 'proteina', nombre: 'Proteína', precio: 6000 },
  { id: 'champinones', nombre: 'Champiñones', precio: 3000 },
];

function slugId(nombre) {
  return nombre
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48);
}

/** Toppings the customer can remove. Only clásicas and especiales. */
const QUITAR = {
  Classic: ['Cheddar', 'Vegetales', 'Pepinillos', 'Salsa'],
  'Doble carne cheddar y tocineta': ['Cheddar', 'Tocineta', 'Salsas'],
  Hawaiana: ['Piña', 'Cheddar', 'Vegetales', 'Salsas'],
  'Lunch Bowl': ['Papas fritas', 'Pollo crispy', 'Ensalada', 'Queso rallado', 'Maíz'],
  Cheeseburger: ['Cheddar', 'Cebolla', 'Pepinillos', 'Salsas'],
  Oklahoma: ['Cebolla', 'Tocineta', 'Cheddar', 'Pepinillos', 'Salsas'],
  Crispy: ['Cheddar', 'Tocineta', 'Vegetales', 'Pepinillos', 'Salsas'],
  Chuleta: ['Vegetales', 'Salsa', 'Queso cheddar'],
  Criolla: ['Vegetales', 'Maíz', 'Huevo', 'Aguacate', 'Salsas'],
  'Burger Wrap': ['Queso cheddar', 'Vegetales', 'Salsas'],
  'Mixta 2 carnes': ['Vegetales', 'Cheddar', 'Salsas'],
  'Mixta 3 carnes': ['Vegetales', 'Cheddar', 'Salsas'],
  'Mixta 4 carnes': ['Vegetales', 'Cheddar', 'Salsas'],
  'Perro normal': ['Cebolla', 'Papas hilo', 'Queso rallado', 'Salsa'],
  'Perro con proteína': ['Proteína', 'Cebolla', 'Papas hilo', 'Queso rallado', 'Salsa'],
};

function opcionesMenu(nombre) {
  const quitar = QUITAR[nombre] || [];
  return {
    activadas: true,
    grupos: [
      {
        id: 'adicionales',
        nombre: 'Adicionales',
        tipo: 'multiple',
        obligatorio: false,
        min: 0,
        max: ADICIONALES.length,
        opciones: ADICIONALES.map((item) => ({
          id: item.id,
          nombre: item.nombre,
          precio: item.precio,
          activo: true,
        })),
      },
    ],
    ...(quitar.length
      ? {
          personalizacion: {
            version: 1,
            exclusiones: {
              activadas: true,
              titulo: '¿Quieres quitar algo?',
              ingredientes: quitar.map((item) => ({
                id: slugId(item),
                nombre: item,
              })),
            },
          },
        }
      : {}),
  };
}

/** Current DB name -> new row. Image files are the client's 1024 pngs. */
const UPDATES = [
  {
    from: 'Classic',
    nombre: 'Classic',
    precio: 15000,
    descripcion:
      'Pan brioche, carne de solomo jugosa, cheddar, vegetales, pepinillos y salsa.',
    image: '01_Hamburguesa_clasica_1024.png',
    orden: 0,
    categoria: 'Hamburguesas clásicas',
  },
  {
    from: 'Double Cheddar & Bacon',
    nombre: 'Doble carne cheddar y tocineta',
    precio: 26000,
    descripcion:
      'Pan brioche, dos carnes de solomo, extra cheddar, tocineta y salsas.',
    image: '02_Hamburguesa_doble_1024.png',
    orden: 1,
    categoria: 'Hamburguesas clásicas',
  },
  {
    from: 'Hawaiana Tropical',
    nombre: 'Hawaiana',
    precio: 18000,
    descripcion:
      'Pan brioche, solomo jugoso, piña fresca caramelizada, cheddar, vegetales y salsas.',
    image: '03_Hamburguesa_hawaiana_1024.png',
    orden: 2,
    categoria: 'Hamburguesas clásicas',
  },
  {
    from: 'Lunch Bowl',
    nombre: 'Lunch Bowl',
    precio: 15000,
    promo: true,
    descripcion:
      'Promo. Base de papas fritas, pollo crispy, ensalada fresca, queso rallado y maíz.',
    image: '11_Lunch_bowl_1024.png',
    orden: 3,
    categoria: 'Hamburguesas clásicas',
  },
  {
    from: 'Cheeseburger',
    nombre: 'Cheeseburger',
    precio: 15000,
    descripcion:
      'Pan brioche, solomo jugoso, doble cheddar, cebolla en cuadritos, pepinillos y salsas de la casa.',
    image: '08_Hamburguesa_doble_cheddar_1024.png',
    orden: 4,
    categoria: 'Hamburguesas clásicas',
  },
  {
    from: 'Oklahoma',
    nombre: 'Oklahoma',
    precio: 25000,
    descripcion:
      'Pan brioche, dos carnes de solomo, cebolla en juliana, tocineta, cheddar, pepinillos y salsas.',
    image: '05_Hamburguesa_especial_1024.png',
    orden: 0,
    categoria: 'Hamburguesas especiales',
  },
  {
    from: 'Crispy',
    nombre: 'Crispy',
    precio: 22000,
    descripcion:
      'Pan brioche, pollo crispy, cheddar, tocineta, vegetales, pepinillos y salsas.',
    image: '06_Hamburguesa_pollo_crispy_1024.png',
    orden: 1,
    categoria: 'Hamburguesas especiales',
  },
  {
    from: 'Chuleta',
    nombre: 'Chuleta',
    precio: 18000,
    descripcion:
      'Pan brioche, chuleta ahumada, vegetales, salsa y queso cheddar.',
    image: '09_Hamburguesa_BBQ_1024.png',
    orden: 2,
    categoria: 'Hamburguesas especiales',
  },
  {
    from: 'Criolla',
    nombre: 'Criolla',
    precio: 20000,
    descripcion:
      'Pan brioche, carne mechada, vegetales, maíz, huevo, aguacate y salsas.',
    image: '07_Hamburguesa_aguacate_1024.png',
    orden: 3,
    categoria: 'Hamburguesas especiales',
  },
  {
    from: 'Burger Wrap',
    nombre: 'Burger Wrap',
    precio: 15000,
    promo: true,
    descripcion:
      'Promo. Tortilla tostada, pollo crispy, queso cheddar, vegetales y salsas.',
    image: '10_Burguer_wrap_1024.png',
    orden: 4,
    categoria: 'Hamburguesas especiales',
  },
  {
    from: 'Hamburguesa Mixta',
    nombre: 'Mixta 2 carnes',
    precio: 26000,
    descripcion:
      'Pan brioche, dos carnes, vegetales, cheddar y salsas.',
    image: '02_Hamburguesa_doble_1024.png',
    orden: 5,
    categoria: 'Hamburguesas especiales',
  },
  {
    from: 'Perro Caliente',
    nombre: 'Perro normal',
    precio: 6000,
    descripcion:
      'Salchicha jumbo, pan artesanal, cebolla picada, papas hilo, queso rallado y salsa de la casa.',
    image: '15_Perro_caliente_1024.png',
    orden: 8,
    categoria: 'Hamburguesas especiales',
  },
  {
    from: 'Cheese Fries',
    nombre: 'Cheese Fries',
    precio: 20000,
    descripcion: 'Papas francesas, queso cheddar, tocineta y pollo crispy.',
    image: '12_Papas_fritas_1024.png',
    orden: 0,
    categoria: 'Acompañamientos',
  },
  {
    from: 'Crispy Onion Rings',
    nombre: 'Cebolla crispy',
    precio: 5000,
    descripcion: 'Porción de aros de cebolla crujientes con salsa BBQ de la casa.',
    image: '13_Aros_de_cebolla_1024.png',
    orden: 1,
    categoria: 'Acompañamientos',
  },
  {
    from: 'Alitas a la Broster',
    nombre: 'Alitas a la Broster',
    precio: 12000,
    promo: true,
    descripcion:
      'Promo. Alitas crujientes estilo broaster, papas francesas y salsa recién hecha.',
    image: '14_Alitas_1024.png',
    orden: 2,
    categoria: 'Acompañamientos',
  },
];

const INSERTS = [
  {
    nombre: 'Mixta 3 carnes',
    precio: 30000,
    descripcion: 'Pan brioche, tres carnes, vegetales, cheddar y salsas.',
    image: '05_Hamburguesa_especial_1024.png',
    orden: 6,
    categoria: 'Hamburguesas especiales',
  },
  {
    nombre: 'Mixta 4 carnes',
    precio: 35000,
    descripcion: 'Pan brioche, cuatro carnes, vegetales, cheddar y salsas.',
    image: '05_Hamburguesa_especial_1024.png',
    orden: 7,
    categoria: 'Hamburguesas especiales',
  },
  {
    nombre: 'Perro con proteína',
    precio: 10000,
    descripcion:
      'Salchicha jumbo con proteína, pan artesanal, cebolla picada, papas hilo, queso rallado y salsa de la casa.',
    image: '15_Perro_caliente_1024.png',
    orden: 9,
    categoria: 'Hamburguesas especiales',
  },
];

const uploaded = new Map();

async function uploadImage(fileName) {
  if (uploaded.has(fileName)) return uploaded.get(fileName);
  const bytes = await sharp(join(imageDir(), fileName))
    .rotate()
    .resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer();
  const objectPath = `${COMERCIO_ID}/${fileName.replace(/\.png$/i, '')}.webp`;
  const { error } = await supabase.storage.from(BUCKET).upload(objectPath, bytes, {
    contentType: 'image/webp',
    upsert: true,
  });
  if (error) throw error;
  const publicUrl = supabase.storage.from(BUCKET).getPublicUrl(objectPath).data.publicUrl;
  uploaded.set(fileName, publicUrl);
  return publicUrl;
}

function rowPayload(item, imagenUrl) {
  return {
    nombre: item.nombre,
    descripcion: item.descripcion,
    precio: item.precio,
    orden: item.orden,
    disponible: true,
    imagen_url: imagenUrl,
    imagen_source_type: 'manual',
    opciones_menu: opcionesMenu(item.nombre),
    upsell_badge: item.promo ? 'ahorra' : null,
    precio_comparacion: null,
  };
}

async function main() {
  const { data: categories, error: catErr } = await supabase
    .from('categorias')
    .select('id,nombre')
    .eq('comercio_id', COMERCIO_ID);
  if (catErr) throw catErr;
  const categoryId = new Map(categories.map((row) => [row.nombre, row.id]));

  const { data: products, error: prodErr } = await supabase
    .from('productos')
    .select('id,nombre')
    .eq('comercio_id', COMERCIO_ID);
  if (prodErr) throw prodErr;
  const byName = new Map(products.map((row) => [row.nombre, row]));

  if (process.argv.includes('--options-only')) {
    for (const nombre of Object.keys(QUITAR)) {
      const current = byName.get(nombre);
      if (!current) throw new Error(`Missing product ${nombre}`);
      const { error } = await supabase
        .from('productos')
        .update({ opciones_menu: opcionesMenu(nombre) })
        .eq('id', current.id);
      if (error) throw error;
      console.log(`removals ${nombre}: ${QUITAR[nombre].join(', ')}`);
    }
    return;
  }

  for (const item of UPDATES) {
    const current = byName.get(item.from) || byName.get(item.nombre);
    if (!current) throw new Error(`Missing product ${item.from}`);
    const imagenUrl = await uploadImage(item.image);
    const { error } = await supabase
      .from('productos')
      .update({
        ...rowPayload(item, imagenUrl),
        categoria_id: categoryId.get(item.categoria),
      })
      .eq('id', current.id);
    if (error) throw error;
    console.log(`updated ${item.from} -> ${item.nombre} ${item.precio}`);
  }

  for (const item of INSERTS) {
    if (byName.has(item.nombre)) {
      const imagenUrl = await uploadImage(item.image);
      const { error } = await supabase
        .from('productos')
        .update({
          ...rowPayload(item, imagenUrl),
          categoria_id: categoryId.get(item.categoria),
        })
        .eq('id', byName.get(item.nombre).id);
      if (error) throw error;
      console.log(`refreshed ${item.nombre}`);
      continue;
    }
    const imagenUrl = await uploadImage(item.image);
    const { error } = await supabase.from('productos').insert({
      comercio_id: COMERCIO_ID,
      categoria_id: categoryId.get(item.categoria),
      ...rowPayload(item, imagenUrl),
    });
    if (error) throw error;
    console.log(`inserted ${item.nombre} ${item.precio}`);
  }

  console.log('done', uploaded.size, 'images');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
