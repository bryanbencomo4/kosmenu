import {
  COMPROBANTE_MAX_BYTES,
  validateComprobanteFile,
} from './comprobante-upload';
import { getServiceSupabaseClient } from './supabase-server';

export const COMPROBANTES_BUCKET = 'comprobantes';
/** Default signed URL lifetime for merchant proof viewing (5 minutes). */
export const COMPROBANTE_SIGNED_URL_TTL_SEC = 5 * 60;

/** Stored on the order as an opaque storage reference (never a permanent public URL). */
export function toComprobanteStorageRef(objectPath: string): string {
  return `storage://${COMPROBANTES_BUCKET}/${objectPath}`;
}

export function parseComprobanteStorageRef(value: string): string | null {
  const raw = value.trim();
  const prefix = `storage://${COMPROBANTES_BUCKET}/`;
  if (raw.startsWith(prefix)) {
    return raw.slice(prefix.length);
  }
  // Legacy public URLs / bare paths are not re-exposed as signed URLs from tracking.
  return null;
}

export async function uploadComprobanteObject(input: {
  comercioId: string;
  fileName: string;
  mimeType: string;
  bytes: ArrayBuffer;
}): Promise<{ ok: true; storageRef: string; objectPath: string } | { ok: false; error: string }> {
  const sizeBytes = input.bytes.byteLength;
  const validated = validateComprobanteFile({
    fileName: input.fileName,
    mimeType: input.mimeType,
    sizeBytes,
  });
  if (validated.ok === false) {
    return { ok: false, error: validated.error };
  }

  if (sizeBytes > COMPROBANTE_MAX_BYTES) {
    return { ok: false, error: 'File too large.' };
  }

  const comercioId = input.comercioId.trim();
  if (!comercioId || comercioId.includes('/') || comercioId.includes('..')) {
    return { ok: false, error: 'Invalid comercio.' };
  }

  const objectPath = `${comercioId}/${crypto.randomUUID()}-${validated.safeFileName}`;
  const supabase = getServiceSupabaseClient();
  const { error } = await supabase.storage.from(COMPROBANTES_BUCKET).upload(objectPath, input.bytes, {
    contentType: input.mimeType,
    upsert: false,
  });

  if (error) {
    console.error('[comprobantes] upload failed');
    return { ok: false, error: 'Upload failed.' };
  }

  return {
    ok: true,
    objectPath,
    storageRef: toComprobanteStorageRef(objectPath),
  };
}

/** Short-lived signed URL for privileged readers (merchant/admin). Not for public tracking. */
export async function createComprobanteSignedUrl(
  objectPath: string,
  expiresInSec = COMPROBANTE_SIGNED_URL_TTL_SEC,
): Promise<string | null> {
  if (!objectPath || objectPath.includes('..') || objectPath.startsWith('/')) {
    return null;
  }

  const supabase = getServiceSupabaseClient();
  const { data, error } = await supabase.storage
    .from(COMPROBANTES_BUCKET)
    .createSignedUrl(objectPath, expiresInSec);

  if (error || !data?.signedUrl) {
    console.error('[comprobantes] signed url failed');
    return null;
  }

  return data.signedUrl;
}
