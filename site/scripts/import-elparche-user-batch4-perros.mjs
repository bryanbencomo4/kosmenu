/**
 * Replace Perros Calientes images from user photos.
 * Usage: node --env-file=.env.local scripts/import-elparche-user-batch4-perros.mjs
 */
import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';

const SLUG = 'el-parche-del-gato';
const BUCKET = 'product-images';
const SRC = path.resolve('scripts/_parche_imgs/user_batch4_perros');
const OUT = path.resolve('scripts/_parche_imgs/user_batch4_perros_ready');
fs.mkdirSync(OUT, { recursive: true });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL.trim(),
  process.env.SUPABASE_SERVICE_ROLE_KEY.trim(),
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const MAP = [
  {
    file: 'image-58348bbc-fe22-4579-9879-0b60bbf8ddf1.png',
    products: ['Normal'],
  },
  {
    file: 'image-c8cf8bf3-fafd-45cb-96b7-e8b252eccaa0.jpg',
    products: ['Frankfurt'],
  },
  {
    file: 'image-600471eb-696f-4ad4-b561-2e2669e4a6ad.jpg',
    products: ['Kosaka'],
  },
  {
    file: 'image-b0403c8a-2463-49ea-8467-8a31b6b78719.png',
    products: ['Polaca'],
  },
  {
    file: 'image-8a1b4c80-017d-4632-8078-0572a8676f27.png',
    products: ['Carne o Pollo Mechado'],
  },
  {
    file: 'image-b90869a8-c241-4b75-b2a9-fbdd89f8ad7a.png',
    products: ['Salchiqueso'],
  },
  {
    file: 'image-49005056-2093-41a2-b5a4-f5ace2c39477.png',
    products: ['Chorifrito'],
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
  const meta = await sharp(src).metadata();
  let pipeline = sharp(src).rotate();
  // Transparent / checkerboard-friendly: flatten onto white before crop
  if (meta.hasAlpha) {
    pipeline = pipeline.flatten({ background: { r: 255, g: 255, b: 255 } });
  }
  await pipeline
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
    const outPath = path.join(
      OUT,
      row.file.replace(/\.(png|jpe?g)$/i, '.jpg'),
    );
    await toJpeg(src, outPath);
    for (const name of row.products) {
      for (const p of products) {
        if (fold(p.nombre) !== fold(name)) continue;
        if (fold(p.categorias?.nombre) !== fold('Perros Calientes')) continue;
        assignment.set(p.id, {
          productId: p.id,
          productName: p.nombre,
          file: row.file,
          outPath,
        });
      }
    }
  }

  console.log('Assignments:');
  for (const row of assignment.values()) {
    console.log(`  ${row.productName} ← ${path.basename(row.file)}`);
  }

  let updated = 0;
  for (const row of assignment.values()) {
    const bytes = fs.readFileSync(row.outPath);
    const objectPath = `${comercio.id}/perros_${row.productId}_${Date.now()}.jpg`;
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
