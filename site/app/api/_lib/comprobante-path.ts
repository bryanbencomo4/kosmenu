import { COMPROBANTES_BUCKET } from './comprobante-storage';

const STORAGE_REF_PREFIX = `storage://${COMPROBANTES_BUCKET}/`;

/**
 * Extract a safe object path from an order-stored storage reference.
 * Rejects traversal, external URLs, other buckets, and empty paths.
 */
export function extractComprobanteObjectPath(storageRef: unknown): string | null {
  if (typeof storageRef !== 'string') return null;
  const raw = storageRef.trim();
  if (!raw.startsWith(STORAGE_REF_PREFIX)) return null;

  const objectPath = raw.slice(STORAGE_REF_PREFIX.length).trim();
  if (!objectPath) return null;
  if (objectPath.includes('..')) return null;
  if (objectPath.startsWith('/')) return null;
  if (objectPath.includes('\\')) return null;
  if (objectPath.includes('\0')) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(objectPath)) return null;
  // Expect comercioId/filename...
  if (!/^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/.test(objectPath) && !/^[A-Za-z0-9._/-]+$/.test(objectPath)) {
    return null;
  }
  if (objectPath.split('/').some((part) => !part || part === '.' || part === '..')) {
    return null;
  }

  return objectPath;
}

export function isComprobanteStorageRef(value: unknown): boolean {
  return extractComprobanteObjectPath(value) !== null;
}

/**
 * Prefer `detalles.comprobantes[]` when present; otherwise fall back to `comprobante_url`.
 * Dedupes while preserving order.
 */
export function collectComprobanteStorageRefs(detalles: unknown): string[] {
  if (!detalles || typeof detalles !== 'object') return [];
  const record = detalles as Record<string, unknown>;
  const out: string[] = [];
  const seen = new Set<string>();

  const push = (value: unknown) => {
    if (typeof value !== 'string') return;
    const ref = value.trim();
    if (!ref || seen.has(ref)) return;
    if (!extractComprobanteObjectPath(ref)) return;
    seen.add(ref);
    out.push(ref);
  };

  if (Array.isArray(record.comprobantes)) {
    for (const item of record.comprobantes) push(item);
  }
  if (out.length === 0) push(record.comprobante_url);
  return out;
}
