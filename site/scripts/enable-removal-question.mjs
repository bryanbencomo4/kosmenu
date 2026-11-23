#!/usr/bin/env node

/**
 * Enables "quitar ingredientes" gated by a question for every product in the
 * given categories. Uses a template product in each category that already has
 * exclusiones configured (falls back to parsing descriptions). Dry run unless --apply.
 *
 * Usage:
 *   node site/scripts/enable-removal-question.mjs <slug> "Cat1" "Cat2" [--apply]
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const apply = args.includes('--apply');
const positional = args.filter((arg) => !arg.startsWith('--'));
const [slug, ...categoryNames] = positional;

if (!slug || categoryNames.length === 0) {
  console.error(
    'Usage: node site/scripts/enable-removal-question.mjs <slug> "Cat1" ["Cat2"...] [--apply]',
  );
  process.exit(1);
}

function loadEnv(file) {
  try {
    for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (match && !process.env[match[1]]) {
        process.env[match[1]] = match[2].replace(/^"(.*)"$/, '$1');
      }
    }
  } catch {}
}
loadEnv(join(here, '..', '.env.local'));
loadEnv(join(here, '..', '..', '.env.local'));

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}
const supabase = createClient(url, key, { auth: { persistSession: false } });

const norm = (value) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();

function randomId(prefix) {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  return `${prefix}_${Array.from(
    { length: 8 },
    () => alphabet[Math.floor(Math.random() * alphabet.length)],
  ).join('')}`;
}

function ingredientsFromDescription(description) {
  const seen = new Set();
  const result = [];
  for (const piece of String(description ?? '').split(',')) {
    let name = piece.replace(/\s+/g, ' ').replace(/^[\s.;:·•-]+|[\s.;:·•-]+$/g, '');
    if (!name) continue;
    if (name.length > 80) name = name.slice(0, 80).trimEnd();
    name = name[0].toUpperCase() + name.slice(1);
    // Split trailing "A Y B" only when there are no parentheses (keep "Ensalada (X y Y)").
    if (/\sy\s/i.test(name) && !/[()]/.test(name)) {
      for (const part of name.split(/\s+y\s+/i)) {
        const trimmed = part.trim();
        if (!trimmed) continue;
        const labeled = trimmed[0].toUpperCase() + trimmed.slice(1);
        const key = norm(labeled).replace(/\s+/g, ' ');
        if (seen.has(key)) continue;
        seen.add(key);
        result.push(labeled);
      }
      continue;
    }
    const key = norm(name).replace(/\s+/g, ' ');
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(name);
  }
  return result.slice(0, 50);
}

function pickTemplate(products) {
  return (
    products.find(
      (p) =>
        p.opciones_menu?.personalizacion?.exclusiones?.activadas === true &&
        Array.isArray(p.opciones_menu?.personalizacion?.exclusiones?.ingredientes) &&
        p.opciones_menu.personalizacion.exclusiones.ingredientes.length > 0,
    ) ?? null
  );
}

function buildExclusiones(product, templateExclusiones) {
  const previous =
    product.opciones_menu?.personalizacion?.exclusiones?.ingredientes ?? [];
  const idsByName = new Map(previous.map((entry) => [norm(entry.nombre), entry.id]));

  let names;
  if (templateExclusiones?.ingredientes?.length) {
    names = templateExclusiones.ingredientes.map((entry) => entry.nombre);
  } else {
    names = ingredientsFromDescription(product.descripcion);
  }

  const ingredientes = names.map((nombre) => ({
    id: idsByName.get(norm(nombre)) ?? randomId('r'),
    nombre,
  }));

  return {
    activadas: ingredientes.length > 0,
    titulo: templateExclusiones?.titulo || '¿Quieres quitar algo?',
    ingredientes,
    pregunta_activada: ingredientes.length > 0,
    pregunta: templateExclusiones?.pregunta || '¿Quieres quitar algún ingrediente?',
    desde_descripcion: true,
  };
}

const { data: comercio, error: comercioError } = await supabase
  .from('comercios')
  .select('id,slug,nombre')
  .eq('slug', slug)
  .maybeSingle();
if (comercioError || !comercio) {
  throw new Error(comercioError?.message ?? `Comercio ${slug} no existe`);
}

const { data: categories, error: categoriesError } = await supabase
  .from('categorias')
  .select('id,nombre')
  .eq('comercio_id', comercio.id);
if (categoriesError) throw new Error(categoriesError.message);

const selected = [];
for (const name of categoryNames) {
  const matches = (categories ?? []).filter((c) => norm(c.nombre) === norm(name));
  if (matches.length !== 1) {
    throw new Error(
      `Se esperaba 1 categoría "${name}", hay ${matches.length}: ${(categories ?? []).map((c) => c.nombre).join(', ')}`,
    );
  }
  selected.push(matches[0]);
}

console.log(`Comercio: ${comercio.nombre} (${comercio.slug})`);
const plans = [];

for (const category of selected) {
  const { data: products, error: productsError } = await supabase
    .from('productos')
    .select('id,nombre,descripcion,opciones_menu')
    .eq('comercio_id', comercio.id)
    .eq('categoria_id', category.id)
    .order('nombre');
  if (productsError) throw new Error(productsError.message);

  const template = pickTemplate(products);
  const templateEx = template?.opciones_menu?.personalizacion?.exclusiones ?? null;
  console.log(
    `\n=== ${category.nombre} (${products.length}) · plantilla: ${template?.nombre ?? 'descripción'} ===`,
  );

  for (const product of products) {
    const exclusiones = buildExclusiones(product, templateEx);
    const nextMenu = {
      ...(product.opciones_menu ?? {}),
      personalizacion: {
        ...(product.opciones_menu?.personalizacion ?? {}),
        version: product.opciones_menu?.personalizacion?.version ?? 1,
        exclusiones,
      },
    };
    plans.push({ product, nextMenu, exclusiones });
    console.log(
      `  - ${product.nombre}: ${exclusiones.activadas ? 'ON+pregunta' : 'OFF'} · [${exclusiones.ingredientes.map((i) => i.nombre).join(' | ')}]`,
    );
  }
}

if (!apply) {
  console.log('\nDry run. Añade --apply para escribir.');
  process.exit(0);
}

const backupDir = join(here, '..', '..', 'backups');
mkdirSync(backupDir, { recursive: true });
const backupFile = join(
  backupDir,
  `exclusiones-${slug}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
);
writeFileSync(
  backupFile,
  JSON.stringify(
    plans.map(({ product }) => ({
      id: product.id,
      nombre: product.nombre,
      opciones_menu: product.opciones_menu,
    })),
    null,
    2,
  ),
);
console.log(`\nBackup: ${backupFile}`);

let updated = 0;
for (const { product, nextMenu } of plans) {
  const { error } = await supabase
    .from('productos')
    .update({ opciones_menu: nextMenu })
    .eq('id', product.id)
    .eq('comercio_id', comercio.id);
  if (error) {
    throw new Error(`${product.nombre}: ${error.message} (actualizados ${updated})`);
  }
  updated += 1;
  console.log(`  ✓ ${product.nombre}`);
}
console.log(`\nActualizados ${updated} productos.`);
