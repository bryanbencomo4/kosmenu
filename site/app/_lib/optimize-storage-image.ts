/** Rewrite public Supabase Storage URLs to on-the-fly WebP thumbs. */

export function optimizeStorageImageUrl(
  imageUrl: string | null | undefined,
  width: number,
  quality = 72,
): string | null {
  const raw = (imageUrl ?? '').trim();
  if (!raw) return null;

  try {
    const url = new URL(raw);
    const publicObjectPath = '/storage/v1/object/public/';
    const renderPath = '/storage/v1/render/image/public/';

    if (url.pathname.includes(renderPath)) {
      url.searchParams.set('width', String(Math.max(1, Math.round(width))));
      url.searchParams.set('quality', String(Math.min(90, Math.max(40, quality))));
      url.searchParams.set('format', 'webp');
      return url.toString();
    }

    if (!url.pathname.includes(publicObjectPath)) return raw;

    url.pathname = url.pathname.replace(publicObjectPath, renderPath);
    url.searchParams.set('width', String(Math.max(1, Math.round(width))));
    url.searchParams.set('quality', String(Math.min(90, Math.max(40, quality))));
    url.searchParams.set('format', 'webp');
    return url.toString();
  } catch {
    return raw;
  }
}
