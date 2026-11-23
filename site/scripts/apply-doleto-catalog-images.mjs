/**
 * Download product images from Catalogo_Visual_Primera_Categoria_Licoreria.xlsx
 * (sheet "Fuentes imágenes") and assign them to inversiones-doleto products.
 *
 * Usage:
 *   node --env-file=.env.local scripts/apply-doleto-catalog-images.mjs [--dry-run]
 *   node --env-file=.env.local scripts/apply-doleto-catalog-images.mjs --xlsx "C:/path.xlsx"
 */
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import XLSX from 'xlsx';

const SLUG = 'inversiones-doleto';
const BUCKET = 'product-images';
const DEFAULT_XLSX =
  'C:/Users/bryan/Downloads/Catalogo_Visual_Primera_Categoria_Licoreria.xlsx';

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
  let xlsx = DEFAULT_XLSX;
  let dryRun = false;
  let onlyMissing = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry-run') dryRun = true;
    else if (arg === '--only-missing') onlyMissing = true;
    else if (arg === '--xlsx') xlsx = argv[++i] ?? xlsx;
  }
  return { xlsx, dryRun, onlyMissing };
}

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

/** Broken / blocked catalog URLs → working public alternatives. */
const URL_OVERRIDES = {
  'Sangría Mojito': (() => {
    const pathStr =
      'hdc/hc2/12786292949022/515Wx515H_1200_baseFormat_1200_baseFormat_40009715-12_40009715';
    const inner = Buffer.from(pathStr, 'utf8').toString('base64');
    const hash = '89940341b39f0fba804e0cc1d2cea70e06b43aaafbfcf5dcaa99a10d2310ce46';
    const ctx = Buffer.from(
      `master|images|156131|image/jpeg|${inner}|${hash}`,
      'utf8',
    ).toString('base64');
    return `https://api.cl94ncbhsi-excelsior1-p1-public.model-t.cc.commerce.ondemand.com/medias/515Wx515H-1200-baseFormat-1200-baseFormat-40009715-12-40009715?context=${ctx}`;
  })(),
  'Smirnoff Green Apple lata 250 ml':
    'https://api.lalicorera.com/storage/productos/licores/85529316-smirnoff-green-apple1.webp?t=1746723396000',
  'Old Parr Tropical':
    'https://elgrandgourmet.com/cdn/shop/files/whisky-old-parr-tropical-12y-750ml.webp?v=1783630847',
  'Ron Santa Teresa 1796':
    'https://vinotecamx.vtexassets.com/arquivos/ids/1671057/R24536-Vinoteca-Ron-Santa-Teresa-1796-750Ml-001.jpg.jpg?v=639235135930870000',
  'Santa Teresa 1796 surtido':
    'https://vinotecamx.vtexassets.com/arquivos/ids/1671058/R24536-Vinoteca-Ron-Santa-Teresa-1796-750Ml-002.jpg.jpg?v=639235135932900000',
  'Ponche Crema':
    'https://elportalvenezolano.com/cdn/shop/files/Ponche_Crema_f5b71337-e009-4780-b0ba-45199c501474.png?v=1776126540',
  'Granadina 350 ml':
    'https://www.sigo.com.ve/images/thumbs/0018288_jarabe-garlin-granadina-070-ml.jpeg',
  'Pepsi 2 L':
    'https://www.sigo.com.ve/images/thumbs/0021207_refresco-pepsi-2-l.jpeg',
  'Yukery 250 ml':
    'https://www.sigo.com.ve/images/thumbs/0025069_jugo-yukery-naranjada-250ml.jpeg',
  Rockstar: 'https://d2j6dbq0eux0bg.cloudfront.net/images/28254021/5559310213.jpg',
  'Malta lata 355 ml':
    'https://www.sigo.com.ve/images/thumbs/0019922_malta-maltin-polar-lata-355ml.jpeg',
  Chupetas:
    'https://exitocol.vtexassets.com/arquivos/ids/36347278/Bon-Bon-Bum-Surtido-165524_a.jpg?v=639276068065370000',
  'Takis Blue Heat 50 g':
    'https://goldenfishgames.com/cdn/shop/files/37483815-763a-4e7f-b518-ad470ebb5c47.da176ba1456981d2888affb5b67e16b3_1200x1200.webp?v=1776463158',
  'Doritos Dinamita pequeño':
    'https://exitocol.vtexassets.com/arquivos/ids/34926030/Pasabocas-de-Maiz-Sabor-Limon-Taquero-DORITOS-50-gr-3297408_a.jpg?v=639232622133970000',
  'Doritos Dinamita surtido familiar':
    'https://exitocol.vtexassets.com/arquivos/ids/34406293/Pasabocas-Maiz-Dinami-Limon-Ta-DORITOS-200-gr-3276289_a.jpg?v=639211510417900000',
  'Carbón premium':
    'https://www.humobarriles.com/cdn/shop/files/carb2_4846d131-df67-4da7-959c-60253e8994d7.webp?v=1783395930',
};

function readCatalogRows(xlsxPath) {
  const wb = XLSX.readFile(xlsxPath);
  const sheet = wb.Sheets['Fuentes imágenes'] || wb.Sheets[wb.SheetNames[1]];
  if (!sheet) throw new Error('Sheet "Fuentes imágenes" not found');
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  const out = [];
  for (const r of rows) {
    const producto = String(r[0] ?? '').trim();
    let url = String(r[1] ?? '').trim();
    if (!producto || !url) continue;
    if (producto === 'PRODUCTO' || !/^https?:\/\//i.test(url)) continue;
    if (/^las imágenes/i.test(producto) || /^fuentes/i.test(producto)) continue;
    if (URL_OVERRIDES[producto]) url = URL_OVERRIDES[producto];
    out.push({ producto, url });
  }
  return out;
}

function pickProduct(catalogName, products) {
  const key = fold(catalogName);
  const exact = products.filter((p) => fold(p.nombre) === key);
  if (exact.length === 1) return { product: exact[0], score: 100, ambiguous: false };
  if (exact.length > 1) return { product: null, score: 100, ambiguous: true, ties: exact };

  let best = null;
  let bestScore = 0;
  const ties = [];
  for (const product of products) {
    const pk = fold(product.nombre);
    let score = 0;
    if (pk === key) score = 100;
    else if (pk.includes(key) || key.includes(pk)) score = 85;
    if (score <= 0) continue;
    if (score > bestScore) {
      best = product;
      bestScore = score;
      ties.length = 0;
      ties.push(product);
    } else if (score === bestScore) {
      ties.push(product);
    }
  }
  if (!best || bestScore < 85) return { product: null, score: bestScore, ambiguous: false };
  if (ties.length > 1) return { product: null, score: bestScore, ambiguous: true, ties };
  return { product: best, score: bestScore, ambiguous: false };
}

const { xlsx, dryRun, onlyMissing } = parseArgs(process.argv.slice(2));
if (!fs.existsSync(xlsx)) {
  console.error(`Excel not found: ${xlsx}`);
  process.exit(1);
}

const catalog = readCatalogRows(xlsx);
console.log(`Catalog rows with URLs: ${catalog.length}`);

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
console.log(`Products: ${products.length}`);
console.log(dryRun ? 'Mode: DRY RUN' : 'Mode: APPLY');

const planned = [];
const unmatched = [];
const ambiguous = [];

for (const row of catalog) {
  const match = pickProduct(row.producto, products);
  if (match.ambiguous) {
    ambiguous.push({
      catalog: row.producto,
      candidates: match.ties.map((p) => p.nombre),
    });
    continue;
  }
  if (!match.product) {
    unmatched.push(row.producto);
    continue;
  }
  if (onlyMissing && (match.product.imagen_url || '').trim()) continue;
  planned.push({
    catalogName: row.producto,
    url: row.url,
    productId: match.product.id,
    productName: match.product.nombre,
    previousUrl: match.product.imagen_url,
    score: match.score,
  });
}

console.log('\nMatches:');
for (const item of planned) {
  console.log(`  ${item.catalogName}  →  ${item.productName}  (score ${item.score})`);
}
if (unmatched.length) {
  console.log('\nUnmatched catalog rows (skipped):');
  for (const name of unmatched) console.log(`  ${name}`);
}
if (ambiguous.length) {
  console.log('\nAmbiguous catalog rows (skipped):');
  for (const item of ambiguous) {
    console.log(`  ${item.catalog} → ${item.candidates.join(' | ')}`);
  }
}

const byProduct = new Map();
for (const item of planned) {
  if (byProduct.has(item.productId)) {
    console.error(
      `\nConflict: product "${item.productName}" matched by both "${byProduct.get(item.productId)}" and "${item.catalogName}". Aborting.`,
    );
    process.exit(1);
  }
  byProduct.set(item.productId, item.catalogName);
}

if (planned.length === 0) {
  console.log('\nNothing to update.');
  process.exit(1);
}

if (dryRun) {
  console.log(`\nDry run OK. Would update ${planned.length} products.`);
  process.exit(0);
}

let updated = 0;
const failed = [];

for (const item of planned) {
  process.stdout.write(`Downloading ${item.catalogName}... `);
  let res;
  try {
    res = await fetch(item.url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
      },
      redirect: 'follow',
    });
  } catch (err) {
    console.log(`FAIL fetch: ${err.message}`);
    failed.push({ name: item.catalogName, reason: err.message });
    continue;
  }
  if (!res.ok) {
    console.log(`FAIL HTTP ${res.status}`);
    failed.push({ name: item.catalogName, reason: `HTTP ${res.status}` });
    continue;
  }

  const contentType = res.headers.get('content-type') || '';
  const bytes = Buffer.from(await res.arrayBuffer());
  if (bytes.length < 500) {
    console.log(`FAIL too small (${bytes.length} bytes)`);
    failed.push({ name: item.catalogName, reason: `too small ${bytes.length}` });
    continue;
  }

  const ext = extFromUrlOrType(item.url, contentType);
  const objectPath = `${comercio.id}/catalog_${item.productId}_${Date.now()}.${ext}`;
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(objectPath, bytes, { contentType: contentTypeForExt(ext), upsert: false });
  if (uploadError) {
    console.log(`FAIL upload: ${uploadError.message}`);
    failed.push({ name: item.catalogName, reason: uploadError.message });
    continue;
  }

  const { data: publicData } = supabase.storage.from(BUCKET).getPublicUrl(objectPath);
  const publicUrl = publicData?.publicUrl;
  if (!publicUrl) {
    console.log('FAIL no public URL');
    failed.push({ name: item.catalogName, reason: 'no public url' });
    continue;
  }

  const { error: updateError } = await supabase
    .from('productos')
    .update({ imagen_url: publicUrl, imagen_source_type: 'manual' })
    .eq('id', item.productId)
    .eq('comercio_id', comercio.id);
  if (updateError) {
    console.log(`FAIL db: ${updateError.message}`);
    failed.push({ name: item.catalogName, reason: updateError.message });
    continue;
  }

  updated += 1;
  console.log(`OK (${(bytes.length / 1024).toFixed(1)} KB)`);
}

console.log(`\nDone. Updated ${updated}/${planned.length} products.`);
if (failed.length) {
  console.log('Failed:');
  for (const f of failed) console.log(`  ${f.name}: ${f.reason}`);
  process.exit(1);
}
