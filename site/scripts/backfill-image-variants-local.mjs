/**
 * Local backfill: download originals from Supabase Storage, encode WebP/AVIF with sharp,
 * upload to `.variants/` — does not use Supabase Image Transformations.
 *
 * Usage (from site/):
 *   node --env-file=.env.local scripts/backfill-image-variants-local.mjs
 * or with pulled env:
 *   node --env-file=.env.vercel.pull scripts/backfill-image-variants-local.mjs
 */

import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';

const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '').trim();
const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
if (!url || !serviceKey) {
  console.error('Need NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const WIDTHS = { thumb: 160, card: 360, hero: 640 };
const KINDS = /** @type {const} */ (['thumb', 'card', 'hero']);
const pageSize = Number(process.env.BACKFILL_PAGE_SIZE || 30);
const maxPages = Number(process.env.BACKFILL_MAX_PAGES || 200);

function parsePublicUrl(imageUrl) {
  try {
    const u = new URL(imageUrl);
    const marker = '/storage/v1/object/public/';
    const idx = u.pathname.indexOf(marker);
    if (idx < 0) return null;
    const after = u.pathname.slice(idx + marker.length);
    const slash = after.indexOf('/');
    if (slash <= 0) return null;
    const bucket = after.slice(0, slash);
    if (bucket !== 'product-images' && bucket !== 'logos-comercios') return null;
    const objectPath = decodeURIComponent(after.slice(slash + 1));
    if (!objectPath || objectPath.includes('..') || objectPath.includes('/.variants/')) return null;
    const lastSlash = objectPath.lastIndexOf('/');
    const directory = lastSlash >= 0 ? objectPath.slice(0, lastSlash) : '';
    const fileName = lastSlash >= 0 ? objectPath.slice(lastSlash + 1) : objectPath;
    const dot = fileName.lastIndexOf('.');
    const baseName = dot > 0 ? fileName.slice(0, dot) : fileName;
    return { bucket, objectPath, directory, baseName };
  } catch {
    return null;
  }
}

function variantPath(parsed, kind, format) {
  const folder = parsed.directory
    ? `${parsed.directory}/.variants/${parsed.baseName}`
    : `.variants/${parsed.baseName}`;
  return `${folder}/${kind}.${format}`;
}

async function ensureOne(imageUrl) {
  const parsed = parsePublicUrl(imageUrl);
  if (!parsed) return { ok: false, reason: 'unsupported' };
  const { data, error } = await supabase.storage.from(parsed.bucket).download(parsed.objectPath);
  if (error || !data) return { ok: false, reason: 'missing' };
  const source = Buffer.from(await data.arrayBuffer());
  let generated = 0;
  for (const kind of KINDS) {
    for (const format of /** @type {const} */ (['webp', 'avif'])) {
      const objectPath = variantPath(parsed, kind, format);
      const pipeline = sharp(source, { failOn: 'none' })
        .rotate()
        .resize({
          width: WIDTHS[kind],
          height: WIDTHS[kind],
          fit: 'inside',
          withoutEnlargement: true,
        });
      const bytes =
        format === 'avif'
          ? await pipeline.avif({ quality: 58, effort: 4 }).toBuffer()
          : await pipeline.webp({ quality: 72, effort: 4 }).toBuffer();
      const { error: upErr } = await supabase.storage.from(parsed.bucket).upload(objectPath, bytes, {
        upsert: true,
        contentType: format === 'avif' ? 'image/avif' : 'image/webp',
        cacheControl: '31536000',
      });
      if (upErr) {
        // Bucket may not allow image/avif — WebP is enough for cold serving.
        if (format === 'avif') continue;
        return { ok: false, reason: upErr.message };
      }
      generated += 1;
    }
  }
  return { ok: true, generated };
}

async function collectUrls(offset, limit) {
  const [{ data: products }, { data: categories }] = await Promise.all([
    supabase
      .from('productos')
      .select('imagen_url')
      .not('imagen_url', 'is', null)
      .order('id', { ascending: true })
      .range(offset, offset + limit - 1),
    supabase
      .from('categorias')
      .select('imagen_url')
      .not('imagen_url', 'is', null)
      .order('id', { ascending: true })
      .range(offset, offset + Math.min(40, limit) - 1),
  ]);
  const urls = new Set();
  for (const row of [...(products ?? []), ...(categories ?? [])]) {
    const u = (row.imagen_url || '').trim();
    if (u && parsePublicUrl(u)) urls.add(u);
  }
  return [...urls];
}

let offset = 0;
let total = 0;
for (let page = 0; page < maxPages; page += 1) {
  const urls = await collectUrls(offset, pageSize);
  if (urls.length === 0) break;
  let pageGen = 0;
  for (const imageUrl of urls) {
    const result = await ensureOne(imageUrl);
    if (result.ok) pageGen += result.generated;
    else console.warn('skip', result.reason, imageUrl.slice(0, 80));
  }
  total += pageGen;
  console.log(`offset=${offset} urls=${urls.length} files=${pageGen}`);
  if (urls.length < pageSize) break;
  offset += pageSize;
}
console.log(`Done. variantFiles≈${total}`);
