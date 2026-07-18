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
