/** Client + server shared rules for payment proof uploads. Remote Storage policies are separate. */

export const COMPROBANTE_MAX_BYTES = 5 * 1024 * 1024;

export const COMPROBANTE_ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
]);

const BLOCKED_EXTENSIONS = new Set(['svg', 'html', 'htm', 'xhtml', 'js', 'mjs', 'xml']);

export type ComprobanteValidationResult =
  | { ok: true; safeFileName: string }
  | { ok: false; error: string };

export function sanitizeComprobanteFileName(name: string): string {
  return name
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9._-]/g, '')
    .toLowerCase()
    .slice(0, 120);
}

export function isUnsafeComprobantePath(path: string): boolean {
  const normalized = path.replace(/\\/g, '/');
  if (!normalized || normalized.startsWith('/') || normalized.includes('..')) return true;
  if (normalized.includes('\0')) return true;
  return false;
}

/** Detect real MIME from magic bytes (camera captures often omit `File.type`). */
export function sniffComprobanteMime(bytes: ArrayBuffer | Uint8Array): string | null {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (u8.length >= 3 && u8[0] === 0xff && u8[1] === 0xd8 && u8[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    u8.length >= 8 &&
    u8[0] === 0x89 &&
    u8[1] === 0x50 &&
    u8[2] === 0x4e &&
    u8[3] === 0x47 &&
    u8[4] === 0x0d &&
    u8[5] === 0x0a &&
    u8[6] === 0x1a &&
    u8[7] === 0x0a
  ) {
    return 'image/png';
  }
  if (
    u8.length >= 12 &&
    u8[0] === 0x52 &&
    u8[1] === 0x49 &&
    u8[2] === 0x46 &&
    u8[3] === 0x46 &&
    u8[8] === 0x57 &&
    u8[9] === 0x45 &&
    u8[10] === 0x42 &&
    u8[11] === 0x50
  ) {
    return 'image/webp';
  }
  if (u8.length >= 5 && u8[0] === 0x25 && u8[1] === 0x50 && u8[2] === 0x44 && u8[3] === 0x46) {
    return 'application/pdf';
  }
  // HEIC/HEIF (`ftyp` … `heic`/`heif`/`mif1`) — not accepted for upload as-is.
  if (u8.length >= 12 && u8[4] === 0x66 && u8[5] === 0x74 && u8[6] === 0x79 && u8[7] === 0x70) {
    const brand = String.fromCharCode(u8[8], u8[9], u8[10], u8[11]).toLowerCase();
    if (brand.includes('hei') || brand === 'mif1' || brand === 'msf1') {
      return 'image/heic';
    }
  }
  return null;
}

/** Prefer a declared allowed MIME; otherwise sniff. Camera files often arrive as empty/`octet-stream`. */
export function resolveComprobanteMime(input: {
  declaredMime?: string | null;
  bytes: ArrayBuffer | Uint8Array;
}): string {
  const declared = (input.declaredMime ?? '').trim().toLowerCase();
  if (COMPROBANTE_ALLOWED_MIME.has(declared)) return declared;
  const sniffed = sniffComprobanteMime(input.bytes);
  if (sniffed && COMPROBANTE_ALLOWED_MIME.has(sniffed)) return sniffed;
  if (sniffed) return sniffed;
  return declared || 'application/octet-stream';
}

export function validateComprobanteFile(input: {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  storagePath?: string;
}): ComprobanteValidationResult {
  const mime = (input.mimeType ?? '').trim().toLowerCase();
  if (!COMPROBANTE_ALLOWED_MIME.has(mime)) {
    return { ok: false, error: 'MIME type not allowed.' };
  }

  if (!Number.isFinite(input.sizeBytes) || input.sizeBytes <= 0) {
    return { ok: false, error: 'Invalid file size.' };
  }

  if (input.sizeBytes > COMPROBANTE_MAX_BYTES) {
    return { ok: false, error: 'File too large.' };
  }

  const safeFileName = sanitizeComprobanteFileName(input.fileName) || 'comprobante.jpg';
  const ext = safeFileName.includes('.')
    ? safeFileName.slice(safeFileName.lastIndexOf('.') + 1)
    : '';
  if (BLOCKED_EXTENSIONS.has(ext)) {
    return { ok: false, error: 'File extension not allowed.' };
  }

  if (input.storagePath && isUnsafeComprobantePath(input.storagePath)) {
    return { ok: false, error: 'Unsafe storage path.' };
  }

  return { ok: true, safeFileName };
}
