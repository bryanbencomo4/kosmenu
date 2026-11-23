/**
 * Apply Alegría product photos from Catalogo_Visual_Alegria_Productos.xlsx.
 *
 * Extracts embedded gallery JPEGs, maps them to ALG-### / product names via the
 * sheet layout + drawing anchors, then uploads to product-images and updates
 * productos.imagen_url. Never deletes products. Skips ALG rows without photos.
 *
 * Usage (from site/):
 *   node scripts/apply-alegria-catalog-images.mjs --xlsx "C:/Users/bryan/Downloads/Catalogo_Visual_Alegria_Productos.xlsx" --dry-run
 *   node scripts/apply-alegria-catalog-images.mjs --xlsx "C:/Users/bryan/Downloads/Catalogo_Visual_Alegria_Productos.xlsx"
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';
import XLSX from 'xlsx';

const BUCKET = 'product-images';
const require = createRequire(import.meta.url);

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
  let xlsxPath = '';
  let dryRun = false;
  let slugHint = '';
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry-run') dryRun = true;
    else if (arg === '--xlsx') xlsxPath = argv[++i] ?? '';
    else if (arg === '--slug') slugHint = argv[++i] ?? '';
  }
  return { xlsxPath, dryRun, slugHint };
}

function unzipXlsx(xlsxPath, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  const zipPath = path.join(destDir, 'catalog.zip');
  fs.copyFileSync(xlsxPath, zipPath);
  // Prefer PowerShell Expand-Archive on Windows.
  const ps = spawnSync(
    'powershell',
    [
      '-NoProfile',
      '-Command',
      `Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${path.join(destDir, 'out').replace(/'/g, "''")}' -Force`,
    ],
    { encoding: 'utf8' },
  );
  if (ps.status !== 0) {
    throw new Error(`Failed to unzip xlsx: ${ps.stderr || ps.stdout}`);
  }
  return path.join(destDir, 'out');
}

function parseDrawingMap(outRoot) {
  const drawingXml = fs.readFileSync(
    path.join(outRoot, 'xl/drawings/drawing1.xml'),
    'utf8',
  );
  const relsXml = fs.readFileSync(
    path.join(outRoot, 'xl/drawings/_rels/drawing1.xml.rels'),
    'utf8',
  );

  const relById = new Map();
  for (const match of relsXml.matchAll(
    /Id="([^"]+)"[^>]*Target="([^"]+)"|Target="([^"]+)"[^>]*Id="([^"]+)"/g,
  )) {
    const id = match[1] || match[4];
    const target = match[2] || match[3];
    if (id && target) relById.set(id, target.replace(/^\//, ''));
  }
  // Fallback simpler parse
  if (relById.size === 0) {
    for (const match of relsXml.matchAll(
      /<Relationship[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"[^>]*\/>/g,
    )) {
      relById.set(match[1], match[2].replace(/^\//, ''));
    }
  }

  const anchors = [];
  const parts = drawingXml.split('<xdr:oneCellAnchor>');
  for (const part of parts.slice(1)) {
    const col = Number(part.match(/<xdr:col>(\d+)<\/xdr:col>/)?.[1]);
    const row = Number(part.match(/<xdr:row>(\d+)<\/xdr:row>/)?.[1]);
    const embed = part.match(/r:embed="([^"]+)"/)?.[1];
    if (!Number.isFinite(col) || !Number.isFinite(row) || !embed) continue;
    const target = relById.get(embed);
    if (!target) continue;
    anchors.push({ col, row, mediaRel: target });
  }
  return anchors;
}

function parseIndex(xlsxPath) {
  const wb = XLSX.readFile(xlsxPath);
  const ws = wb.Sheets['Índice para IA'] || wb.Sheets['Indice para IA'];
  if (!ws) throw new Error('Missing sheet "Índice para IA"');
  const grid = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  const headerIdx = grid.findIndex(
    (row) =>
      Array.isArray(row) &&
      row.some((cell) => fold(cell) === 'codigo') &&
      row.some((cell) => fold(cell).includes('nombre')),
  );
  if (headerIdx < 0) throw new Error('Could not find header row in Índice para IA');
  const header = grid[headerIdx].map((cell) => fold(cell));
  const col = (names) => header.findIndex((h) => names.some((n) => h.includes(n)));
  const codeCol = col(['codigo']);
  const catCol = col(['categoria']);
  const nameCol = col(['nombre exacto', 'nombre']);
  const photoCol = col(['hay foto']);
  const fileCol = col(['archivo']);
  const rows = [];
  for (const row of grid.slice(headerIdx + 1)) {
    const code = String(row[codeCol] ?? '').trim();
    if (!code.startsWith('ALG-')) continue;
    const hasRaw = String(row[photoCol] ?? '').trim().toLowerCase();
    rows.push({
      code,
      category: String(row[catCol] ?? '').trim(),
      name: String(row[nameCol] ?? '').trim(),
      hasPhoto: hasRaw === 'sí' || hasRaw === 'si' || hasRaw === 'yes',
      fileName: String(row[fileCol] ?? '').trim(),
    });
  }
  return rows;
}

function parseGalleryNameGrid(xlsxPath) {
  const wb = XLSX.readFile(xlsxPath);
  const ws = wb.Sheets['Galería visual'] || wb.Sheets['Galeria visual'];
  if (!ws) throw new Error('Missing sheet "Galería visual"');
  const grid = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  // Map: "ALG-001" -> { name, row, col }
  const byCode = new Map();
  for (let r = 0; r < grid.length; r += 1) {
    const row = grid[r] || [];
    for (let c = 0; c < row.length; c += 1) {
      const cell = String(row[c] ?? '');
      const codeMatch = cell.match(/\b(ALG-\d{3})\b/);
      if (!codeMatch) continue;
      const code = codeMatch[1];
      // Product name is typically the cell directly above.
      const nameAbove = String(grid[r - 1]?.[c] ?? '').trim();
      byCode.set(code, { name: nameAbove, row: r - 1, col: c, codeRow: r });
    }
  }
  return byCode;
}

function buildCatalogEntries(xlsxPath, outRoot) {
  const index = parseIndex(xlsxPath);
  const gallery = parseGalleryNameGrid(xlsxPath);
  const anchors = parseDrawingMap(outRoot);

  // Map (row,col) of image anchor -> media file.
  // Images sit on the name row in the gallery layout.
  const mediaByCoord = new Map();
  for (const anchor of anchors) {
    mediaByCoord.set(`${anchor.row}:${anchor.col}`, anchor.mediaRel);
  }

  const entries = [];
  for (const item of index) {
    if (!item.hasPhoto) {
      entries.push({ ...item, mediaPath: null, skipReason: 'no_photo' });
      continue;
    }
    const gal = gallery.get(item.code);
    if (!gal) {
      entries.push({ ...item, mediaPath: null, skipReason: 'missing_gallery_cell' });
      continue;
    }
    // Gallery layout: [image row] → [name row] → [ALG code row]
    const mediaRel =
      mediaByCoord.get(`${gal.row - 1}:${gal.col}`) ||
      mediaByCoord.get(`${gal.row}:${gal.col}`) ||
      mediaByCoord.get(`${gal.codeRow - 2}:${gal.col}`);
    if (!mediaRel) {
      entries.push({
        ...item,
        mediaPath: null,
        skipReason: `missing_drawing@${gal.row - 1}:${gal.col}`,
      });
      continue;
    }
    const abs = path.join(outRoot, mediaRel.replace(/^xl\//, 'xl/'));
    // Targets are like /xl/media/image.jpg → xl/media/image.jpg
    const normalized = path.join(outRoot, mediaRel.replace(/^\//, ''));
    const mediaPath = fs.existsSync(normalized) ? normalized : abs;
    if (!fs.existsSync(mediaPath)) {
      entries.push({ ...item, mediaPath: null, skipReason: `file_missing:${mediaRel}` });
      continue;
    }
    entries.push({
      ...item,
      mediaPath,
      galleryName: gal.name,
      skipReason: null,
    });
  }
  return entries;
}

const NAME_ALIASES = {
  'compota digestiva individual': '1 compota',
  'nuggets de lentejas empanizados con casabe': 'nuggets de lentejas con casabe',
  'falafels horneados con hummus': 'falafels horneados',
  'tostones horneados con guacamole': 'tostones horneados',
  'infusion de flor de jamaica con clavos y canela': 'infusion de flor de jamaica',
  'combo de 5 compotas digestivas': 'combo de 5 compotas',
  'arepitas de yuca con chia y linaza 6 und': 'arepitas de yuca chia y linaza 6 und',
  'arepitas de maiz pilado con chia y linaza 6 und':
    'arepitas de maiz pilado chia y linaza 6 und',
  'hamburguesas de lentejas y vegetales 4 und':
    'hamburguesas de lentejas y vegetales 4 und',
  'falafels de garbanzo y vegetales 9 und': 'falafels de garbanzo y vegetales 9 und',
  'nuggets de lentejas y vegetales 20 und': 'nuggets de lentejas y vegetales 20 und',
  'empanadas de mechada vegana 4 und': 'empanadas de mechada vegana 4 und',
  'empanadas de bolonesa de soya 4 und': 'empanadas de bolonesa de soya 4 und',
  'tostones horneados 20 und': 'tostones horneados 20 und',
};

function normalizeProductKey(value) {
  return fold(value)
    .replace(/[·•]/g, ' ')
    .replace(/\bund\b/g, 'unidades')
    .replace(/\bunidades\b/g, 'und')
    .replace(/\s+/g, ' ')
    .trim();
}

function significantTokens(value) {
  const stop = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'y', 'con', 'a', 'en', 'un', 'una']);
  return normalizeProductKey(value)
    .split(' ')
    .filter((token) => token.length > 1 && !stop.has(token));
}

function categoryCompatible(catalogCategory, productCategory) {
  const a = fold(catalogCategory);
  const b = fold(productCategory);
  if (!a || !b) return true;
  const aRoot = a.split(' ')[0];
  if (b.includes(aRoot) || a.includes(fold(b).split(' ')[0])) return true;
  const pairs = [
    ['almuerzo', 'almuerzo'],
    ['desayuno', 'desayuno'],
    ['ensalad', 'ensalad'],
    ['poke', 'poke'],
    ['especial', 'especial'],
    ['congelad', 'congelad'],
    ['crema', 'crema'],
    ['racion', 'racion'],
    ['bebida', 'bebida'],
    ['compota', 'compota'],
    ['hallaca', 'hallaca'],
    ['navidad', 'navidad'],
    ['detox', 'detox'],
    ['plan', 'plan'],
  ];
  return pairs.some(([left, right]) => a.includes(left) && b.includes(right));
}

function scoreNameMatch(catalogName, productName) {
  const alias = NAME_ALIASES[normalizeProductKey(catalogName)];
  const a = normalizeProductKey(alias || catalogName);
  const b = normalizeProductKey(productName);
  if (!a || !b) return 0;
  if (a === b) return 100;

  const stripPack = (s) =>
    s
      .replace(/\s+\d+\s*(und|unidades|g|kg|ml|l)\b/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  if (stripPack(a) === stripPack(b) && stripPack(a).length >= 4) return 97;

  const ta = significantTokens(alias || catalogName);
  const tb = significantTokens(productName);
  if (ta.length === 0 || tb.length === 0) return 0;

  const overlap = ta.filter((token) =>
    tb.some((other) => other === token || (token.length >= 5 && (other.startsWith(token) || token.startsWith(other)))),
  ).length;
  const union = new Set([...ta, ...tb]).size;
  const jaccard = overlap / union;

  // Require strong overlap; avoid "hamburguesa" ↔ "hamburguesas de lentejas…".
  if (overlap === ta.length && overlap === tb.length) return 96;
  if (overlap === Math.min(ta.length, tb.length) && jaccard >= 0.75 && Math.abs(ta.length - tb.length) <= 1) {
    return 93;
  }
  if (jaccard >= 0.85 && overlap >= 3) return 90;
  return 0;
}

function pickProduct(catalogName, category, products) {
  let best = null;
  let bestScore = 0;
  let ties = [];
  for (const product of products) {
    if (!categoryCompatible(category, product.categoria_nombre || '')) continue;
    const score = scoreNameMatch(catalogName, product.nombre);
    if (score <= 0) continue;
    if (score > bestScore) {
      best = product;
      bestScore = score;
      ties = [product];
    } else if (score === bestScore) {
      ties.push(product);
    }
  }
  if (!best || bestScore < 90) return { product: null, score: bestScore, ambiguous: false };
  if (ties.length > 1) return { product: null, score: bestScore, ambiguous: true, ties };
  return { product: best, score: bestScore, ambiguous: false };
}

function contentTypeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  return 'application/octet-stream';
}

const { xlsxPath, dryRun, slugHint } = parseArgs(process.argv.slice(2));
if (!xlsxPath) {
  console.error('Missing --xlsx path');
  process.exit(1);
}
if (!fs.existsSync(xlsxPath)) {
  console.error(`File not found: ${xlsxPath}`);
  process.exit(1);
}

const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'alegria-catalog-'));
const outRoot = unzipXlsx(xlsxPath, workDir);
const catalog = buildCatalogEntries(xlsxPath, outRoot);
const withPhotos = catalog.filter((item) => item.mediaPath);
const withoutPhotos = catalog.filter((item) => !item.mediaPath);

console.log(`Catalog rows: ${catalog.length}`);
console.log(`With extracted photos: ${withPhotos.length}`);
console.log(`Without photos / unmapped: ${withoutPhotos.length}`);
for (const item of withoutPhotos) {
  console.log(`  skip ${item.code} ${item.name} (${item.skipReason})`);
}

const env = loadEnv();
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

let comercio = null;
if (slugHint) {
  const { data, error } = await supabase
    .from('comercios')
    .select('id,slug,nombre')
    .eq('slug', slugHint)
    .maybeSingle();
  if (error) throw new Error(error.message);
  comercio = data;
} else {
  const { data, error } = await supabase
    .from('comercios')
    .select('id,slug,nombre')
    .or('nombre.ilike.%alegr%,slug.ilike.%alegr%')
    .order('updated_at', { ascending: false })
    .limit(10);
  if (error) throw new Error(error.message);
  const candidates = data ?? [];
  comercio =
    candidates.find((row) => fold(row.nombre).includes('alegria')) ||
    candidates.find((row) => fold(row.slug).includes('alegria')) ||
    candidates[0] ||
    null;
  if (candidates.length > 1) {
    console.log('Comercio candidates:');
    for (const row of candidates) {
      console.log(`  ${row.slug} | ${row.nombre} | ${row.id}`);
    }
  }
}

if (!comercio) {
  console.error('Alegría commerce not found. Pass --slug explicitly.');
  process.exit(1);
}

const { data: products, error: productsError } = await supabase
  .from('productos')
  .select('id,nombre,imagen_url,categoria_id')
  .eq('comercio_id', comercio.id);
if (productsError) throw new Error(productsError.message);

const { data: categorias } = await supabase
  .from('categorias')
  .select('id,nombre')
  .eq('comercio_id', comercio.id);
const catNameById = new Map((categorias ?? []).map((c) => [c.id, c.nombre]));
const productsEnriched = (products ?? []).map((p) => ({
  ...p,
  categoria_nombre: catNameById.get(p.categoria_id) || '',
}));

console.log(`\nComercio: ${comercio.nombre} (${comercio.slug}) ${comercio.id}`);
console.log(`Products in DB: ${productsEnriched.length}`);
console.log(dryRun ? 'Mode: DRY RUN' : 'Mode: APPLY');

const planned = [];
const unmatched = [];
const ambiguous = [];

for (const item of withPhotos) {
  const match = pickProduct(item.name, item.category, productsEnriched);
  if (match.ambiguous) {
    ambiguous.push({
      code: item.code,
      name: item.name,
      candidates: match.ties.map((p) => p.nombre),
    });
    continue;
  }
  if (!match.product) {
    unmatched.push({ code: item.code, name: item.name, score: match.score });
    continue;
  }
  planned.push({
    ...item,
    productId: match.product.id,
    productName: match.product.nombre,
    previousUrl: match.product.imagen_url,
    score: match.score,
  });
}

console.log('\nMatches:');
for (const item of planned) {
  console.log(
    `  ${item.code}  ${path.basename(item.mediaPath)}  →  ${item.productName}  (score ${item.score})`,
  );
}
if (unmatched.length) {
  console.log('\nUnmatched catalog photos (skipped):');
  for (const item of unmatched) {
    console.log(`  ${item.code} ${item.name} (best score ${item.score})`);
  }
}
if (ambiguous.length) {
  console.log('\nAmbiguous (skipped):');
  for (const item of ambiguous) {
    console.log(`  ${item.code} ${item.name} → ${item.candidates.join(' | ')}`);
  }
}

const byProduct = new Map();
for (const item of planned) {
  if (byProduct.has(item.productId)) {
    console.error(
      `\nConflict: product "${item.productName}" matched by both ${byProduct.get(item.productId)} and ${item.code}. Aborting.`,
    );
    process.exit(1);
  }
  byProduct.set(item.productId, item.code);
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
for (const item of planned) {
  const bytes = fs.readFileSync(item.mediaPath);
  const ext = path.extname(item.mediaPath).toLowerCase().replace('.', '') || 'jpg';
  const objectPath = `${comercio.id}/alegria_${item.code.toLowerCase()}_${item.productId}_${Date.now()}.${ext === 'jpeg' ? 'jpg' : ext}`;
  const contentType = contentTypeFor(item.mediaPath);

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(objectPath, bytes, { contentType, upsert: false });
  if (uploadError) {
    console.error(`Upload failed for ${item.code}: ${uploadError.message}`);
    continue;
  }

  const { data: publicData } = supabase.storage.from(BUCKET).getPublicUrl(objectPath);
  const publicUrl = publicData?.publicUrl;
  if (!publicUrl) {
    console.error(`No public URL for ${item.code}`);
    continue;
  }

  const { error: updateError } = await supabase
    .from('productos')
    .update({
      imagen_url: publicUrl,
      imagen_source_type: 'manual',
      ai_image_status: 'completed',
    })
    .eq('id', item.productId)
    .eq('comercio_id', comercio.id);
  if (updateError) {
    console.error(`DB update failed for ${item.productName}: ${updateError.message}`);
    continue;
  }

  updated += 1;
  console.log(`Updated: ${item.code} → ${item.productName}`);
}

console.log(`\nDone. Updated ${updated}/${planned.length} products.`);
console.log(`Left without photo (by design): ${withoutPhotos.filter((i) => i.skipReason === 'no_photo').length}`);
if (updated !== planned.length) process.exit(1);
