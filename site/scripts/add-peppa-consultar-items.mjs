/**
 * Add Peppa menu items that were pending price confirmation.
 * Products without a confirmed price use precio 0 + descripcion "A consultar".
 *
 * Usage (from site/):
 *   node --env-file=.env.local scripts/add-peppa-consultar-items.mjs --dry-run
 *   node --env-file=.env.local scripts/add-peppa-consultar-items.mjs
 */

import { createClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';

const dryRun = process.argv.includes('--dry-run');
const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
if (!url || !key) {
  console.error('Need NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const SLUG = 'peppa';
const CONSULTAR = 'A consultar';

function oid(prefix) {
  return `${prefix}_${randomBytes(4).toString('hex')}`;
}

function consultarProduct(nombre) {
  return {
    nombre,
    precio: 0,
    descripcion: CONSULTAR,
    disponible: true,
  };
}

const AREPA_CONTORNOS = [
  'Viuda',
  'Queso blanco',
  'Dominó',
  'Queso guayanés',
  'Reina pepiada',
  'Ensalada de pollo',
  'Ropa vieja',
  'Huevo de codorniz',
  'Lengua guisada',
  'Salchicha',
  'Mejillones',
  'Llanera',
  'Pernil horneado',
  'Carne mechada',
  'Pollo mechado',
  'Cazón',
  'Queso amarillo',
  'Pollo crispy',
  'Asado negro',
  'Cochino asado',
  'Camarón',
  'Camarones rebosados',
  'Parrilla de mariscos',
  'Mariscos',
  'Asadura',
  'Muchacho redondo',
  'Perico',
];

function contornosGroup() {
  return {
    id: oid('g'),
    nombre: 'Contornos',
    tipo: 'multiple',
    obligatorio: true,
    min: 2,
    max: 2,
    opciones: AREPA_CONTORNOS.map((nombre) => ({
      id: oid('o'),
      nombre,
      precio: 0,
      activo: true,
    })),
  };
}

async function main() {
  const { data: comercio, error: comercioError } = await supabase
    .from('comercios')
    .select('id,slug,nombre')
    .eq('slug', SLUG)
    .maybeSingle();
  if (comercioError) throw comercioError;
  if (!comercio) {
    console.error('Peppa not found');
    process.exit(1);
  }

  const { data: categories, error: catError } = await supabase
    .from('categorias')
    .select('id,nombre,orden,catalogo_id')
    .eq('comercio_id', comercio.id)
    .order('orden');
  if (catError) throw catError;

  const catByName = new Map((categories ?? []).map((c) => [c.nombre, c]));
  const catalogId = categories?.[0]?.catalogo_id;
  if (!catalogId) {
    console.error('Peppa has no catalog');
    process.exit(1);
  }

  const { data: existingProducts, error: prodError } = await supabase
    .from('productos')
    .select('id,nombre,categoria_id,opciones_menu,orden')
    .eq('comercio_id', comercio.id);
  if (prodError) throw prodError;

  const existingNames = new Set(
    (existingProducts ?? []).map((p) => p.nombre.trim().toLowerCase()),
  );

  /** Ensure Adicionales category exists (after Arepas). */
  let adicionalesCat = catByName.get('Adicionales');
  if (!adicionalesCat) {
    const arepasOrden = catByName.get('Arepas')?.orden ?? 3;
    const nextOrden = arepasOrden + 1;
    console.log(`Create category Adicionales (orden ${nextOrden})`);
    if (!dryRun) {
      // Shift later categories to keep order tidy.
      for (const cat of categories ?? []) {
        if (cat.orden >= nextOrden) {
          const { error } = await supabase
            .from('categorias')
            .update({ orden: cat.orden + 1 })
            .eq('id', cat.id);
          if (error) throw error;
        }
      }
      const { data: created, error } = await supabase
        .from('categorias')
        .insert({
          comercio_id: comercio.id,
          catalogo_id: catalogId,
          nombre: 'Adicionales',
          orden: nextOrden,
          activo: true,
        })
        .select('id,nombre,orden,catalogo_id')
        .single();
      if (error) throw error;
      adicionalesCat = created;
      catByName.set('Adicionales', created);
    } else {
      adicionalesCat = { id: 'dry-run', nombre: 'Adicionales', orden: nextOrden };
    }
  }

  const toInsert = [];

  const pendingByCategory = {
    Arepas: [
      'Arepa viuda',
      'Arepa de queso blanco',
      'Arepa dominó',
      'Arepa de ensalada de pollo',
      'Arepa de mejillones',
      'Arepa de pollo crispy',
      'Arepa de asado negro',
      'Arepa de camarón',
      'Arepa de parrilla de mariscos',
    ],
    Café: ['Vanilla Latte', 'Caramel Latte', 'Mocaccino', 'Bombón'],
    Adicionales: [
      'Jamón',
      'Queso blanco',
      'Tajadas',
      'Aguacate',
      'Salchicha',
      'Huevo',
      'Carne',
      'Pollo',
      'Pernil',
      'Cazón',
      'Lengua',
      'Carne asada',
      'Queso amarillo',
    ],
  };

  for (const [catName, names] of Object.entries(pendingByCategory)) {
    const cat = catByName.get(catName);
    if (!cat && !dryRun) {
      console.error(`Missing category ${catName}`);
      process.exit(1);
    }
    const existingInCat = (existingProducts ?? []).filter(
      (p) => p.categoria_id === cat?.id,
    );
    let orden =
      existingInCat.reduce((max, p) => Math.max(max, p.orden ?? 0), -1) + 1;

    for (const nombre of names) {
      if (existingNames.has(nombre.trim().toLowerCase())) {
        console.log(`skip exists: ${nombre}`);
        continue;
      }
      toInsert.push({
        comercio_id: comercio.id,
        categoria_id: cat?.id ?? null,
        ...consultarProduct(nombre),
        orden: orden++,
        _catName: catName,
      });
    }
  }

  console.log(`Will insert ${toInsert.length} products:`);
  for (const row of toInsert) {
    console.log(`  + [${row._catName}] ${row.nombre} · ${CONSULTAR}`);
  }

  // Refresh contornos on multi-fill arepas.
  const multiNames = new Set([
    'Arepa de 2 contornos',
    'Arepa de 3 contornos',
    'Arepa mediana (2 contornos)',
  ]);
  const multiProducts = (existingProducts ?? []).filter((p) =>
    multiNames.has(p.nombre),
  );

  if (dryRun) {
    console.log(
      `Dry run OK. Would refresh contornos on ${multiProducts.length} arepas (${AREPA_CONTORNOS.length} options).`,
    );
    return;
  }

  if (toInsert.length) {
    const rows = toInsert.map(({ _catName, ...rest }) => rest);
    const { error } = await supabase.from('productos').insert(rows);
    if (error) throw error;
  }

  for (const product of multiProducts) {
    const minMax =
      product.nombre === 'Arepa de 3 contornos'
        ? { min: 3, max: 3 }
        : { min: 2, max: 2 };
    const group = { ...contornosGroup(), ...minMax };
    const nextMenu = {
      ...(product.opciones_menu && typeof product.opciones_menu === 'object'
        ? product.opciones_menu
        : {}),
      activadas: true,
      grupos: [group],
    };
    const { error } = await supabase
      .from('productos')
      .update({ opciones_menu: nextMenu })
      .eq('id', product.id)
      .eq('comercio_id', comercio.id);
    if (error) throw error;
    console.log(
      `updated contornos: ${product.nombre} → ${AREPA_CONTORNOS.length} options`,
    );
  }

  console.log(`Done. Inserted ${toInsert.length} "A consultar" products.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
