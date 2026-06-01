import { Image } from 'https://deno.land/x/imagescript@1.3.0/mod.ts';
import type { KnownBrandRecord } from './product-image-prompt.ts';

/** Rasteriza SVG de Simple Icons a PNG vía proxy (ImageScript no decodifica SVG). */
async function fetchBrandLogoPng(brand: KnownBrandRecord): Promise<Uint8Array | null> {
  const iconUrl = `https://cdn.simpleicons.org/${brand.slug}/${brand.iconColor}`;
  const rasterUrl =
    `https://wsrv.nl/?url=${encodeURIComponent(iconUrl)}&output=png&w=640&h=640&fit=contain&bg=00000000`;

  try {
    const response = await fetch(rasterUrl, { redirect: 'follow' });
    if (!response.ok) {
      return null;
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length < 64) {
      return null;
    }
    return bytes;
  } catch {
    return null;
  }
}

/**
 * Superpone el logo oficial (Simple Icons) centrado sobre la imagen generada por IA.
 * Gemini solo genera el fondo; el logo real evita logos inventados.
 */
export async function applyBrandLogoOverlay(
  imageBytes: Uint8Array,
  brand: KnownBrandRecord,
): Promise<Uint8Array> {
  const logoBytes = await fetchBrandLogoPng(brand);
  if (!logoBytes) {
    return imageBytes;
  }

  try {
    const base = await Image.decode(imageBytes);
    const logo = await Image.decode(logoBytes);
    if (!base || !logo) {
      return imageBytes;
    }

    const maxLogoWidth = Math.floor(base.width * 0.44);
    const scale = maxLogoWidth / logo.width;
    const logoHeight = Math.max(1, Math.floor(logo.height * scale));
    const resized = logo.resize(maxLogoWidth, logoHeight);

    const x = Math.floor((base.width - resized.width) / 2);
    const y = Math.floor((base.height - resized.height) / 2);
    base.composite(resized, x, y);

    return await base.encode();
  } catch {
    return imageBytes;
  }
}
