/** Product/commerce image resolution shared across the public menu. */

import { optimizeStorageImageUrl } from '../../../_lib/optimize-storage-image';

export type ImageableProduct = {
  imagen_url?: string | null;
};

/** Display widths (CSS px × ~2 for retina) used across the public menu. */
export const MENU_IMAGE_WIDTH = {
  logo: 240,
  /** Search / checkout thumbs (~64–80 CSS px). */
  thumb: 160,
  /** Product cards (~124–144 CSS px wide, 3:4 tall). */
  tile: 360,
  /** Category 2:3 covers (~half viewport on mobile). */
  category: 520,
  /** Options sheet hero. */
  sheet: 640,
  /** Lightbox / full-bleed heroes. */
  hero: 1200,
  lightbox: 1200,
} as const;

/** Request a small WebP variant from Supabase Storage for menu rendering. */
export function optimizeMenuImageUrl(
  imageUrl: string | null | undefined,
  width: number = MENU_IMAGE_WIDTH.tile,
  quality = 72,
) {
  return optimizeStorageImageUrl(imageUrl, width, quality);
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
