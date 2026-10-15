/**
 * Replace la-tribu-cafe product images from a local folder.
 * Only updates uniquely matched products. Never deletes products.
 *
 * Usage:
 *   node scripts/replace-tribu-product-images.mjs --dir "C:/path" [--dry-run]
 */
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

const SLUG = 'la-tribu-cafe';
const BUCKET = 'product-images';

function loadEnv() {
  const envPath = new URL('../.env.local', import.meta.url);
  return Object.fromEntries(
    fs
      .readFileSync(envPath, 'utf8')
      .split(/\r?\n/)
      .filter((line) => line && !line.startsWith('#') && line.includes('='))
      .map((line) => {
        const i = line.indexOf('=');
        let value = line.slice(i + 1).trim();
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }
        return [line.slice(0, i).trim(), value];
      }),
  );
}

function fold(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function parseArgs(argv) {
  let dir = '';
  let dryRun = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry-run') dryRun = true;
    else if (arg === '--dir') dir = argv[++i] ?? '';
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

function scoreMatch(fileKey, productName) {
  const productKey = fold(productName);
  if (!fileKey || !productKey) return 0;
  if (productKey === fileKey) return 100;
  // File is a distinctive suffix of the product name (e.g. "choripan" → "pm choripan").
  if (productKey.endsWith(` ${fileKey}`) || productKey.includes(` ${fileKey} `)) return 90;
  if (productKey.includes(fileKey)) return 80;
  // Handle common typos in filenames.
  const aliases = {
    'ice coffe': 'ice coffee',
    smothie: 'smoothie',
    'batido de proteina': 'batido de proteina',
    'hamburguesa super tribu': 'hamburguesa super tribu',
    'sandwich especial': 'sandwich especial',
    parfait: 'parfait la tribu',
    'bowl la tribu': 'bowl la tribu',
  };
  const alias = aliases[fileKey];
  if (alias) {
    if (productKey === alias) return 100;
    if (productKey.endsWith(` ${alias}`) || productKey.includes(alias)) return 90;
  }
  return 0;
}

function pickBestProduct(fileKey, products) {
  let best = null;
  let bestScore = 0;
  let ties = [];
  for (const product of products) {
    const score = scoreMatch(fileKey, product.nombre);
    if (score <= 0) continue;
    if (score > bestScore) {
      best = product;
      bestScore = score;
      ties = [product];
    } else if (score === bestScore) {
      ties.push(product);
    }
  }
  if (!best || bestScore < 80) return { product: null, score: bestScore, ambiguous: false };
  if (ties.length > 1) return { product: null, score: bestScore, ambiguous: true, ties };
  return { product: best, score: bestScore, ambiguous: false };
}

const { dir, dryRun } = parseArgs(process.argv.slice(2));
if (!dir) {
  console.error('Missing --dir path');
  process.exit(1);
}
const imageDir = path.resolve(dir);
if (!fs.existsSync(imageDir)) {
  console.error(`Directory not found: ${imageDir}`);
  process.exit(1);
}

const files = fs
  .readdirSync(imageDir)
  .filter((name) => /\.(jpe?g|png|webp)$/i.test(name))
  .map((name) => path.join(imageDir, name));

if (files.length === 0) {
  console.error('No image files found.');
  process.exit(1);
}

const env = loadEnv();
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

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
  .select('id,nombre,imagen_url')
  .eq('comercio_id', comercio.id);
if (productsError) throw new Error(productsError.message);

console.log(`Comercio: ${comercio.nombre} (${comercio.id})`);
console.log(`Images: ${files.length} | Products: ${products.length}`);
console.log(dryRun ? 'Mode: DRY RUN' : 'Mode: APPLY');

const planned = [];
const unmatched = [];
const ambiguous = [];

for (const filePath of files) {
  const base = path.basename(filePath);
  const fileKey = fold(base.replace(/\.[^.]+$/, ''));
  const match = pickBestProduct(fileKey, products);
  if (match.ambiguous) {
    ambiguous.push({
      file: base,
      candidates: match.ties.map((p) => p.nombre),
    });
    continue;
  }
  if (!match.product) {
    unmatched.push(base);
    continue;
  }
  planned.push({
    filePath,
    file: base,
    productId: match.product.id,
    productName: match.product.nombre,
    previousUrl: match.product.imagen_url,
    score: match.score,
  });
}

console.log('\nMatches:');
for (const item of planned) {
  console.log(`  ${item.file}  →  ${item.productName}  (score ${item.score})`);
}
if (unmatched.length) {
  console.log('\nUnmatched files (skipped):');
  for (const file of unmatched) console.log(`  ${file}`);
}
if (ambiguous.length) {
  console.log('\nAmbiguous files (skipped):');
  for (const item of ambiguous) {
    console.log(`  ${item.file} → ${item.candidates.join(' | ')}`);
  }
}

if (planned.length === 0) {
  console.log('\nNothing to update.');
  process.exit(1);
}

// Safety: never map two files to the same product.
const byProduct = new Map();
for (const item of planned) {
  if (byProduct.has(item.productId)) {
    console.error(
      `\nConflict: product "${item.productName}" matched by both "${byProduct.get(item.productId)}" and "${item.file}". Aborting.`,
    );
    process.exit(1);
  }
  byProduct.set(item.productId, item.file);
}

if (dryRun) {
  console.log(`\nDry run OK. Would update ${planned.length} products.`);
  process.exit(0);
}

let updated = 0;
for (const item of planned) {
  const bytes = fs.readFileSync(item.filePath);
  const ext = path.extname(item.filePath).toLowerCase().replace('.', '') || 'jpg';
  const objectPath = `${comercio.id}/replace_${item.productId}_${Date.now()}.${ext === 'jpeg' ? 'jpg' : ext}`;
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

  const { error: updateError } = await supabase
    .from('productos')
    .update({ imagen_url: publicUrl })
    .eq('id', item.productId)
    .eq('comercio_id', comercio.id);
  if (updateError) {
    console.error(`DB update failed for ${item.productName}: ${updateError.message}`);
    continue;
  }

  updated += 1;
  console.log(`Updated: ${item.productName}`);
}

console.log(`\nDone. Updated ${updated}/${planned.length} products.`);
if (updated !== planned.length) process.exit(1);
