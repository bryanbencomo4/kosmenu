/**
 * Import / refresh Deli-Conos menu + embedded HD images for existing slug.
 *
 * Usage (from site/):
 *   node --env-file=.env.local scripts/import-deliconos-menu.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { createRequire } from 'node:module';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const XLSX = require('xlsx');

const SLUG = 'deliconos';
const XLSX_PATH = resolve(
  process.env.USERPROFILE || '',
  'Downloads/Menu_Deli_Productos_PCO_Imagenes_HD.xlsx',
);
const PRODUCT_BUCKET = 'product-images';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL.trim(),
  process.env.SUPABASE_SERVICE_ROLE_KEY.trim(),
  { auth: { persistSession: false } },
);

function parseMenu(filePath) {
  const wb = XLSX.readFile(filePath);
  const sheet = wb.Sheets['Importar menú'] || wb.Sheets[wb.SheetNames[1]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  const headerIdx = rows.findIndex(
    (row) => String(row[0] || '').trim().toUpperCase() === 'SKU',
  );
  const products = [];
  for (let i = headerIdx + 1; i < rows.length; i += 1) {
    const row = rows[i];
    const sku = String(row[0] || '').trim();
    const categoria = String(row[1] || '').trim();
    const nombre = String(row[2] || '').trim();
    if (!sku || !nombre) continue;
    const priceRaw = row[3];
    const precio =
      typeof priceRaw === 'number'
        ? priceRaw
        : Number(String(priceRaw).replace(/[^0-9.]/g, ''));
    products.push({
      sku,
      categoria,
      nombre,
      precio: Number.isFinite(precio) ? precio : 0,
      descripcion: String(row[4] || '').trim(),
      orden: Number(row[7]) || products.length + 1,
    });
  }
  return products;
}

function extractProductImages(xlsxPath) {
  const extractRoot = join(tmpdir(), `deliconos_import_${Date.now()}`);
  mkdirSync(extractRoot, { recursive: true });
  const zipPath = join(extractRoot, 'pack.zip');
  copyFileSync(xlsxPath, zipPath);
  execFileSync(
    'powershell',
    [
      '-NoProfile',
      '-Command',
      `Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${extractRoot.replace(/'/g, "''")}\\out' -Force`,
    ],
    { stdio: 'pipe' },
  );
  const outDir = join(extractRoot, 'out');
  const drawing = readFileSync(join(outDir, 'xl/drawings/drawing1.xml'), 'utf8');
  const rels = readFileSync(
    join(outDir, 'xl/drawings/_rels/drawing1.xml.rels'),
    'utf8',
  );
  const idToTarget = {};
  for (const m of rels.matchAll(/Target="([^"]+)"\s+Id="([^"]+)"/g)) {
    idToTarget[m[2]] = m[1].replace(/^\//, '');
  }
  const anchors = [
    ...drawing.matchAll(
      /<xdr:from>[\s\S]*?<xdr:row>(\d+)<\/xdr:row>[\s\S]*?<a:blip[^>]*r:embed="([^"]+)"/g,
    ),
  ];
  const byProductIndex = new Map();
  for (const a of anchors) {
    const productIndex = Number(a[1]) - 4;
    const relPath = idToTarget[a[2]];
    if (!relPath || productIndex < 0) continue;
    byProductIndex.set(productIndex, join(outDir, relPath));
  }
  return { extractRoot, byProductIndex };
}

const { data: comercio, error: cErr } = await supabase
  .from('comercios')
  .select('id,slug,nombre')
  .eq('slug', SLUG)
  .single();
if (cErr) throw cErr;

const { data: catalog } = await supabase
  .from('catalogos')
  .select('id')
  .eq('comercio_id', comercio.id)
  .order('orden', { ascending: true })
  .limit(1)
  .maybeSingle();
if (!catalog?.id) throw new Error('Catalog missing');

const products = parseMenu(XLSX_PATH);
const cats = [...new Set(products.map((p) => p.categoria))];

await supabase.from('productos').delete().eq('comercio_id', comercio.id);
await supabase.from('categorias').delete().eq('comercio_id', comercio.id);

const categoryIds = new Map();
let catOrden = 0;
for (const catName of cats) {
  const { data: cat, error } = await supabase
    .from('categorias')
    .insert({
      comercio_id: comercio.id,
      catalogo_id: catalog.id,
      nombre: catName,
      orden: catOrden++,
      activo: true,
    })
    .select('id,nombre')
    .single();
  if (error) throw error;
  categoryIds.set(catName, cat.id);
  console.log('Category', cat.nombre);
}

const extracted = extractProductImages(XLSX_PATH);
try {
  let productOrden = 0;
  for (let i = 0; i < products.length; i += 1) {
    const item = products[i];
    let imagenUrl = null;
    const localImage = extracted.byProductIndex.get(i);
    if (localImage && existsSync(localImage)) {
      const bytes = readFileSync(localImage);
      const objectPath = `${comercio.id}/deli_${item.sku.toLowerCase()}_${Date.now()}.jpg`;
      const { error: upErr } = await supabase.storage
        .from(PRODUCT_BUCKET)
        .upload(objectPath, bytes, { contentType: 'image/jpeg', upsert: false });
      if (upErr) console.warn('upload fail', item.sku, upErr.message);
      else {
        imagenUrl = supabase.storage
          .from(PRODUCT_BUCKET)
          .getPublicUrl(objectPath).data.publicUrl;
      }
    }
    const { error } = await supabase.from('productos').insert({
      comercio_id: comercio.id,
      categoria_id: categoryIds.get(item.categoria),
      nombre: item.nombre,
      descripcion: item.descripcion || null,
      precio: item.precio,
      orden: productOrden++,
      disponible: true,
      imagen_url: imagenUrl,
      imagen_source_type: imagenUrl ? 'manual' : null,
    });
    if (error) throw error;
    console.log(`OK ${item.sku} ${item.nombre} ${item.precio}${imagenUrl ? ' +img' : ''}`);
  }
} finally {
  rmSync(extracted.extractRoot, { recursive: true, force: true });
}

await supabase
  .from('comercios')
  .update({ en_linea: true, onboarding_completed: true })
  .eq('id', comercio.id);

console.log(`\nDone. https://elmenuxfa.com/v/${SLUG}`);
