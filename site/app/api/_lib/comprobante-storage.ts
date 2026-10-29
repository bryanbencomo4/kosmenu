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

export type ComprobanteSignedUrlOptions = {
  downloadName?: string;
  transform?: {
    width: number;
    quality?: number;
  };
};

/** Small WebP preview. The original phone photo is what makes the receipt feel slow. */
export const COMPROBANTE_PREVIEW_WIDTH = 800;
export const COMPROBANTE_PREVIEW_QUALITY = 66;

export function planComprobanteView(
  objectPath: string,
  orderId: string,
): {
  downloadName: string;
  preview: { width: number; quality: number } | null;
} {
  const isPdf = /\.pdf($|\?)/i.test(objectPath);
  const ext = isPdf
    ? 'pdf'
    : /\.png($|\?)/i.test(objectPath)
      ? 'png'
      : /\.webp($|\?)/i.test(objectPath)
        ? 'webp'
        : 'jpg';
  const safeOrder = orderId.replace(/[^A-Za-z0-9_-]+/g, '').slice(0, 40);
  return {
    downloadName: `comprobante-${safeOrder || 'pago'}.${ext}`,
    preview: isPdf
      ? null
      : { width: COMPROBANTE_PREVIEW_WIDTH, quality: COMPROBANTE_PREVIEW_QUALITY },
  };
}

/** Short-lived signed URL for privileged readers (merchant/admin). Not for public tracking. */
export async function createComprobanteSignedUrl(
  objectPath: string,
  expiresInSec = COMPROBANTE_SIGNED_URL_TTL_SEC,
  options?: ComprobanteSignedUrlOptions,
): Promise<string | null> {
  if (!objectPath || objectPath.includes('..') || objectPath.startsWith('/')) {
    return null;
  }

  const width = options?.transform?.width;
  const quality = options?.transform?.quality ?? COMPROBANTE_PREVIEW_QUALITY;
  const transform =
    typeof width === 'number' && width >= 64 && width <= 1600
      ? {
          width: Math.round(width),
          resize: 'contain' as const,
          quality: Math.min(100, Math.max(20, Math.round(quality))),
        }
      : undefined;
  const downloadName = options?.downloadName
    ?.replace(/[^A-Za-z0-9._-]+/g, '')
    .slice(0, 80);
  const signedOptions =
    transform || downloadName
      ? {
          ...(downloadName ? { download: downloadName } : {}),
          ...(transform ? { transform } : {}),
        }
      : undefined;

  const supabase = getServiceSupabaseClient();
  const { data, error } = await supabase.storage
    .from(COMPROBANTES_BUCKET)
    .createSignedUrl(objectPath, expiresInSec, signedOptions);

  if (error || !data?.signedUrl) {
    console.error('[comprobantes] signed url failed');
    return null;
  }

  return data.signedUrl;
}

/**
 * Original file, a transformed preview, and a download URL.
 * The preview token is created with the transform. Do not rewrite /object/sign/ into /render/image/.
 * A preview failure must not drop the original URL.
 */
export async function createComprobanteViewUrls(
  objectPath: string,
  expiresInSec: number,
  orderId: string,
): Promise<{
  fileUrl: string | null;
  previewUrl: string | null;
  downloadUrl: string | null;
}> {
  const plan = planComprobanteView(objectPath, orderId);
  const [fileUrl, downloadUrl, previewUrl] = await Promise.all([
    createComprobanteSignedUrl(objectPath, expiresInSec),
    createComprobanteSignedUrl(objectPath, expiresInSec, {
      downloadName: plan.downloadName,
    }),
    plan.preview
      ? createComprobanteSignedUrl(objectPath, expiresInSec, {
          transform: plan.preview,
        })
      : Promise.resolve(null),
  ]);
  return { fileUrl, previewUrl, downloadUrl };
}
