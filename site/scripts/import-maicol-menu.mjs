/**
 * Import Arroz Chino Maicol menu from Menu_Maicol_Fotos_Google_Precios_USD.xlsx
 * (sheet IMPORTAR A MENU): categories, USD prices, descriptions, and images.
 *
 * Usage (from site/):
 *   node --env-file=.env.local scripts/import-maicol-menu.mjs --dry-run
 *   node --env-file=.env.local scripts/import-maicol-menu.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { createRequire } from 'module';
import { copyFileSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const XLSX = require('xlsx');

const dryRun = process.argv.includes('--dry-run');
const SLUG = 'arroz-chino-maicol';
const BUCKET = 'product-images';
const XLSX_PATH =
  process.argv.find((a, i, arr) => arr[i - 1] === '--xlsx') ||
  'C:/Users/bryan/Downloads/Menu_Maicol_Fotos_Google_Precios_USD.xlsx';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL.trim(),
  process.env.SUPABASE_SERVICE_ROLE_KEY.trim(),
  { auth: { persistSession: false } },
);

function extFromUrlOrType(url, contentType) {
  const ct = String(contentType || '').toLowerCase();
  if (ct.includes('png')) return 'png';
  if (ct.includes('webp')) return 'webp';
  if (ct.includes('gif')) return 'gif';
  if (ct.includes('jpeg') || ct.includes('jpg')) return 'jpg';
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    const m = pathname.match(/\.(jpe?g|png|webp|gif)$/);
    if (m) return m[1] === 'jpeg' ? 'jpg' : m[1];
  } catch {
    /* ignore */
  }
  return 'jpg';
}

function contentTypeForExt(ext) {
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'gif') return 'image/gif';
  return 'image/jpeg';
}

function buildDescription(desc, presentacion) {
  const d = String(desc || '').trim();
  const p = String(presentacion || '').trim();
  if (!p || /no especificado/i.test(p)) return d;
  if (!d) return `Presentación: ${p}.`;
  if (d.toLowerCase().includes(p.toLowerCase())) return d;
  return `${d} Presentación: ${p}.`;
}

function parseMenu(filePath) {
  const wb = XLSX.readFile(filePath);
  const sheet = wb.Sheets['IMPORTAR A MENU'];
  if (!sheet) throw new Error('Missing sheet IMPORTAR A MENU');
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
  const published = [];
  const pending = [];
  for (const row of rows) {
    const categoria = String(row.CATEGORÍA || row.CATEGORIA || '').trim();
    const producto = String(row.PRODUCTO || '').trim();
    if (!categoria || !producto) continue;
    const priceRaw = row.PRECIO_USD;
    const precio =
      typeof priceRaw === 'number'
        ? priceRaw
        : Number(String(priceRaw).replace(',', '.'));
    const item = {
      categoria,
      producto,
      descripcion: buildDescription(row.DESCRIPCIÓN || row.DESCRIPCION, row.PRESENTACIÓN || row.PRESENTACION),
      presentacion: String(row.PRESENTACIÓN || row.PRESENTACION || '').trim(),
      precio: Number.isFinite(precio) && precio > 0 ? Math.round(precio * 100) / 100 : null,
      imagenUrl: String(row.IMAGEN_URL || '').trim(),
      estado: String(row.ESTADO_PRECIO || '').trim(),
    };
    if (item.precio != null && /publicado/i.test(item.estado || 'publicado')) {
      published.push(item);
    } else {
      pending.push(item);
    }
  }
  return { published, pending };
}

async function downloadImage(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
      Referer: 'https://www.google.com/',
    },
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const contentType = res.headers.get('content-type') || '';
  const bytes = Buffer.from(await res.arrayBuffer());
  if (bytes.length < 500) throw new Error(`too small (${bytes.length} B)`);
  return { bytes, contentType, ext: extFromUrlOrType(url, contentType) };
}

/** Map embedded Maicol photos (drawing2 / FOTOS REALES) by filename order. */
function extractEmbeddedMaicolPhotos(xlsxPath) {
  const dir = mkdtempSync(join(tmpdir(), 'maicol-xlsx-'));
  const zipPath = join(dir, 'book.zip');
  copyFileSync(xlsxPath, zipPath);
  execFileSync('tar', ['-xf', zipPath, '-C', dir], { stdio: 'ignore' });
  const media = [];
  // Prefer later media files typically used by the second drawing (real photos).
  for (let i = 8; i <= 13; i += 1) {
    const file = join(dir, 'xl', 'media', `image${i}.jpg`);
    try {
      const bytes = readFileSync(file);
      if (bytes.length > 500) media.push(bytes);
    } catch {
      /* missing */
    }
  }
  return { dir, media };
}

async function main() {
  const { published, pending } = parseMenu(XLSX_PATH);
  const cats = [...new Set(published.map((p) => p.categoria))];
  console.log(`Published: ${published.length} | Pending (skip sell): ${pending.length}`);
  console.log('Categories:', cats.map((c) => `${c} (${published.filter((p) => p.categoria === c).length})`).join(', '));

  const { data: comercio, error: cErr } = await supabase
    .from('comercios')
    .select('id,nombre,owner_id')
    .eq('slug', SLUG)
    .single();
  if (cErr) throw cErr;

  let { data: catalog } = await supabase
    .from('catalogos')
    .select('id')
    .eq('comercio_id', comercio.id)
    .order('orden', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!catalog) {
    if (dryRun) {
      console.log('Dry run: would create catalog');
    } else {
      const { data: created, error } = await supabase
        .from('catalogos')
        .insert({
          comercio_id: comercio.id,
          nombre: 'Menú principal',
          activo: true,
          orden: 0,
        })
        .select('id')
        .single();
      if (error) throw error;
      catalog = created;
    }
  }

  if (dryRun) {
    console.log(`Dry run OK for ${comercio.nombre}. Would replace menu and upload images.`);
    return;
  }

  // Replace existing menu (fresh commerce).
  await supabase.from('productos').delete().eq('comercio_id', comercio.id);
  await supabase.from('categorias').delete().eq('comercio_id', comercio.id);

  const categoryIds = new Map();
  let ordenCat = 0;
  for (const nombre of cats) {
    const { data: category, error } = await supabase
      .from('categorias')
      .insert({
        comercio_id: comercio.id,
        catalogo_id: catalog.id,
        nombre,
        orden: ordenCat++,
        activo: true,
      })
      .select('id')
      .single();
    if (error) throw error;
    categoryIds.set(nombre, category.id);
  }

  const inserted = [];
  let ordenProd = 0;
  const byCatOrden = new Map();
  for (const item of published) {
    const ord = byCatOrden.get(item.categoria) ?? 0;
    byCatOrden.set(item.categoria, ord + 1);
    const row = {
      comercio_id: comercio.id,
      categoria_id: categoryIds.get(item.categoria),
      nombre: item.producto,
      descripcion: item.descripcion,
      precio: item.precio,
      disponible: true,
      orden: ord,
      imagen_source_type: 'manual',
    };
    const { data: product, error } = await supabase
      .from('productos')
      .insert(row)
      .select('id,nombre')
      .single();
    if (error) throw error;
    inserted.push({ ...item, id: product.id });
    ordenProd += 1;
  }
  console.log(`Inserted ${inserted.length} products`);

  // Optional: add Maicol photo plates as unavailable showcase items with embedded images.
  let embedCleanup = null;
  if (pending.length > 0) {
    const { dir, media } = extractEmbeddedMaicolPhotos(XLSX_PATH);
    embedCleanup = dir;
    let showcaseCatId = categoryIds.get('Platos mostrados en fotos');
    if (!showcaseCatId && pending.some((p) => p.categoria === 'Platos mostrados en fotos')) {
      const { data: category, error } = await supabase
        .from('categorias')
        .insert({
          comercio_id: comercio.id,
          catalogo_id: catalog.id,
          nombre: 'Platos mostrados en fotos',
          orden: ordenCat++,
          activo: true,
        })
        .select('id')
        .single();
      if (error) throw error;
      showcaseCatId = category.id;
      categoryIds.set('Platos mostrados en fotos', showcaseCatId);
    }
    for (let i = 0; i < pending.length; i += 1) {
      const item = pending[i];
      const bytes = media[i] || null;
      let imagenUrl = null;
      if (bytes) {
        const objectPath = `${comercio.id}/maicol_real_${Date.now()}_${i}.jpg`;
        const { error: upErr } = await supabase.storage
          .from(BUCKET)
          .upload(objectPath, bytes, { contentType: 'image/jpeg', upsert: false });
        if (!upErr) {
          imagenUrl = supabase.storage.from(BUCKET).getPublicUrl(objectPath).data.publicUrl;
        } else {
          console.warn('Embedded upload failed:', upErr.message);
        }
      }
      const { error } = await supabase.from('productos').insert({
        comercio_id: comercio.id,
        categoria_id: categoryIds.get(item.categoria) || showcaseCatId,
        nombre: item.producto,
        descripcion: `${item.descripcion} Precio por confirmar.`.trim(),
        precio: 0,
        disponible: false,
        orden: i,
        imagen_url: imagenUrl,
        imagen_source_type: 'manual',
      });
      if (error) console.warn('Pending product insert failed:', error.message);
    }
    console.log(`Added ${pending.length} showcase dishes (unavailable, price TBD)`);
  }

  // Download + upload remote images (dedupe by URL).
  const urlCache = new Map();
  let ok = 0;
  const failed = [];
  for (const item of inserted) {
    if (!item.imagenUrl) continue;
    process.stdout.write(`Image ${item.producto.slice(0, 40)}... `);
    try {
      let cached = urlCache.get(item.imagenUrl);
      if (!cached) {
        const dl = await downloadImage(item.imagenUrl);
        const objectPath = `${comercio.id}/menu_${Date.now()}_${ok}.${dl.ext}`;
        const { error: upErr } = await supabase.storage
          .from(BUCKET)
          .upload(objectPath, dl.bytes, {
            contentType: contentTypeForExt(dl.ext),
            upsert: false,
          });
        if (upErr) throw upErr;
        const publicUrl = supabase.storage.from(BUCKET).getPublicUrl(objectPath)
          .data.publicUrl;
        cached = publicUrl;
        urlCache.set(item.imagenUrl, publicUrl);
        console.log(`OK ${(dl.bytes.length / 1024).toFixed(0)}KB`);
      } else {
        console.log('reuse');
      }
      const { error: upProd } = await supabase
        .from('productos')
        .update({ imagen_url: cached, imagen_source_type: 'manual' })
        .eq('id', item.id)
        .eq('comercio_id', comercio.id);
      if (upProd) throw upProd;
      ok += 1;
    } catch (err) {
      console.log(`FAIL ${err.message}`);
      failed.push({ name: item.producto, reason: err.message, url: item.imagenUrl });
    }
  }

  if (embedCleanup) {
    try {
      rmSync(embedCleanup, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }

  const { count } = await supabase
    .from('productos')
    .select('id', { count: 'exact', head: true })
    .eq('comercio_id', comercio.id);
  const { count: withImg } = await supabase
    .from('productos')
    .select('id', { count: 'exact', head: true })
    .eq('comercio_id', comercio.id)
    .not('imagen_url', 'is', null);

  console.log('\n=== DONE ===');
  console.log(`URL: https://elmenuxfa.com/v/${SLUG}`);
  console.log(`Products: ${count} | with images: ${withImg}`);
  console.log(`Images applied: ${ok} | failed: ${failed.length}`);
  if (failed.length) {
    for (const f of failed.slice(0, 20)) {
      console.log(`  ! ${f.name}: ${f.reason}`);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
