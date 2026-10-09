/** Product/commerce image resolution shared across the public menu. */

export type ImageableProduct = {
  imagen_url?: string | null;
};

/** Display widths (CSS px × ~2 for retina) used across the public menu. */
export const MENU_IMAGE_WIDTH = {
  logo: 240,
  thumb: 160,
  tile: 320,
  category: 400,
  sheet: 720,
  hero: 1200,
} as const;

/** Request a small WebP variant from Supabase Storage for menu rendering. */
export function optimizeMenuImageUrl(
  imageUrl: string | null | undefined,
  width: number = MENU_IMAGE_WIDTH.tile,
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
  width: number = MENU_IMAGE_WIDTH.tile,
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
  width: number = MENU_IMAGE_WIDTH.tile,
) {
  return (
    productImageUrl(imageUrl, logoUrl, width) ||
    optimizeMenuImageUrl(logoUrl, Math.min(width, MENU_IMAGE_WIDTH.logo))
  );
}

export function resolveHeroCover(
  products: Array<{ imagen_url?: string | null }>,
  logoUrl?: string | null,
): string | null {
  for (const product of products) {
    const url = productImageUrl(product.imagen_url, logoUrl, MENU_IMAGE_WIDTH.hero);
    if (url) return url;
  }
  return optimizeMenuImageUrl(logoUrl, 640);
}
