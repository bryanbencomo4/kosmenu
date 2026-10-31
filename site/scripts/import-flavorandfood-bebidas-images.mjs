/**
 * Import real drink images for Flavor and Food from the Excel URL sheet.
 *
 * Usage (from site/):
 *   node --env-file=.env.local scripts/import-flavorandfood-bebidas-images.mjs
 *   node --env-file=.env.local scripts/import-flavorandfood-bebidas-images.mjs --xlsx "C:/path.xlsx"
 */
import { createClient } from '@supabase/supabase-js';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const require = createRequire(import.meta.url);
const XLSX = require('xlsx');
const sharp = require('sharp');

const SLUG = 'flavorandfood';
const BUCKET = 'product-images';
const DEFAULT_XLSX = resolve(
  process.env.USERPROFILE || '',
  'Downloads/imagenes_reales_bebidas_menu.xlsx',
);

const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
if (!url || !serviceKey) {
  console.error('Need NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : null;
}

function normalizeName(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Hotlink fallbacks when sheet CDNs return 403/404. */
const FALLBACK_URLS = {
  'Refresco personal':
    'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?w=1200',
  'Jugo de parchita':
    'https://images.pexels.com/photos/5946081/pexels-photo-5946081.jpeg?auto=compress&cs=tinysrgb&w=1200',
  Nestea: 'https://images.unsplash.com/photo-1556679343-c7306c1976bc?w=1200',
};

function readRows(xlsxPath) {
  const wb = XLSX.readFile(xlsxPath);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '', header: 1 });
  const out = [];
  for (const row of rows) {
    const nombre = String(row[0] || '').trim();
    const imageUrl = String(row[1] || '').trim();
    if (!nombre || !imageUrl.startsWith('http')) continue;
    out.push({ nombre, imageUrl });
  }
  return out;
}

async function downloadImage(imageUrl) {
  const res = await fetch(imageUrl, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
      Referer: new URL(imageUrl).origin + '/',
    },
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const webp = await sharp(buf)
    .rotate()
    .resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer();
  return webp;
}

async function main() {
  const xlsxPath = resolve(argValue('--xlsx') || DEFAULT_XLSX);
  const mappings = readRows(xlsxPath);
  console.log(`Sheet rows: ${mappings.length} from ${xlsxPath}`);

  const { data: comercio, error: cErr } = await supabase
    .from('comercios')
    .select('id')
    .eq('slug', SLUG)
    .single();
  if (cErr || !comercio) throw new Error(`Commerce not found: ${cErr?.message || SLUG}`);

  const { data: products, error: pErr } = await supabase
    .from('productos')
    .select('id,nombre,imagen_url,categorias!inner(nombre)')
    .eq('comercio_id', comercio.id)
    .eq('categorias.nombre', 'Bebidas');
  if (pErr) throw new Error(pErr.message);

  const byNorm = new Map(products.map((p) => [normalizeName(p.nombre), p]));
  let ok = 0;
  const failed = [];

  for (const row of mappings) {
    const product = byNorm.get(normalizeName(row.nombre));
    if (!product) {
      console.log(`SKIP (no product): ${row.nombre}`);
      failed.push(row.nombre);
      continue;
    }
    process.stdout.write(`${product.nombre}... `);
    const urls = [row.imageUrl, FALLBACK_URLS[product.nombre]].filter(Boolean);
    let lastErr = null;
    let done = false;
    for (const imageUrl of urls) {
      try {
        const bytes = await downloadImage(imageUrl);
        const objectPath = `${comercio.id}/bebida_${product.id}.webp`;
        const { error: upErr } = await supabase.storage.from(BUCKET).upload(objectPath, bytes, {
          contentType: 'image/webp',
          upsert: true,
        });
        if (upErr) throw upErr;
        const publicUrl = supabase.storage.from(BUCKET).getPublicUrl(objectPath).data.publicUrl;
        const { error: updErr } = await supabase
          .from('productos')
          .update({ imagen_url: publicUrl, imagen_source_type: 'manual' })
          .eq('id', product.id)
          .eq('comercio_id', comercio.id);
        if (updErr) throw updErr;
        ok += 1;
        const via = imageUrl === row.imageUrl ? '' : ' (fallback)';
        console.log(`OK (${Math.round(bytes.length / 1024)}KB)${via}`);
        done = true;
        break;
      } catch (e) {
        lastErr = e;
      }
    }
    if (!done) {
      console.log(`FAIL ${lastErr?.message || lastErr}`);
      failed.push(product.nombre);
    }
  }

  console.log(`\nDone: ${ok}/${mappings.length} | failed: ${failed.length}`);
  if (failed.length) console.log('Failed:', failed.join(', '));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
