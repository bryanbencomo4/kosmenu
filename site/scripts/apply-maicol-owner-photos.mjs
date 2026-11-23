/**
 * Assign owner real photos from a local folder to arroz-chino-maicol products
 * with the closest menu match (name + category).
 *
 * Usage (from site/):
 *   node --env-file=.env.local scripts/apply-maicol-owner-photos.mjs --dry-run
 *   node --env-file=.env.local scripts/apply-maicol-owner-photos.mjs
 *   node --env-file=.env.local scripts/apply-maicol-owner-photos.mjs --dir "C:/path"
 */
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

const SLUG = 'arroz-chino-maicol';
const BUCKET = 'product-images';
const DEFAULT_DIR = 'C:/Users/bryan/OneDrive/Desktop/MAICOL PRODUCTOS';

/**
 * Explicit photo → product matches (best coincidence).
 * Each entry: file basename → list of { name, category? }
 */
const ASSIGNMENTS = [
  {
    file: 'ARROZ ESPECIAL.jpeg',
    targets: [
      { name: 'Especial', category: 'Arroz chino 1,5 kg' },
      { name: '½ arroz especial', category: 'Porciones personales' },
      { name: 'Combo familiar 01', category: 'Combos familiares' },
    ],
  },
  {
    file: 'ARRPOZ FRITO CON CAMARONES.jpeg',
    targets: [
      { name: 'Solo camarón', category: 'Arroz chino 1,5 kg' },
      { name: 'Pollo y camarón', category: 'Arroz chino 1,5 kg' },
    ],
  },
  {
    file: 'CHOP SUEY ESPECIAL.jpeg',
    targets: [
      { name: 'Especial', category: 'Chop suey' },
      { name: '½ chop suey especial', category: 'Porciones personales' },
    ],
  },
  {
    file: 'LUMPIAS.jpeg',
    targets: [
      { name: 'Lumpias (2 unidades)', category: 'Acompañantes' },
      { name: 'Lumpia (1 unidad)', category: 'Acompañantes' },
    ],
  },
  {
    file: 'PAN.jpeg',
    targets: [{ name: 'Pan chino', category: 'Adicionales' }],
  },
  {
    file: 'POLLO AGRIDULCE.jpeg',
    targets: [{ name: 'Pollo agridulce (15 piezas)', category: 'Acompañantes' }],
  },
  {
    file: 'POLLO AGRIDULCE 2.jpeg',
    targets: [{ name: '½ pollo agridulce (8 piezas)', category: 'Acompañantes' }],
  },
  {
    file: 'POLLO.jpeg',
    targets: [
      { name: 'Pollo broaster + papas (4 piezas)', category: 'Acompañantes' },
      { name: 'Pollo', category: 'Adicionales' },
    ],
  },
  {
    file: 'ARROZ POLLO JAMON POLLO ALABASTER PAPA FRITA.jpeg',
    targets: [
      { name: '½ arroz pollo y jamón', category: 'Porciones personales' },
      { name: 'Pollo broaster + papas (8 piezas)', category: 'Acompañantes' },
      { name: 'Papas fritas', category: 'Acompañantes' },
    ],
  },
  {
    file: 'ARROZ POLLO JAMON 5 CAMARON FRITO 3 POLLO AGRIDULCE.jpeg',
    targets: [
      { name: 'Camarones fritos (15 piezas)', category: 'Acompañantes' },
      { name: 'Combo familiar 04', category: 'Combos familiares' },
    ],
  },
  {
    file: 'WhatsApp Image 2026-10-25 at 7.35.11 PM.jpeg',
    targets: [
      { name: 'Combo ½ arroz especial + Glup', category: 'Porciones personales' },
      { name: '½ papas fritas', category: 'Acompañantes' },
    ],
  },
];


function fold(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/½/g, '1 2')
    .replace(/1\/2/g, '1 2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function parseArgs(argv) {
  let dir = DEFAULT_DIR;
  let dryRun = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry-run') dryRun = true;
    else if (arg === '--dir') dir = argv[++i] ?? dir;
  }
  return { dir, dryRun };
}

function contentTypeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  return 'application/octet-stream';
}

function findProduct(products, name, category) {
  const wantName = fold(name);
  const wantCat = category ? fold(category) : null;
  const matches = products.filter((p) => {
    if (fold(p.nombre) !== wantName) return false;
    if (!wantCat) return true;
    return fold(p.categorias?.nombre) === wantCat;
  });
  return matches[0] || null;
}

const { dir, dryRun } = parseArgs(process.argv.slice(2));
const imageDir = path.resolve(dir);
if (!fs.existsSync(imageDir)) {
  console.error(`Directory not found: ${imageDir}`);
  process.exit(1);
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL.trim(),
  process.env.SUPABASE_SERVICE_ROLE_KEY.trim(),
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const { data: comercio, error: comercioError } = await supabase
  .from('comercios')
  .select('id,slug,nombre')
  .eq('slug', SLUG)
  .maybeSingle();
if (comercioError || !comercio) {
  throw new Error(comercioError?.message || `Comercio ${SLUG} not found`);
}

const { data: products, error: productsError } = await supabase
  .from('productos')
  .select('id,nombre,imagen_url,categorias(nombre)')
  .eq('comercio_id', comercio.id);
if (productsError) throw new Error(productsError.message);

console.log(`Comercio: ${comercio.nombre} (${comercio.id})`);
console.log(`Products: ${(products || []).length}`);
console.log(dryRun ? 'Mode: DRY RUN' : 'Mode: APPLY');
console.log(`Photos dir: ${imageDir}`);

const planned = [];
const missingFiles = [];
const missingProducts = [];

for (const assignment of ASSIGNMENTS) {
  const filePath = path.join(imageDir, assignment.file);
  if (!fs.existsSync(filePath)) {
    missingFiles.push(assignment.file);
    continue;
  }
  const resolvedTargets = [];
  for (const target of assignment.targets) {
    const product = findProduct(products || [], target.name, target.category);
    if (!product) {
      missingProducts.push(`${assignment.file} → ${target.name} [${target.category}]`);
      continue;
    }
    resolvedTargets.push({
      productId: product.id,
      productName: product.nombre,
      category: product.categorias?.nombre || target.category,
      previousUrl: product.imagen_url,
    });
  }
  if (resolvedTargets.length === 0) continue;
  planned.push({ file: assignment.file, filePath, targets: resolvedTargets });
}

console.log('\nPlanned assignments:');
for (const item of planned) {
  console.log(`  ${item.file}`);
  for (const t of item.targets) {
    console.log(`    → ${t.productName} (${t.category})`);
  }
}
if (missingFiles.length) {
  console.log('\nMissing files:');
  for (const f of missingFiles) console.log(`  ${f}`);
}
if (missingProducts.length) {
  console.log('\nMissing products:');
  for (const m of missingProducts) console.log(`  ${m}`);
}

if (planned.length === 0) {
  console.error('\nNothing to apply.');
  process.exit(1);
}

if (dryRun) {
  const productCount = planned.reduce((n, item) => n + item.targets.length, 0);
  console.log(`\nDry run OK. Would upload ${planned.length} photos → ${productCount} products.`);
  process.exit(0);
}

let updated = 0;
for (const item of planned) {
  const bytes = fs.readFileSync(item.filePath);
  const extRaw = path.extname(item.filePath).toLowerCase().replace('.', '') || 'jpg';
  const ext = extRaw === 'jpeg' ? 'jpg' : extRaw;
  const objectPath = `${comercio.id}/owner_${Date.now()}_${fold(item.file).replace(/\s+/g, '_').slice(0, 48)}.${ext}`;
  const contentType = contentTypeFor(item.filePath);

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(objectPath, bytes, { contentType, upsert: false });
  if (uploadError) {
    console.error(`Upload failed for ${item.file}: ${uploadError.message}`);
    continue;
  }

  const { data: publicData } = supabase.storage.from(BUCKET).getPublicUrl(objectPath);
  const publicUrl = publicData?.publicUrl;
  if (!publicUrl) {
    console.error(`No public URL for ${item.file}`);
    continue;
  }

  for (const target of item.targets) {
    const { error: updateError } = await supabase
      .from('productos')
      .update({
        imagen_url: publicUrl,
        imagen_source_type: 'manual',
      })
      .eq('id', target.productId)
      .eq('comercio_id', comercio.id);
    if (updateError) {
      console.error(`DB update failed for ${target.productName}: ${updateError.message}`);
      continue;
    }
    updated += 1;
    console.log(`Updated: ${target.productName} (${target.category}) ← ${item.file}`);
  }
}

const expected = planned.reduce((n, item) => n + item.targets.length, 0);
console.log(`\nDone. Updated ${updated}/${expected} product images.`);
if (updated !== expected) process.exit(1);
