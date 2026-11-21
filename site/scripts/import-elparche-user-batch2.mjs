/**
 * Batch 2: hamburguesas / woper / arroz from user photos.
 * Usage: node --env-file=.env.local scripts/import-elparche-user-batch2.mjs
 */
import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';

const SLUG = 'el-parche-del-gato';
const BUCKET = 'product-images';
const SRC = path.resolve('scripts/_parche_imgs/user_batch2');
const OUT = path.resolve('scripts/_parche_imgs/user_batch2_ready');
fs.mkdirSync(OUT, { recursive: true });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL.trim(),
  process.env.SUPABASE_SERVICE_ROLE_KEY.trim(),
  { auth: { persistSession: false, autoRefreshToken: false } },
);

/** last assignment wins */
const MAP = [
  {
    file: 'image-ab2463a9-53c0-4814-b96d-114ef0f4e34f.png',
    products: ['Croqueta', 'Woper Croqueta'],
    categories: ['Hamburguesas', 'Woper'],
  },
  {
    file: 'image-8f54eb06-d1fa-4c89-96b8-7861168fce8d.png',
    products: ['Lomito', 'Lomo de Cerdo'],
    categories: ['Hamburguesas'],
  },
  {
    file: 'image-48349ad0-6b93-477f-b5c1-4f8eee4e02ca.png',
    products: ['Pollo Crispy', 'Milanesa'],
    categories: ['Hamburguesas'],
  },
  {
    file: 'image-872865d3-4dee-4113-8f6f-04146a9a37eb.png',
    products: ['Milanesa'],
    categories: ['Hamburguesas'],
  },
  {
    file: 'image-27737cd6-3d71-4d9c-b2fb-d4d36fd05420.png',
    products: ['Carne o Pollo Mechado', 'Woper Carne o Pollo Mechado'],
    categories: ['Hamburguesas', 'Woper'],
  },
  {
    file: 'image-49a090e7-995f-4321-af1e-85c8c52016cb.png',
    products: ['Carne o Pollo Mechado'],
    categories: ['Hamburguesas'],
  },
  {
    file: 'image-21da9807-1be0-40a9-a17c-6c3c277d9752.png',
    products: ['Croqueta'],
    categories: ['Hamburguesas'],
  },
  {
    file: 'image-d0790014-9125-419e-91f8-f38f10515a5d.png',
    products: ['Arroz Chino Tradicional'],
    categories: ['Arroz Chino'],
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
    const catSet = new Set((row.categories || []).map(fold));
    for (const name of row.products) {
      const matches = products.filter((p) => {
        if (fold(p.nombre) !== fold(name)) return false;
        if (catSet.size && !catSet.has(fold(p.categorias?.nombre))) return false;
        return true;
      });
      for (const p of matches) {
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
    const objectPath = `${comercio.id}/user2_${row.productId}_${Date.now()}.jpg`;
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
