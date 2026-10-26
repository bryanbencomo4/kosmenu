/** Cold WebP/AVIF variants + hot Supabase render fallback for public Storage images. */

export const PRODUCT_IMAGES_BUCKET = 'product-images';
export const LOGOS_BUCKET = 'logos-comercios';
export const VARIANT_KINDS = ['thumb', 'card', 'hero'] as const;
export type ImageVariantKind = (typeof VARIANT_KINDS)[number];

export const VARIANT_WIDTHS: Record<ImageVariantKind, number> = {
  thumb: 160,
  card: 360,
  hero: 640,
};

const PUBLIC_MARKER = '/storage/v1/object/public/';
const RENDER_MARKER = '/storage/v1/render/image/public/';

export type ParsedPublicStorageUrl = {
  origin: string;
  bucket: string;
  objectPath: string;
  directory: string;
  baseName: string;
  search: string;
};

export function kindForWidth(width: number): ImageVariantKind {
  const w = Number.isFinite(width) ? width : VARIANT_WIDTHS.card;
  if (w <= 200) return 'thumb';
  if (w <= 480) return 'card';
  return 'hero';
}

export function parsePublicStorageUrl(
  imageUrl: string | null | undefined,
): ParsedPublicStorageUrl | null {
  const raw = (imageUrl ?? '').trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    let pathname = url.pathname;
    if (pathname.includes(RENDER_MARKER)) {
      pathname = pathname.replace(RENDER_MARKER, PUBLIC_MARKER);
    }
    const markerIndex = pathname.indexOf(PUBLIC_MARKER);
    if (markerIndex < 0) return null;
    const after = pathname.slice(markerIndex + PUBLIC_MARKER.length);
    const slash = after.indexOf('/');
    if (slash <= 0) return null;
    const bucket = after.slice(0, slash);
    const objectPath = decodeURIComponent(after.slice(slash + 1));
    if (!objectPath || objectPath.includes('..')) return null;
    // Already a generated variant — treat as non-source.
    if (objectPath.includes('/.variants/')) return null;
    const lastSlash = objectPath.lastIndexOf('/');
    const directory = lastSlash >= 0 ? objectPath.slice(0, lastSlash) : '';
    const fileName = lastSlash >= 0 ? objectPath.slice(lastSlash + 1) : objectPath;
    const dot = fileName.lastIndexOf('.');
    const baseName = dot > 0 ? fileName.slice(0, dot) : fileName;
    if (!baseName) return null;
    return {
      origin: url.origin,
      bucket,
      objectPath,
      directory,
      baseName,
      search: url.search,
    };
  } catch {
    return null;
  }
}

export function coldVariantObjectPath(
  parsed: ParsedPublicStorageUrl,
  kind: ImageVariantKind,
  format: 'webp' | 'avif',
): string {
  const folder = parsed.directory
    ? `${parsed.directory}/.variants/${parsed.baseName}`
    : `.variants/${parsed.baseName}`;
  return `${folder}/${kind}.${format}`;
}

export function coldVariantUrl(
  imageUrl: string | null | undefined,
  kind: ImageVariantKind,
  format: 'webp' | 'avif' = 'webp',
): string | null {
  const parsed = parsePublicStorageUrl(imageUrl);
  if (!parsed) return null;
  if (parsed.bucket !== PRODUCT_IMAGES_BUCKET && parsed.bucket !== LOGOS_BUCKET) {
    return null;
  }
  const objectPath = coldVariantObjectPath(parsed, kind, format);
  return `${parsed.origin}${PUBLIC_MARKER}${parsed.bucket}/${objectPath}`;
}

/** On-the-fly Supabase Image Transformation (hot). Prefer cold variants in the menu. */
export function optimizeStorageImageUrl(
  imageUrl: string | null | undefined,
  width: number,
  quality = 72,
): string | null {
  const raw = (imageUrl ?? '').trim();
  if (!raw) return null;

  try {
    const url = new URL(raw);
    if (url.pathname.includes(RENDER_MARKER)) {
      url.searchParams.set('width', String(Math.max(1, Math.round(width))));
      // Without resize=contain, Supabase keeps source height and crops width.
      url.searchParams.set('resize', 'contain');
      url.searchParams.set('quality', String(Math.min(90, Math.max(40, quality))));
      url.searchParams.set('format', 'webp');
      return url.toString();
    }

    if (!url.pathname.includes(PUBLIC_MARKER)) return raw;

    url.pathname = url.pathname.replace(PUBLIC_MARKER, RENDER_MARKER);
    url.searchParams.set('width', String(Math.max(1, Math.round(width))));
    url.searchParams.set('resize', 'contain');
    url.searchParams.set('quality', String(Math.min(90, Math.max(40, quality))));
    url.searchParams.set('format', 'webp');
    return url.toString();
  } catch {
    return raw;
  }
}

export type MenuImageSources = {
  original: string;
  kind: ImageVariantKind;
  /** Cold WebP (preferred src). Null when URL is external / not Storage. */
  coldWebp: string | null;
  coldAvif: string | null;
  /** Hot transform fallback (same perceived performance as today). */
  hot: string;
  /** Tiny cold thumb for blur placeholder when available. */
  previewCold: string | null;
  previewHot: string;
};

/** Cold-first sources for a display width. Client falls back hot → original on error. */
export function resolveMenuImageSources(
  imageUrl: string | null | undefined,
  width: number,
  quality = 72,
): MenuImageSources | null {
  const original = (imageUrl ?? '').trim();
  if (!original) return null;
  const kind = kindForWidth(width);
  const hotWidth = VARIANT_WIDTHS[kind];
  const hot = optimizeStorageImageUrl(original, hotWidth, quality) ?? original;
  const coldWebp = coldVariantUrl(original, kind, 'webp');
  const coldAvif = coldVariantUrl(original, kind, 'avif');
  return {
    original,
    kind,
    coldWebp,
    coldAvif,
    hot,
    previewCold: coldVariantUrl(original, 'thumb', 'webp'),
    previewHot: optimizeStorageImageUrl(original, VARIANT_WIDTHS.thumb, quality) ?? original,
  };
}

/**
 * Preferred URL for SSR/markup: cold WebP when the URL is transformable Storage,
 * else hot/original. KioskImage must still cascade on error until backfill finishes.
 */
export function resolveMenuImageUrl(
  imageUrl: string | null | undefined,
  width: number,
  quality = 72,
): string | null {
  const sources = resolveMenuImageSources(imageUrl, width, quality);
  if (!sources) return null;
  return sources.coldWebp ?? sources.hot;
}
