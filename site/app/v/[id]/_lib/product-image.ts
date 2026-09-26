/** Product/commerce image resolution shared across the public menu. */

export type ImageableProduct = {
  imagen_url?: string | null;
};

/** Request a small WebP variant from Supabase Storage for menu rendering. */
export function optimizeMenuImageUrl(
  imageUrl: string | null | undefined,
  width = 480,
  quality = 72,
) {
  const raw = (imageUrl ?? '').trim();
  if (!raw) return null;

  try {
    const url = new URL(raw);
    const publicObjectPath = '/storage/v1/object/public/';
    if (!url.pathname.includes(publicObjectPath)) return raw;

    url.pathname = url.pathname.replace(
      publicObjectPath,
      '/storage/v1/render/image/public/',
    );
    url.searchParams.set('width', String(Math.max(1, Math.round(width))));
    url.searchParams.set('quality', String(Math.min(90, Math.max(40, quality))));
    url.searchParams.set('format', 'webp');
    return url.toString();
  } catch {
    return raw;
  }
}

/** Real product photo only — null when empty or identical to the commerce logo. */
export function productImageUrl(
  imageUrl: string | null | undefined,
  logoUrl?: string | null,
  width = 480,
) {
  const raw = (imageUrl ?? '').trim();
  if (!raw) return null;
  const logo = (logoUrl ?? '').trim();
  if (logo && raw === logo) return null;
  return optimizeMenuImageUrl(raw, width);
}

/** Display helper: product photo, else commerce logo (never a blank tile). */
export function displayProductImage(
  imageUrl: string | null | undefined,
  logoUrl?: string | null,
  width = 480,
) {
  return productImageUrl(imageUrl, logoUrl, width) || optimizeMenuImageUrl(logoUrl, 320);
}

export function resolveHeroCover(
  products: Array<{ imagen_url?: string | null }>,
  logoUrl?: string | null,
): string | null {
  for (const product of products) {
    const url = productImageUrl(product.imagen_url, logoUrl, 1200);
    if (url) return url;
  }
  return optimizeMenuImageUrl(logoUrl, 640);
}
