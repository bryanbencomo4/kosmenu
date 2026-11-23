/**
 * Replace El Parche del Gato product images with the user-provided photo batch.
 *
 * Usage (from site/):
 *   node --env-file=.env.local scripts/import-elparche-user-batch1.mjs --dry-run
 *   node --env-file=.env.local scripts/import-elparche-user-batch1.mjs
 */
import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';

const dryRun = process.argv.includes('--dry-run');
const SLUG = 'el-parche-del-gato';
const BUCKET = 'product-images';
const SRC = path.resolve('scripts/_parche_imgs/user_batch1');
const OUT = path.resolve('scripts/_parche_imgs/user_batch1_ready');
fs.mkdirSync(OUT, { recursive: true });

const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
if (!url || !key) {
  console.error('Need env');
  process.exit(1);
}
const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/** file → product names (exact) + optional category disambiguator */
const MAP = [
  // Last assignment wins per product — put the preferred photo last for each.
  {
    file: 'image-7a4519ae-319a-45e3-a15d-70b6f2ba6e94.png',
    products: ['Salchiparrilla'],
    category: 'Salchipapas',
  },
  {
    file: 'image-f13dad24-f771-4cf7-9e61-21e6fdcf725a.png',
    products: ['Salchiparrilla'],
    category: 'Salchipapas',
  },
  {
    file: 'image-206121c8-3e61-415e-8c1f-791530a8a6da.png',
    products: ['Salchiparrilla Dúo'],
    category: 'Salchipapas',
  },
  {
    file: 'image-6a618c68-7512-4c6e-8e7a-c544a9c79078.png',
    products: ['Salchi Crispy'],
    category: 'Salchipapas',
  },
  {
    file: 'image-40bc86ec-44d3-457e-873f-d061834dbece.png',
    products: ['Clásica'],
    category: 'Salchipapas',
  },
  {
    file: 'image-b6315ff1-2585-43d4-a292-e49ecda0097f.png',
    products: ['Carne o Pollo Mechado'],
    category: 'Salchipapas',
  },
  {
    file: 'image-2ffed994-fc31-4fae-b237-01bda0d33eaa.png',
    products: ['Carne o Pollo Mechado'],
    category: 'Salchipapas',
  },
  {
    file: 'image-68eef854-1cc7-4fcd-b34c-8a54d2917c4a.png',
    products: ['Salchi Dúo'],
    category: 'Salchipapas',
  },
  {
    file: 'image-6a270d01-369c-4cc0-852e-df24859f7a65.png',
    products: ['Cochinita', 'Cochinita Dúo'],
    category: 'Salchipapas',
  },
  {
    file: 'image-d8b40f66-2e33-4cf7-8c16-03050b16a4b7.png',
    products: ['Alitas Personal'],
    category: 'Alitas',
  },
  {
    file: 'image-84c79c8a-59ae-4d76-9fa7-3dd35f38326b.png',
    products: ['Alitas Personal'],
    category: 'Alitas',
  },
  {
    file: 'image-e2d32687-5dfa-4c9b-96eb-c7896a21f87f.png',
    products: ['Alitas Dúo'],
    category: 'Alitas',
  },
  {
    file: 'image-09b2bbcd-e733-4e93-a980-1e59c6e0dbd0.png',
    products: ['Super Wings'],
    category: 'Alitas',
  },
  {
    file: 'image-02d26843-949a-46e2-a0cd-d2c5007c2b78.png',
    products: ['Arroz Chino Tradicional'],
    category: 'Arroz Chino',
  },
  {
    file: 'image-a945ddc8-01ee-40de-8fd1-73b6f37e87b0.png',
    products: [
      'Normal',
      'Salchiqueso',
      'Frankfurt',
      'Kosaka',
      'Polaca',
      'Chorifrito',
      'Carne o Pollo Mechado',
    ],
    category: 'Perros Calientes',
  },
  {
    file: 'image-85906da4-597f-4bd7-81a4-03b22f293514.png',
    products: ['Tequeños', 'Papas Fritas'],
    category: 'Entradas',
  },
];

function fold(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

async function toSquareJpeg(srcPath, outPath) {
  const meta = await sharp(srcPath).metadata();
  const side = Math.min(meta.width || 900, meta.height || 900);
  await sharp(srcPath)
    .rotate()
    .resize(900, 900, { fit: 'cover', position: 'centre' })
    .jpeg({ quality: 88, mozjpeg: true })
    .toFile(outPath);
  return outPath;
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
    .select('id,nombre,categoria_id,categorias(nombre)')
    .eq('comercio_id', comercio.id);
  if (pErr) throw pErr;

  console.log(comercio.nombre, products.length, 'products');
  console.log(dryRun ? 'DRY RUN' : 'APPLY');

  // Later map entries overwrite earlier ones for the same product (last wins).
  const assignment = new Map(); // productId -> { outPath, file, productName, category }

  for (const row of MAP) {
    const src = path.join(SRC, row.file);
    if (!fs.existsSync(src)) {
      console.warn('Missing file', row.file);
      continue;
    }
    const outName = row.file.replace(/\.png$/i, '.jpg');
    const outPath = path.join(OUT, outName);
    await toSquareJpeg(src, outPath);

    for (const name of row.products) {
      const matches = products.filter((p) => {
        if (fold(p.nombre) !== fold(name)) return false;
        if (row.category && fold(p.categorias?.nombre) !== fold(row.category)) {
          return false;
        }
        return true;
      });
      if (!matches.length) {
        console.warn(`No match for [${row.category}] ${name}`);
        continue;
      }
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

  console.log('\nFinal assignments:');
  for (const row of assignment.values()) {
    console.log(`  [${row.category}] ${row.productName} ← ${path.basename(row.file)}`);
  }

  if (dryRun) {
    console.log(`\nWould update ${assignment.size} products.`);
    return;
  }

  let updated = 0;
  for (const row of assignment.values()) {
    const bytes = fs.readFileSync(row.outPath);
    const objectPath = `${comercio.id}/user_${row.productId}_${Date.now()}.jpg`;
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
  console.log(`\nDone ${updated}/${assignment.size}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
