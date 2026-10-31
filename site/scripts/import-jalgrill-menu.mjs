/**
 * Import J'ALGRIL menu from Catalogo_Visual_Jalgrill_Precios_COP.xlsx
 * (sheet "Datos y fuentes"): categories, COP prices, descriptions, images.
 *
 * Usage (from site/):
 *   node --env-file=.env.local scripts/import-jalgrill-menu.mjs --dry-run
 *   node --env-file=.env.local scripts/import-jalgrill-menu.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const XLSX = require('xlsx');

const dryRun = process.argv.includes('--dry-run');
const SLUG = 'jalgrill';
const BUCKET = 'product-images';
const XLSX_PATH =
  process.argv.find((a, i, arr) => arr[i - 1] === '--xlsx') ||
  'C:/Users/bryan/Downloads/Catalogo_Visual_Jalgrill_Precios_COP.xlsx';

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
  if (!p) return d;
  if (!d) return `Presentación: ${p}.`;
  if (d.toLowerCase().includes(p.toLowerCase())) return d;
  return `${d} Presentación: ${p}.`;
}

function parseMenu(filePath) {
  const wb = XLSX.readFile(filePath);
  const sheet = wb.Sheets['Datos y fuentes'];
  if (!sheet) throw new Error('Missing sheet Datos y fuentes');
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '', range: 3 });
  const items = [];
  for (const row of rows) {
    const categoria = String(row['CATEGORÍA'] || row.CATEGORIA || '').trim();
    const producto = String(row.PRODUCTO || '').trim();
    if (!categoria || !producto) continue;
    if (/^IMPORTANTE:/i.test(categoria)) continue;
    const priceRaw = row['PRECIO COP'] ?? row.PRECIO_COP;
    const precio =
      typeof priceRaw === 'number'
        ? priceRaw
        : Number(String(priceRaw).replace(/[^\d.]/g, ''));
    if (!Number.isFinite(precio) || precio <= 0) continue;
    items.push({
      categoria,
      producto,
      descripcion: buildDescription(
        row['DESCRIPCIÓN'] || row.DESCRIPCION,
        row['PRESENTACIÓN'] || row.PRESENTACION,
      ),
      precio: Math.round(precio),
      imagenUrl: String(row['URL DE FOTO REAL'] || '').trim(),
    });
  }
  return items;
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

async function main() {
  const items = parseMenu(XLSX_PATH);
  const cats = [...new Set(items.map((p) => p.categoria))];
  console.log(`Products: ${items.length}`);
  console.log(
    'Categories:',
    cats
      .map((c) => `${c} (${items.filter((p) => p.categoria === c).length})`)
      .join(', '),
  );

  const { data: comercio, error: cErr } = await supabase
    .from('comercios')
    .select('id,nombre')
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
    console.log(`Dry run OK for ${comercio.nombre}.`);
    for (const item of items) {
      console.log(`- [${item.categoria}] ${item.producto} · $${item.precio} COP`);
    }
    return;
  }

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
  const byCatOrden = new Map();
  for (const item of items) {
    const ord = byCatOrden.get(item.categoria) ?? 0;
    byCatOrden.set(item.categoria, ord + 1);
    const { data: product, error } = await supabase
      .from('productos')
      .insert({
        comercio_id: comercio.id,
        categoria_id: categoryIds.get(item.categoria),
        nombre: item.producto,
        descripcion: item.descripcion,
        precio: item.precio,
        disponible: true,
        orden: ord,
        imagen_source_type: 'manual',
      })
      .select('id,nombre')
      .single();
    if (error) throw error;
    inserted.push({ ...item, id: product.id });
  }
  console.log(`Inserted ${inserted.length} products`);

  const urlCache = new Map();
  let ok = 0;
  const failed = [];
  for (const item of inserted) {
    if (!item.imagenUrl) continue;
    process.stdout.write(`Image ${item.producto.slice(0, 42)}... `);
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
        cached = supabase.storage.from(BUCKET).getPublicUrl(objectPath)
          .data.publicUrl;
        urlCache.set(item.imagenUrl, cached);
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
    for (const f of failed) {
      console.log(`  ! ${f.name}: ${f.reason}`);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
