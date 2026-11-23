/**
 * Persist chat images across remounts (sessionStorage cannot keep blob: URLs).
 * Compresses to a JPEG/WebP data URL so quota stays reasonable.
 */

const MAX_EDGE = 1280;
const JPEG_QUALITY = 0.72;

export function isPersistedMediaUrl(url: string | null | undefined): boolean {
  const u = (url || '').trim();
  return (
    u.startsWith('data:image/') ||
    u.startsWith('https://') ||
    u.startsWith('http://')
  );
}

export async function fileToPersistedDataUrl(
  file: File | Blob,
  options?: { maxEdge?: number; quality?: number },
): Promise<string> {
  const maxEdge = options?.maxEdge ?? MAX_EDGE;
  const quality = options?.quality ?? JPEG_QUALITY;
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return await blobToDataUrl(file);
    }
    ctx.drawImage(bitmap, 0, 0, w, h);
    const mime =
      file.type === 'image/png' || file.type === 'image/webp'
        ? 'image/jpeg'
        : file.type.startsWith('image/')
          ? 'image/jpeg'
          : 'image/jpeg';
    return canvas.toDataURL(mime, quality);
  } finally {
    bitmap.close();
  }
}

/** Any blob → data URL (images, audio, PDF). Prefer `fileToPersistedDataUrl` for photos. */
export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('read_failed'));
    reader.readAsDataURL(blob);
  });
}
