import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';

const SLUG = 'el-parche-del-gato';
const BUCKET = 'product-images';
const SRC = path.resolve('scripts/_parche_imgs/user_batch3');
const OUT = path.resolve('scripts/_parche_imgs/user_batch3_ready');
fs.mkdirSync(OUT, { recursive: true });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL.trim(),
  process.env.SUPABASE_SERVICE_ROLE_KEY.trim(),
  { auth: { persistSession: false, autoRefreshToken: false } },
);

/** last wins */
const MAP = [
  {
    file: 'image-51ef1dbc-33ff-4a43-96d9-9c1f61f3da26.png',
    products: ['Porción de Costillas'],
    categories: ['Arroz Chino'],
  },
  {
    file: 'image-edde345a-4a7e-4feb-9bde-a51940a5591c.png',
    products: ['Arroz Chino Tradicional', 'Porción de Costillas'],
    categories: ['Arroz Chino'],
  },
  {
    file: 'image-51ef1dbc-33ff-4a43-96d9-9c1f61f3da26.png',
    products: ['Porción de Costillas'],
    categories: ['Arroz Chino'],
  },
  {
    file: 'image-12a5430c-5f62-4c75-8835-597ba6f398c0.png',
    products: ['Merengadas'],
    categories: ['Bebidas'],
  },
  {
    file: 'image-daf9f340-dfb5-46ef-ba2a-90e4b3e85ac8.png',
    products: ['Merengadas'],
    categories: ['Bebidas'],
  },
  {
    file: 'image-50d771c1-718b-4df6-a8c0-e16741a63f84.png',
    products: ['Super Wings', 'Alitas Dúo'],
    categories: ['Alitas'],
  },
  {
    file: 'image-d2b23f76-52ad-429b-9c55-4377e934b79c.png',
    products: ['Papas Fritas'],
    categories: ['Entradas'],
  },
];

function fold(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

async function toJpeg(src, dest) {
  await sharp(src)
    .rotate()
    .resize(900, 900, { fit: 'cover', position: 'centre' })
    .jpeg({ quality: 88, mozjpeg: true })
    .toFile(dest);
}

async function main() {
  const { data: comercio, error: cErr } = await supabase
    .from('comercios')
    .select('id,nombre')
    .eq('slug', SLUG)
    .single();
  if (cErr) throw cErr;
  const { data: products, error: pErr } = await supabase
    .from('productos')
    .select('id,nombre,categorias(nombre)')
    .eq('comercio_id', comercio.id);
  if (pErr) throw pErr;

  const assignment = new Map();
  for (const row of MAP) {
    const src = path.join(SRC, row.file);
    if (!fs.existsSync(src)) {
      console.warn('missing', row.file);
      continue;
    }
    const outPath = path.join(OUT, row.file.replace(/\.png$/i, '.jpg'));
    await toJpeg(src, outPath);
    const cats = new Set((row.categories || []).map(fold));
    for (const name of row.products) {
      for (const p of products) {
        if (fold(p.nombre) !== fold(name)) continue;
        if (cats.size && !cats.has(fold(p.categorias?.nombre))) continue;
        assignment.set(p.id, {
          productId: p.id,
          productName: p.nombre,
          category: p.categorias?.nombre,
          file: row.file,
          outPath,
        });
      }
    }
  }

  console.log('Assignments:');
  for (const row of assignment.values()) {
    console.log(`  [${row.category}] ${row.productName} ← ${path.basename(row.file)}`);
  }

  let updated = 0;
  for (const row of assignment.values()) {
    const bytes = fs.readFileSync(row.outPath);
    const objectPath = `${comercio.id}/user3_${row.productId}_${Date.now()}.jpg`;
    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(objectPath, bytes, { contentType: 'image/jpeg', upsert: false });
    if (upErr) {
      console.error('upload', row.productName, upErr.message);
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
      console.error('db', row.productName, uErr.message);
      continue;
    }
    updated += 1;
    console.log('Updated', row.productName);
  }
  console.log(`Done ${updated}/${assignment.size}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
