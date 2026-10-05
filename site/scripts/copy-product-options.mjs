#!/usr/bin/env node

/**
 * Copies the option groups (opciones_menu.grupos + activadas) of one product to every other
 * product of the same category. Everything else in opciones_menu (personalizacion, legacy keys)
 * and the rest of the row stay untouched. Dry run unless --apply; --apply writes a JSON backup
 * of every touched row first.
 *
 * Usage:
 *   node site/scripts/copy-product-options.mjs <comercio-slug> "<categoria>" "<producto origen>" [--apply]
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const apply = args.includes('--apply');
const keepPrices = args.includes('--keep-prices');
const withPersonalization = args.includes('--with-personalization');
const [slug, categoryName, sourceName] = args.filter((arg) => !arg.startsWith('--'));
if (!slug || !categoryName || !sourceName) {
  console.error('Usage: node site/scripts/copy-product-options.mjs <slug> "<categoria>" "<producto>" [--apply]');
  process.exit(1);
}

function loadEnv(file) {
  try {
    for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^"(.*)"$/, '$1');
    }
  } catch {}
}
loadEnv(join(here, '..', '.env.local'));

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}
const supabase = createClient(url, key, { auth: { persistSession: false } });

const norm = (value) => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();

function describeGroups(menu) {
  const groups = Array.isArray(menu?.grupos) ? menu.grupos : [];
  return groups.map((group) => {
    const flags = [group.pregunta_activada && 'pregunta', group.pregunta_directa && 'directo'].filter(Boolean);
    const options = (group.opciones ?? []).map((option) => {
      const rules = Array.isArray(option.reglas_precio) && option.reglas_precio.length
        ? ` ⟨${option.reglas_precio.map((rule) => rule.precio).join('/')}⟩`
        : '';
      return `${option.predeterminada ? '*' : ''}${option.nombre} ${option.precio ?? 0}${rules}`;
    }).join(' | ');
    return `${group.nombre}${flags.length ? `{${flags.join(',')}}` : ''} [${options}]`;
  }).join('  ') || '—';
}

/**
 * Source groups for one target. With --keep-prices every option keeps the target's own price for
 * the option with the same name: fixed prices, and for size-dependent options the price of each
 * rule, matched through the name of the option the rule depends on ("Normal", "Grande").
 * Returns the options it could not match (they keep the source price).
 */
function groupsFor(sourceGroups, targetMenu) {
  const groups = structuredClone(sourceGroups);
  const missing = [];
  if (!keepPrices) return { groups, missing };
  const targetGroups = Array.isArray(targetMenu?.grupos) ? targetMenu.grupos : [];
  const sourceOptionName = new Map(groups.flatMap((group) => (group.opciones ?? []).map((option) => [option.id, option.nombre])));
  const targetOptionName = new Map(targetGroups.flatMap((group) => (group.opciones ?? []).map((option) => [option.id, option.nombre])));
  const targetOptions = targetGroups.flatMap((group) => (group.opciones ?? []).map((option) => ({ ...option, groupType: group.tipo })));
  for (const group of groups) {
    for (const option of group.opciones ?? []) {
      const sameName = targetOptions.filter((candidate) => norm(candidate.nombre) === norm(option.nombre));
      const rules = Array.isArray(option.reglas_precio) ? option.reglas_precio : [];
      if (!rules.length) {
        const match = sameName.find((candidate) => candidate.groupType === group.tipo) ?? sameName[0];
        if (match && typeof match.precio === 'number') option.precio = match.precio;
        else missing.push(`${group.nombre}/${option.nombre}`);
        continue;
      }
      const match = sameName.find((candidate) => Array.isArray(candidate.reglas_precio) && candidate.reglas_precio.length);
      for (const rule of rules) {
        const dependsOn = norm(sourceOptionName.get(rule.cuando?.opcion));
        const targetRule = match?.reglas_precio.find((candidate) => norm(targetOptionName.get(candidate.cuando?.opcion)) === dependsOn);
        if (targetRule && typeof targetRule.precio === 'number') rule.precio = targetRule.precio;
        else missing.push(`${group.nombre}/${option.nombre} según ${sourceOptionName.get(rule.cuando?.opcion)}`);
      }
      if (match && typeof match.precio === 'number') option.precio = match.precio;
      if (match && typeof match.precio_base === 'number') option.precio_base = match.precio_base;
    }
  }
  return { groups, missing };
}

/** Same rules as `ingredientsFromDescription` in lib/widgets/product_options_editor.dart. */
function ingredientsFromDescription(description) {
  const seen = new Set();
  const result = [];
  for (const piece of String(description ?? '').split(',')) {
    let name = piece.replace(/\s+/g, ' ').replace(/^[\s.;:·•-]+|[\s.;:·•-]+$/g, '');
    if (!name) continue;
    if (name.length > 80) name = name.slice(0, 80).trimEnd();
    name = name[0].toUpperCase() + name.slice(1);
    const key = norm(name).replace(/\s+/g, ' ');
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(name);
  }
  return result.slice(0, 50);
}

function randomId(prefix) {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  return `${prefix}_${Array.from({ length: 8 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('')}`;
}

/**
 * Source personalizacion adapted to one target: combinations point to the same products (plus the
 * source, minus the target itself) and removable ingredients come from the target's description
 * when the source takes them from its own description.
 */
function personalizationFor(source, target) {
  const base = structuredClone(source.opciones_menu?.personalizacion ?? {});
  if (base.combinacion) {
    const ids = new Set([...(base.combinacion.productos_compatibles ?? []), source.id]);
    ids.delete(target.id);
    base.combinacion.productos_compatibles = [...ids];
  }
  if (base.exclusiones?.desde_descripcion) {
    const previous = target.opciones_menu?.personalizacion?.exclusiones?.ingredientes ?? [];
    const idsByName = new Map(previous.map((entry) => [norm(entry.nombre), entry.id]));
    let names = ingredientsFromDescription(target.descripcion);
    // "Solo Queso" describes the pizza, it is not an ingredient called "Solo Queso".
    if (names.length === 1 && /^s[oó]lo\s+/i.test(names[0])) {
      const rest = names[0].replace(/^s[oó]lo\s+/i, '');
      names = [rest[0].toUpperCase() + rest.slice(1)];
      delete base.exclusiones.desde_descripcion;
    }
    // "Tocineta y Maiz" is two ingredients; the panel only splits on commas, so keep it manual.
    if (names.some((name) => /\sy\s/i.test(name))) {
      names = [...new Set(names.flatMap((name) => name.split(/\s+y\s+/i))
        .map((name) => name.trim()).filter(Boolean)
        .map((name) => name[0].toUpperCase() + name.slice(1)))];
      delete base.exclusiones.desde_descripcion;
    }
    base.exclusiones.ingredientes = names.map((nombre) => ({
      id: idsByName.get(norm(nombre)) ?? randomId('r'),
      nombre,
    }));
    if (!base.exclusiones.ingredientes.length) base.exclusiones.activadas = false;
  }
  return base;
}

async function main() {
  const { data: comercio, error: comercioError } = await supabase
    .from('comercios').select('id,slug,nombre').eq('slug', slug).maybeSingle();
  if (comercioError || !comercio) throw new Error(comercioError?.message ?? `Comercio ${slug} no existe`);

  const { data: categories, error: categoriesError } = await supabase
    .from('categorias').select('id,nombre,catalogo_id').eq('comercio_id', comercio.id);
  if (categoriesError) throw new Error(categoriesError.message);
  const matches = categories.filter((category) => norm(category.nombre) === norm(categoryName));
  if (matches.length !== 1) {
    throw new Error(`Se esperaba 1 categoría "${categoryName}", hay ${matches.length}: ${categories.map((c) => c.nombre).join(', ')}`);
  }
  const category = matches[0];

  const { data: products, error: productsError } = await supabase
    .from('productos').select('id,nombre,precio,descripcion,opciones_menu').eq('comercio_id', comercio.id).eq('categoria_id', category.id).order('nombre');
  if (productsError) throw new Error(productsError.message);

  // The source may live in another category of the same comercio.
  const { data: allProducts, error: allError } = await supabase
    .from('productos').select('id,nombre,precio,descripcion,opciones_menu').eq('comercio_id', comercio.id);
  if (allError) throw new Error(allError.message);
  const sources = allProducts.filter((product) => norm(product.nombre) === norm(sourceName));
  if (sources.length !== 1) {
    throw new Error(`Se esperaba 1 producto "${sourceName}" en ${comercio.nombre}, hay ${sources.length}`);
  }
  const source = sources[0];
  const sourceMenu = source.opciones_menu ?? {};
  if (!Array.isArray(sourceMenu.grupos) || sourceMenu.grupos.length === 0) {
    throw new Error(`"${source.nombre}" no tiene grupos de opciones`);
  }

  console.log(`Comercio: ${comercio.nombre} (${comercio.slug})`);
  console.log(`Categoría: ${category.nombre} — ${products.length} productos`);
  console.log(`Origen: ${source.nombre}  precio=${source.precio}  activadas=${sourceMenu.activadas === true}`);
  console.log(`  ${describeGroups(sourceMenu)}`);
  for (const group of sourceMenu.grupos) {
    console.log(`  • ${group.nombre} [${group.tipo ?? '?'} min ${group.min ?? 0} max ${group.max ?? 1}]`);
    for (const option of group.opciones ?? []) {
      const rules = Array.isArray(option.reglas_precio) && option.reglas_precio.length ? ' (precio según grupo)' : '';
      console.log(`      - ${option.nombre}  ${option.precio ?? 0}${rules}${option.activo === false ? ' (inactiva)' : ''}`);
    }
  }
  console.log(`\nDestinos${keepPrices ? ' (manteniendo sus precios de opciones obligatorias)' : ''}:`);
  const targets = products.filter((product) => product.id !== source.id);
  const plans = new Map();
  for (const product of targets) {
    const plan = groupsFor(sourceMenu.grupos, product.opciones_menu);
    if (withPersonalization) plan.personalization = personalizationFor(source, product);
    plans.set(product.id, plan);
    console.log(`  - ${product.nombre} (precio ${product.precio})`);
    console.log(`      antes:   ${describeGroups(product.opciones_menu)}`);
    console.log(`      despues: ${describeGroups({ grupos: plan.groups })}`);
    if (plan.missing.length) console.log(`      ⚠ sin precio propio, se usa el del origen: ${plan.missing.join(', ')}`);
    if (plan.personalization) {
      const { combinacion, exclusiones } = plan.personalization;
      if (combinacion) console.log(`      combinar: ${combinacion.activada ? 'sí' : 'no'} · ${combinacion.productos_compatibles.length} compatibles`);
      if (exclusiones) {
        console.log(`      quitar:   ${exclusiones.activadas ? 'sí' : 'NO (descripción sin ingredientes)'} · desc "${product.descripcion ?? ''}" → [${exclusiones.ingredientes.map((entry) => entry.nombre).join(' | ')}]`);
      }
    }
  }

  if (!apply) {
    console.log('\nDry run. Añade --apply para escribir.');
    return;
  }

  const backupDir = join(here, '..', '..', 'backups');
  mkdirSync(backupDir, { recursive: true });
  const backupFile = join(backupDir, `opciones-${slug}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  writeFileSync(backupFile, JSON.stringify(targets.map(({ id, nombre, opciones_menu }) => ({ id, nombre, opciones_menu })), null, 2));
  console.log(`\nBackup: ${backupFile}`);

  let updated = 0;
  for (const product of targets) {
    const next = {
      ...(product.opciones_menu ?? {}),
      activadas: sourceMenu.activadas === true,
      grupos: plans.get(product.id).groups,
      ...(plans.get(product.id).personalization ? { personalizacion: plans.get(product.id).personalization } : {}),
    };
    const { error } = await supabase.from('productos').update({ opciones_menu: next }).eq('id', product.id).eq('comercio_id', comercio.id);
    if (error) throw new Error(`${product.nombre}: ${error.message} (actualizados ${updated}; restaura desde el backup)`);
    updated += 1;
    console.log(`  ✓ ${product.nombre}`);
  }
  console.log(`\nActualizados ${updated} productos.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
