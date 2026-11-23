import 'server-only';

import sharp from 'sharp';

import {
  LOGOS_BUCKET,
  PRODUCT_IMAGES_BUCKET,
  VARIANT_KINDS,
  VARIANT_WIDTHS,
  coldVariantObjectPath,
  parsePublicStorageUrl,
  type ImageVariantKind,
  type ParsedPublicStorageUrl,
} from '../../_lib/optimize-storage-image';
import { getServiceSupabaseClient } from './supabase-server';

const MAX_SOURCE_BYTES = 12 * 1024 * 1024;
const ALLOWED_BUCKETS = new Set([PRODUCT_IMAGES_BUCKET, LOGOS_BUCKET]);

export type EnsureVariantsResult =
  | { ok: true; bucket: string; objectPath: string; generated: string[]; skipped: string[] }
  | { ok: false; error: string };

function isAllowedParsed(parsed: ParsedPublicStorageUrl): boolean {
  return ALLOWED_BUCKETS.has(parsed.bucket) && !parsed.objectPath.includes('/.variants/');
}

async function downloadSource(
  parsed: ParsedPublicStorageUrl,
): Promise<{ ok: true; bytes: Buffer } | { ok: false; error: string }> {
  const supabase = getServiceSupabaseClient();
  const { data, error } = await supabase.storage.from(parsed.bucket).download(parsed.objectPath);
  if (error || !data) {
    return { ok: false, error: 'Source image not found.' };
  }
  const buffer = Buffer.from(await data.arrayBuffer());
  if (buffer.byteLength <= 0) {
    return { ok: false, error: 'Source image is empty.' };
  }
  if (buffer.byteLength > MAX_SOURCE_BYTES) {
    return { ok: false, error: 'Source image too large.' };
  }
  return { ok: true, bytes: buffer };
}

async function variantExists(
  bucket: string,
  objectPath: string,
): Promise<boolean> {
  const supabase = getServiceSupabaseClient();
  const lastSlash = objectPath.lastIndexOf('/');
  const folder = lastSlash >= 0 ? objectPath.slice(0, lastSlash) : '';
  const name = lastSlash >= 0 ? objectPath.slice(lastSlash + 1) : objectPath;
  const { data, error } = await supabase.storage.from(bucket).list(folder, {
    search: name,
    limit: 20,
  });
  if (error || !data) return false;
  return data.some((entry) => entry.name === name && (entry.metadata?.size ?? 1) > 0);
}

async function uploadVariant(
  bucket: string,
  objectPath: string,
  bytes: Buffer,
  contentType: string,
): Promise<boolean> {
  const supabase = getServiceSupabaseClient();
  const { error } = await supabase.storage.from(bucket).upload(objectPath, bytes, {
    upsert: true,
    contentType,
    cacheControl: '31536000',
  });
  if (error) {
    console.error('[image-variants] upload failed', objectPath);
    return false;
  }
  return true;
}

/** Formats written to Storage. AVIF is omitted: product-images rejects image/avif (415). */
const VARIANT_FORMATS = ['webp'] as const;
type VariantFormat = (typeof VARIANT_FORMATS)[number];

async function encodeVariant(source: Buffer, kind: ImageVariantKind, format: VariantFormat): Promise<Buffer> {
  const width = VARIANT_WIDTHS[kind];
  const pipeline = sharp(source, { failOn: 'none' })
    .rotate()
    .resize({
      width,
      height: width,
      fit: 'inside',
      withoutEnlargement: true,
    });

  if (format === 'webp') {
    return pipeline.webp({ quality: 72, effort: 4 }).toBuffer();
  }
  // Exhaustiveness guard — only webp is enabled today.
  throw new Error(`Unsupported variant format: ${format}`);
}

/** Generate missing thumb/card/hero WebP next to a public Storage original. */
export async function ensureImageVariants(input: {
  imageUrl?: string | null;
  bucket?: string;
  objectPath?: string;
  force?: boolean;
}): Promise<EnsureVariantsResult> {
  let parsed = parsePublicStorageUrl(input.imageUrl ?? '');
  if (!parsed && input.bucket && input.objectPath) {
    const objectPath = input.objectPath.replace(/^\/+/, '').replace(/\\/g, '/');
    if (objectPath.includes('..') || objectPath.includes('/.variants/')) {
      return { ok: false, error: 'Invalid object path.' };
    }
    const lastSlash = objectPath.lastIndexOf('/');
    const directory = lastSlash >= 0 ? objectPath.slice(0, lastSlash) : '';
    const fileName = lastSlash >= 0 ? objectPath.slice(lastSlash + 1) : objectPath;
    const dot = fileName.lastIndexOf('.');
    const baseName = dot > 0 ? fileName.slice(0, dot) : fileName;
    parsed = {
      origin: '',
      bucket: input.bucket,
      objectPath,
      directory,
      baseName,
      search: '',
    };
  }

  if (!parsed || !isAllowedParsed(parsed)) {
    return { ok: false, error: 'Unsupported image URL.' };
  }

  const source = await downloadSource(parsed);
  if (source.ok === false) return source;

  const generated: string[] = [];
  const skipped: string[] = [];

  for (const kind of VARIANT_KINDS) {
    for (const format of VARIANT_FORMATS) {
      const objectPath = coldVariantObjectPath(parsed, kind, format);
      if (!input.force && (await variantExists(parsed.bucket, objectPath))) {
        skipped.push(objectPath);
        continue;
      }
      try {
        const encoded = await encodeVariant(source.bytes, kind, format);
        const uploaded = await uploadVariant(parsed.bucket, objectPath, encoded, 'image/webp');
        if (!uploaded) {
          return { ok: false, error: 'Failed to upload variant.' };
        }
        generated.push(objectPath);
      } catch (error) {
        console.error('[image-variants] encode failed', kind, format, error);
        return { ok: false, error: 'Failed to encode variant.' };
      }
    }
  }

  return {
    ok: true,
    bucket: parsed.bucket,
    objectPath: parsed.objectPath,
    generated,
    skipped,
  };
}

export function comercioIdFromObjectPath(objectPath: string): string | null {
  const first = objectPath.split('/')[0]?.trim() ?? '';
  return first || null;
}

export async function userCanManageComercio(userId: string, comercioId: string): Promise<boolean> {
  const supabase = getServiceSupabaseClient();
  const { data: owned } = await supabase
    .from('comercios')
    .select('id')
    .eq('id', comercioId)
    .eq('owner_id', userId)
    .maybeSingle();
  if (owned?.id) return true;

  const { data: staff } = await supabase
    .from('comercio_members')
    .select('comercio_id')
    .eq('comercio_id', comercioId)
    .eq('user_id', userId)
    .maybeSingle();
  return Boolean(staff?.comercio_id);
}

export function parseVariantsSecret(request: Request): boolean {
  const expected = (process.env.IMAGE_VARIANTS_SECRET ?? process.env.CRON_SECRET ?? '').trim();
  if (!expected) return false;
  const header = (request.headers.get('x-image-variants-secret') ?? '').trim();
  const bearer = (request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  return header === expected || bearer === expected;
}

export async function listStorageImageUrlsForBackfill(input: {
  limit: number;
  offset: number;
}): Promise<string[]> {
  const supabase = getServiceSupabaseClient();
  const limit = Math.min(100, Math.max(1, input.limit));
  const offset = Math.max(0, input.offset);

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

  const urls = new Set<string>();
  for (const row of [...(products ?? []), ...(categories ?? [])]) {
    const url = (row as { imagen_url?: string | null }).imagen_url?.trim() ?? '';
    if (!url) continue;
    const parsed = parsePublicStorageUrl(url);
    if (parsed && isAllowedParsed(parsed)) urls.add(url);
  }
  return [...urls];
}
