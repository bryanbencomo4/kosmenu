#!/usr/bin/env node

/**
 * Repairs legacy AI menus that split "Servicio adicional" into duplicate categories/products.
 *
 * Usage:
 *   node site/scripts/repair-menu-options.mjs pizzas-el-trueno
 */

import { createClient } from '@supabase/supabase-js';

const slug = (process.argv[2] ?? '').trim();
if (!slug) {
  console.error('Usage: node site/scripts/repair-menu-options.mjs <comercio-slug>');
  process.exit(1);
}

const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});

const SERVICIO_PATTERN = /servicio\s*adicional/i;

function normalizeSizeCode(value) {
  const normalized = value.trim().toLowerCase();
  if (normalized === 'normal' || normalized === 'mediano' || normalized === 'm') return 'n';
  if (normalized === 'grande' || normalized === 'g') return 'g';
  return normalized.replace(/[^a-z0-9_-]/g, '').slice(0, 12) || 'n';
}

function parsePricesFromText(text) {
  const prices = {};
  const matches = text.matchAll(/([ng]|normal|mediano|grande)\s*[-:]?\s*\$?\s*([0-9]+(?:[.,][0-9]+)?)/gi);
  for (const match of matches) {
    prices[normalizeSizeCode(match[1])] = Number(match[2].replace(',', '.'));
  }
  return prices;
}

async function main() {
  const { data: comercio, error: comercioError } = await supabase
    .from('comercios')
    .select('id,slug,nombre')
    .eq('slug', slug)
    .maybeSingle();

  if (comercioError || !comercio?.id) {
    throw new Error(comercioError?.message ?? `Comercio not found for slug ${slug}`);
  }

  const { data: categorias, error: categoriasError } = await supabase
    .from('categorias')
    .select('id,nombre,opciones_menu')
    .eq('comercio_id', comercio.id);

  if (categoriasError) {
    throw new Error(categoriasError.message);
  }

  const { data: productos, error: productosError } = await supabase
    .from('productos')
    .select('id,categoria_id,nombre,descripcion,precio,opciones_menu')
    .eq('comercio_id', comercio.id);

  if (productosError) {
    throw new Error(productosError.message);
  }

  let deletedProducts = 0;
  let deletedCategories = 0;
  let updatedCategories = 0;

  const servicioCategories = (categorias ?? []).filter((categoria) =>
    SERVICIO_PATTERN.test(categoria.nombre ?? ''),
  );

  for (const categoria of servicioCategories) {
    const servicioProducts = (productos ?? []).filter(
      (producto) => producto.categoria_id === categoria.id,
    );
    const precios = {};

    for (const producto of servicioProducts) {
      Object.assign(precios, parsePricesFromText(`${producto.nombre} ${producto.descripcion ?? ''}`));
      if (Object.keys(precios).length === 0 && Number(producto.precio) > 0) {
        precios.n = Number(producto.precio);
      }
    }

    const parentCategory = (categorias ?? [])
      .filter((entry) => !SERVICIO_PATTERN.test(entry.nombre ?? ''))
      .sort((left, right) => left.nombre.localeCompare(right.nombre))[0];

    if (parentCategory && Object.keys(precios).length > 0) {
      await supabase
        .from('categorias')
        .update({
          opciones_menu: {
            servicio_adicional: {
              label: 'Servicio adicional',
              precios_por_tamano: precios,
            },
          },
        })
        .eq('id', parentCategory.id);
      updatedCategories += 1;
    }

    for (const producto of servicioProducts) {
      await supabase.from('productos').delete().eq('id', producto.id);
      deletedProducts += 1;
    }

    await supabase.from('categorias').delete().eq('id', categoria.id);
    deletedCategories += 1;
  }

  const orphanServicioProducts = (productos ?? []).filter((producto) =>
    SERVICIO_PATTERN.test(producto.nombre ?? ''),
  );

  for (const producto of orphanServicioProducts) {
    await supabase.from('productos').delete().eq('id', producto.id);
    deletedProducts += 1;
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        comercio: comercio.slug,
        deletedCategories,
        deletedProducts,
        updatedCategories,
        note:
          'Size options (N/G) still require re-importing the menu with the updated AI parser or manual editing.',
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
