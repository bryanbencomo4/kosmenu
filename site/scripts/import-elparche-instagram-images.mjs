/**
 * Crop Instagram grid cells from the Parche PDF extract and attach to matching products.
 *
 * Usage (from site/):
 *   node --env-file=.env.local scripts/import-elparche-instagram-images.mjs --dry-run
 *   node --env-file=.env.local scripts/import-elparche-instagram-images.mjs
 */
import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';

const dryRun = process.argv.includes('--dry-run');
const SLUG = 'el-parche-del-gato';
const BUCKET = 'product-images';
const CELLS = path.resolve('scripts/_parche_imgs/cells_clean');
const OUT = path.resolve('scripts/_parche_imgs/ready');

fs.mkdirSync(OUT, { recursive: true });

const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
if (!url || !serviceKey) {
  console.error('Need NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}
const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/**
 * Manual matches: only high-confidence food shots → product names.
 * process: optional crop fractions (0-1) before square output.
 */
const MATCHES = [
  {
    products: ['Salchiparrilla', 'Salchiparrilla Dúo', 'Salchi Dúo'],
    cell: 'r00_c0.jpg',
    file: 'salchiparrilla.jpg',
    process: { top: 0.38, left: 0.42, size: 0.55, zoom: 1.02 },
  },
  {
    products: ['Clásica'],
    cell: 'r11_c1.jpg',
    file: 'salchi-clasica.jpg',
    process: { top: 0.0, left: 0.0, size: 0.72, zoom: 1.15 },
  },
  {
    products: ['Carne o Pollo Mechado'],
    // Salchipapas category — disambiguate by preferencia later
    cell: 'r09_c1.jpg',
    file: 'salchi-mechado.jpg',
    process: { top: 0.42, left: 0.0, size: 0.58, zoom: 1.05 },
    preferCategory: 'Salchipapas',
  },
  {
    products: ['Salchi Crispy'],
    cell: 'r05_c0.jpg',
    file: 'salchi-crispy.jpg',
    process: { top: 0.0, left: 0.08, size: 0.55, zoom: 1.12 },
  },
  {
    products: ['Cochinita', 'Cochinita Dúo'],
    cell: 'r07_c0.jpg',
    file: 'cochinita.jpg',
    process: { top: 0.05, left: 0.05, size: 0.9, zoom: 1.05 },
  },
  {
    products: ['Alitas Personal'],
    cell: 'r09_c0.jpg',
    file: 'alitas-personal.jpg',
    process: { top: 0.0, left: 0.12, size: 0.55, zoom: 1.1 },
  },
  {
    products: ['Alitas Dúo', 'Super Wings'],
    cell: 'r06_c1.jpg',
    file: 'alitas-plato.jpg',
    process: { top: 0.02, left: 0.02, size: 0.96, zoom: 1.0 },
  },
  {
    products: ['1/4 Pollo Broaster', '1/2 Pollo Broaster'],
    cell: 'r12_c0.jpg',
    file: 'pollo-broaster.jpg',
    process: { top: 0.02, left: 0.22, size: 0.72, zoom: 1.02 },
  },
  {
    products: ['Arroz Chino Tradicional'],
    cell: 'r07_c0.jpg',
    file: 'arroz-chino.jpg',
    process: { top: 0.35, left: 0.05, size: 0.6, zoom: 1.1 },
  },
  {
    products: ['Porción de Costillas'],
    cell: 'r07_c0.jpg',
    file: 'costillas.jpg',
    process: { top: 0.08, left: 0.2, size: 0.7, zoom: 1.15 },
  },
  {
    products: ['Normal', 'Salchiqueso'],
    cell: 'r00_c2.jpg',
    file: 'perro-queso.jpg',
    process: { top: 0.22, left: 0.0, size: 1.0, zoom: 1.0 },
  },
  {
    products: ['Frankfurt', 'Kosaka', 'Polaca', 'Chorifrito'],
    cell: 'r13_c2.jpg',
    file: 'perros-duo.jpg',
    process: { top: 0.08, left: 0.02, size: 0.9, zoom: 1.05 },
  },
  {
    products: ['Carne o Pollo Mechado'],
    cell: 'r13_c2.jpg',
    file: 'perro-mechado.jpg',
    process: { top: 0.08, left: 0.02, size: 0.9, zoom: 1.05 },
    preferCategory: 'Perros Calientes',
  },
  {
    products: ['Papas Fritas'],
    cell: 'r06_c1.jpg',
    file: 'papas-fritas.jpg',
    process: { top: 0.0, left: 0.05, size: 0.45, zoom: 1.2 },
  },
  {
    products: ['Merengadas'],
    cell: 'r09_c0.jpg',
    file: 'merengada.jpg',
    process: { top: 0.45, left: 0.28, size: 0.7, zoom: 1.05 },
  },
];

async function processCell(cellName, outName, opts) {
  const src = path.join(CELLS, cellName);
  if (!fs.existsSync(src)) throw new Error(`Missing cell ${cellName}`);
  const meta = await sharp(src).metadata();
  const w = meta.width;
  const h = meta.height;
  const top = Math.round((opts.top ?? 0) * h);
  const left = Math.round((opts.left ?? 0) * w);
  const size = Math.round((opts.size ?? 1) * Math.min(w - left, h - top));
  const zoom = opts.zoom ?? 1;
  const extractSize = Math.max(64, Math.round(size / zoom));
  const cx = left + Math.round(size / 2);
  const cy = top + Math.round(size / 2);
  const ex = Math.max(0, Math.min(w - extractSize, cx - Math.round(extractSize / 2)));
  const ey = Math.max(0, Math.min(h - extractSize, cy - Math.round(extractSize / 2)));

  const outPath = path.join(OUT, outName);
  await sharp(src)
    .extract({ left: ex, top: ey, width: extractSize, height: extractSize })
    .resize(900, 900, { fit: 'cover' })
    .jpeg({ quality: 88, mozjpeg: true })
    .toFile(outPath);
  return outPath;
}

function fold(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

async function main() {
  const { data: comercio, error: cErr } = await supabase
    .from('comercios')
    .select('id,nombre,slug')
    .eq('slug', SLUG)
    .maybeSingle();
  if (cErr || !comercio) throw new Error(cErr?.message || 'Comercio not found');

  const { data: products, error: pErr } = await supabase
    .from('productos')
    .select('id,nombre,imagen_url,categoria_id,categorias(nombre)')
    .eq('comercio_id', comercio.id);
  if (pErr) throw pErr;

  console.log(`Comercio ${comercio.nombre} | products ${products.length}`);
  console.log(dryRun ? 'DRY RUN' : 'APPLY');

  const planned = [];
  const usedProductIds = new Set();

  for (const match of MATCHES) {
    const outPath = await processCell(match.cell, match.file, match.process || {});
    for (const productName of match.products) {
      const candidates = products.filter((p) => fold(p.nombre) === fold(productName));
      let picked = candidates;
      if (match.preferCategory) {
        const pref = candidates.filter(
          (p) => fold(p.categorias?.nombre) === fold(match.preferCategory),
        );
        if (pref.length) picked = pref;
      }
      if (!picked.length) {
        console.warn(`No product named "${productName}" (${match.preferCategory || ''})`);
        continue;
      }
      for (const product of picked) {
        if (usedProductIds.has(product.id)) continue;
        usedProductIds.add(product.id);
        planned.push({
          productId: product.id,
          productName: product.nombre,
          category: product.categorias?.nombre,
          outPath,
          file: match.file,
        });
      }
    }
  }

  console.log('\nAssignments:');
  for (const row of planned) {
    console.log(`  [${row.category}] ${row.productName} ← ${row.file}`);
  }
  const uncovered = products.filter((p) => !usedProductIds.has(p.id));
  if (uncovered.length) {
    console.log('\nUncovered products:');
    for (const p of uncovered) console.log(`  - [${p.categorias?.nombre}] ${p.nombre}`);
  }

  if (dryRun) {
    console.log(`\nDry run OK. Would update ${planned.length} products.`);
    return;
  }

  let updated = 0;
  for (const row of planned) {
    const bytes = fs.readFileSync(row.outPath);
    const objectPath = `${comercio.id}/ig_${row.productId}_${Date.now()}.jpg`;
    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(objectPath, bytes, { contentType: 'image/jpeg', upsert: false });
    if (upErr) {
      console.error('Upload failed', row.productName, upErr.message);
      continue;
    }
    const publicUrl = supabase.storage.from(BUCKET).getPublicUrl(objectPath).data
      .publicUrl;
    const { error: uErr } = await supabase
      .from('productos')
      .update({
        imagen_url: publicUrl,
        imagen_source_type: 'manual',
        updated_at: new Date().toISOString(),
      })
      .eq('id', row.productId)
      .eq('comercio_id', comercio.id);
    if (uErr) {
      console.error('DB update failed', row.productName, uErr.message);
      continue;
    }
    updated += 1;
    console.log('Updated', row.productName);
  }
  console.log(`\nDone. Updated ${updated}/${planned.length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
