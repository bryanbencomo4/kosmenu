/** Product/commerce image resolution shared across the public menu. */

export type ImageableProduct = {
  imagen_url?: string | null;
};

/** Real product photo only — null when empty or identical to the commerce logo. */
export function productImageUrl(imageUrl: string | null | undefined, logoUrl?: string | null) {
  const raw = (imageUrl ?? '').trim();
  if (!raw) return null;
  const logo = (logoUrl ?? '').trim();
  if (logo && raw === logo) return null;
  return raw;
}

/** Display helper: product photo, else commerce logo (never a blank tile). */
export function displayProductImage(imageUrl: string | null | undefined, logoUrl?: string | null) {
  return productImageUrl(imageUrl, logoUrl) || (logoUrl ?? '').trim() || null;
}

export function resolveHeroCover(
  products: Array<{ imagen_url?: string | null }>,
  logoUrl?: string | null,
): string | null {
  for (const product of products) {
    const url = productImageUrl(product.imagen_url, logoUrl);
    if (url) return url;
  }
  return (logoUrl ?? '').trim() || null;
}
