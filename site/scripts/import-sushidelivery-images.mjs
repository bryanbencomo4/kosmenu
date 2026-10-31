/**
 * Match downloaded official images to Sushi Delivery products and upload.
 *
 * Images must already be in scripts/_sushi_imgs/ (scraped from sushidelivery.com.ve).
 *
 * Usage (from site/):
 *   node --env-file=.env.local scripts/import-sushidelivery-images.mjs --dry-run
 *   node --env-file=.env.local scripts/import-sushidelivery-images.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { createRequire } from 'node:module';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, resolve, extname } from 'node:path';

const require = createRequire(import.meta.url);
const sharp = require('sharp');

const dryRun = process.argv.includes('--dry-run');
const SLUG = 'sushidelivery';
const BUCKET = 'product-images';
const IMG_DIR = resolve('scripts/_sushi_imgs');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL.trim(),
  process.env.SUPABASE_SERVICE_ROLE_KEY.trim(),
  { auth: { persistSession: false } },
);

function norm(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' y ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Soften noise but keep distinctive words like roll/sashimi/temaki */
function coreKey(s) {
  return norm(s)
    .replace(/\b\d+\s*(piezas?|unidades?|uds?|oz)\b/g, ' ')
    .replace(/\bensalada de\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokens(s) {
  return coreKey(s)
    .split(' ')
    .filter((t) => t.length > 1 && !['de', 'del', 'la', 'el', 'y', 'con'].includes(t));
}

function extractNums(s) {
  return [...String(s).matchAll(/\d+/g)].map((m) => m[0]);
}

function scoreMatch(productName, imageAltOrFile) {
  const a = coreKey(productName);
  const b = coreKey(imageAltOrFile);
  if (!a || !b) return 0;
  if (a === b) return 100;
  if (a.includes(b) || b.includes(a)) return 92;

  const numsA = extractNums(productName);
  const numsB = extractNums(imageAltOrFile);
  // If both have a distinctive combo/piece number, require overlap
  if (numsA.length && numsB.length) {
    const overlap = numsA.some((n) => numsB.includes(n));
    if (!overlap && (norm(productName).includes('combo') || norm(productName).includes('combinado'))) {
      return 0;
    }
  }

  const ta = new Set(tokens(productName));
  const tb = new Set(tokens(imageAltOrFile));
  if (!ta.size || !tb.size) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter += 1;
  if (inter === 0) return 0;
  const union = new Set([...ta, ...tb]).size;
  const jaccard = inter / union;
  const cover = inter / ta.size;
  let score = Math.round(jaccard * 50 + cover * 50);
  if (numsA.length && numsB.length && numsA.some((n) => numsB.includes(n))) score += 8;
  return score;
}

function contentTypeForExt(ext) {
  const e = ext.replace('.', '').toLowerCase();
  if (e === 'png') return 'image/png';
  if (e === 'webp') return 'image/webp';
  if (e === 'gif') return 'image/gif';
  return 'image/jpeg';
}

/** Manual aliases: product DB name → image filename stem */
/** product nombre → image stem (without extension) */
const ALIASES = {
  'LANGOSTINOS (6 piezas)': 'langostinos-tempura-6-piezas',
  'LUJO (19 piezas)': 'lujo-tempura-19-piezas',
  'MIXTO (19 piezas)': 'mixto-tempura-19-piezas',
  'VEGETALES (16 piezas)': 'vegetales-tempura-16-piezas',
  'GYOZA (4 piezas)': 'gyozas-4-unidades',
  GYOZA: 'gyozas-4-unidades',
  'KANI CRUNCH (8 piezas)': 'kani-crunch',
  'SAKE FRIED (4 piezas)': 'sake-fried',
  'SUSHI PIZZA ATÚN': 'sushi-pizza-atun',
  'SUSHI PIZZA DE SALMÓN AHUMADO': 'sushi-pizza-de-salmon-ahumado',
  'SUSHI PIZZA SALMÓN': 'sushi-pizza-salmon',
  NEPTUNO: 'ensalada-neptuno',
  'NEPTUNO ESPECIAL': 'ensalada-neptuno-especial',
  'AVOCADO Aguacate': 'hosomaki-avocado-6-piezas',
  'KANIMAKI Cangrejo': 'hosomaki-kanimaki-6-piezas',
  'SALMÓN Fresco': 'hosomaki-salmon-6-piezas',
  'SPICY TUNA Atún picante': 'hosomaki-spicy-tuna-6-piezas',
  'TEKKAMAKI Atún': 'hosomaki-tekkamaki-6-piezas',
  'TUNA – TATAKI': 'sashimi-tuna-tataki-7-piezas',
  'KANI Cangrejo': 'niguiri-kani-1-pieza',
  'MAGURO Atún': 'niguiri-maguro-1-pieza',
  'MASAGO Huevos de cangrejo': 'niguiri-masago-1-pieza',
  'SAKE Salmón': 'niguiri-sake-1-pieza',
  'TILAPIA Tilapia': 'niguiri-tilapia-1-pieza',
  'AGUA 600 ML': 'agua-600-ml',
  'AGUA SPARKLING': 'minalba-sparkling',
  LIPTON: 'lipton-de-durazno',
  'REFRESCOS Lata': 'coca-cola',
  'REFRESCO DE 2 LTS': 'pepsi-2l',
  'REFRESCO DE 1LTS': 'pepsi-1l',
  'ROLL DE ATÚN TRUFADO': 'atun-trufado-roll-10-piezas',
  'ROCK&ROLL': 'rock-roll-10-piezas',
  'DRAGÓN ROLL': 'dragon-roll-10-piezas',
  'PLÁTANO TEMPURA': 'platano-tempura-roll-10-piezas',
  'SEX ON THE BEACH': 'sex-on-the-beach-roll-10-pie',
  'SUGERENCIAS DEL CHEF': 'sugerencias-del-chef-10-piezas',
  'EBI DRAGON': 'ebi-dragon-roll-10-piezas',
  'SASHIMI ROLL': 'sashimi-roll-10-piezas',
  'DINAMITA TEMPURA': 'dinamita-tempura-roll-10-piezas',
  'SPICY TUNA POKE': 'spicy-tuna-poke',
  // No dedicated photo on site; reuse spicy tuna poke
  'SPICY SALMON POKE': 'spicy-tuna-poke',
  'SUSHI COMBO 1 (16 piezas)': 'sushi-combo-1-16-piezas',
  'SUSHI COMBO 2 (15 piezas)': 'sushi-combo-2-15-piezas',
  'SUSHI COMBO 3 (10 piezas)': 'sushi-combo-3-10-piezas',
  'UNAGI BOOM': 'unagi-boom',
  'GRADO 33': 'grado-33-roll-10-piezas',
  'GRADO 33 ESPECIAL': 'grado-33-especial-roll-10-piezas',
  'DINAMITA ESPECIAL': 'dinamita-especial-roll-10-piezas',
};

/** Ambiguous short names: match by category → stem */
const CATEGORY_ALIASES = {
  'Ensaladas::WAKAME': 'ensalada-de-wakame',
  'Temakis::ATÚN': 'temaki-atun-1-pieza',
  'Temakis::DINAMITA': 'temaki-dinamita-1-pieza',
  'Temakis::EBI CRUNCH': 'temaki-ebi-crunch-1-pieza',
  'Temakis::SALMÓN': 'temaki-salmon-1-pieza',
  'Temakis::SPICY TUNA': 'temaki-spicy-tuna-1-pieza',
  'Sashimi::ATÚN': 'sashimi-de-atun-7-piezas',
  'Sashimi::SALMÓN': 'sashimi-de-salmon-7-piezas',
  'Sashimi::MIXTO Salmón y atún': 'sashimi-mixto-7-piezas',
  'Rolls::ALASKA': 'alaska-roll-10-piezas',
  'Rolls::CALIFORNIA': 'california-roll-10-piezas',
  'Rolls::DINAMITA': 'dinamita-roll-10-piezas',
  'Rolls::MAGURO ROLL': 'maguro-roll-10-piezas',
  'Rolls especiales::SPICY TUNA': 'spicy-tuna-roll-10-piezas',
};

async function main() {
  if (!existsSync(IMG_DIR)) throw new Error(`Missing ${IMG_DIR}`);
  const files = readdirSync(IMG_DIR).filter((f) =>
    /\.(jpe?g|png|webp|gif)$/i.test(f),
  );
  console.log(`Local images: ${files.length}`);

  const { data: comercio, error: cErr } = await supabase
    .from('comercios')
    .select('id,nombre')
    .eq('slug', SLUG)
    .single();
  if (cErr) throw cErr;

  const { data: products, error: pErr } = await supabase
    .from('productos')
    .select('id,nombre,categoria_id,imagen_url,categorias(nombre)')
    .eq('comercio_id', comercio.id);
  if (pErr) throw pErr;
  console.log(`Products: ${products.length}`);

  const fileIndex = files.map((file) => ({
    file,
    stem: file.replace(/\.[^.]+$/, ''),
    path: join(IMG_DIR, file),
  }));

  const usedFiles = new Set();
  const matches = [];
  const unmatched = [];

  // Prefer specific categories first so short names (ATÚN, SALMÓN) claim the right image.
  const categoryPriority = (cat) => {
    const c = norm(cat);
    if (c.includes('temaki')) return 1;
    if (c.includes('hosomaki') || c.includes('niguiri') || c.includes('sashimi')) return 2;
    if (c.includes('ensalada')) return 3;
    if (c.includes('poke')) return 4;
    if (c.includes('especial')) return 5;
    if (c.includes('tempurizado')) return 6;
    if (c === 'rolls' || c.includes('combo') || c.includes('tempura') || c.includes('entrada')) return 7;
    if (c.includes('extra') || c.includes('bebida') || c.includes('postre')) return 20;
    return 10;
  };
  const ordered = [...products].sort(
    (a, b) =>
      categoryPriority(a.categorias?.nombre) - categoryPriority(b.categorias?.nombre) ||
      a.nombre.length - b.nombre.length,
  );

  for (const product of ordered) {
    const cat = product.categorias?.nombre || '';
    const catAlias = CATEGORY_ALIASES[`${cat}::${product.nombre}`];
    const alias = catAlias || ALIASES[product.nombre];
    let best = null;
    let bestScore = 0;

    if (alias) {
      const hit = fileIndex.find((f) => f.stem === alias || f.file.startsWith(alias + '.'));
      // Allow intentional reuse for near-identical products (e.g. poke variants).
      if (hit && (!usedFiles.has(hit.file) || alias === 'spicy-tuna-poke')) {
        best = hit;
        bestScore = 100;
      }
    }

    if (!best) {
      for (const f of fileIndex) {
        if (usedFiles.has(f.file)) continue;
        if (/^menu-\d+/.test(f.stem)) continue;
        let s = scoreMatch(product.nombre, f.stem);
        const catN = norm(cat);
        if (catN.includes('tempura') && !catN.includes('tempurizado') && f.stem.includes('tempura') && !f.stem.includes('tempurizado') && !f.stem.includes('roll'))
          s += 10;
        if (catN.includes('temaki') && f.stem.includes('temaki')) s += 15;
        if (catN.includes('hosomaki') && f.stem.includes('hosomaki')) s += 15;
        if (catN.includes('niguiri') && f.stem.includes('niguiri')) s += 15;
        if (catN === 'sashimi' && f.stem.startsWith('sashimi-') && !f.stem.includes('sashimi-roll'))
          s += 15;
        if (catN.includes('ensalada') && f.stem.includes('ensalada')) s += 12;
        if (catN.includes('poke') && f.stem.includes('poke')) s += 15;
        if (catN.includes('combo') && f.stem.includes('combo')) s += 10;
        if (catN.includes('especial') && f.stem.includes('roll') && !f.stem.includes('tempura'))
          s += 4;
        if (s > bestScore) {
          bestScore = s;
          best = f;
        }
      }
    }

    if (best && bestScore >= 72) {
      usedFiles.add(best.file);
      matches.push({ product, file: best, score: bestScore });
    } else {
      unmatched.push({ nombre: product.nombre, cat, best: best?.stem, score: bestScore });
    }
  }

  console.log(`Matched: ${matches.length} | Unmatched: ${unmatched.length}`);
  if (dryRun) {
    for (const m of matches.slice(0, 20)) {
      console.log(`✓ [${m.score}] ${m.product.nombre} ← ${m.file.file}`);
    }
    console.log('--- unmatched ---');
    for (const u of unmatched) {
      console.log(`✗ ${u.nombre} (${u.cat}) best=${u.best || '-'} @${u.score}`);
    }
    return;
  }

  let ok = 0;
  let skipped = 0;
  const failed = [];
  const force = process.argv.includes('--force');
  for (const m of matches) {
    if (!force && m.product.imagen_url) {
      skipped += 1;
      continue;
    }
    process.stdout.write(`${m.product.nombre.slice(0, 40)}... `);
    let bytes;
    let ext = 'webp';
    try {
      bytes = await sharp(m.file.path)
        .rotate()
        .resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 82 })
        .toBuffer();
    } catch {
      const rawExt = extname(m.file.file).replace('.', '').toLowerCase() || 'jpg';
      bytes = readFileSync(m.file.path);
      ext = rawExt;
    }
    const objectPath = `${comercio.id}/sd_${m.product.id}.${ext}`;
    const { error: upErr } = await supabase.storage.from(BUCKET).upload(objectPath, bytes, {
      contentType: contentTypeForExt(ext),
      upsert: true,
    });
    if (upErr) {
      console.log(`FAIL ${upErr.message}`);
      failed.push(m.product.nombre);
      continue;
    }
    const publicUrl = supabase.storage.from(BUCKET).getPublicUrl(objectPath).data.publicUrl;
    const { error: updErr } = await supabase
      .from('productos')
      .update({ imagen_url: publicUrl, imagen_source_type: 'manual' })
      .eq('id', m.product.id)
      .eq('comercio_id', comercio.id);
    if (updErr) {
      console.log(`FAIL ${updErr.message}`);
      failed.push(m.product.nombre);
      continue;
    }
    ok += 1;
    console.log(`OK (${Math.round(bytes.length / 1024)}KB)`);
  }

  const { count: withImg } = await supabase
    .from('productos')
    .select('id', { count: 'exact', head: true })
    .eq('comercio_id', comercio.id)
    .not('imagen_url', 'is', null);

  console.log('\n=== DONE ===');
  console.log(
    `Uploaded: ${ok} | skipped existing: ${skipped} | failed: ${failed.length} | with images now: ${withImg}`,
  );
  if (unmatched.length) {
    console.log('Still without match:');
    for (const u of unmatched) console.log(`  - ${u.nombre}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
