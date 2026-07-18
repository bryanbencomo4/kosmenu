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
