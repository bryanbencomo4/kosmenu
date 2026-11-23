import 'server-only';

import { createHmac, timingSafeEqual } from 'crypto';

import sharp from 'sharp';

import { publicSiteUrl } from '../../_lib/public-site-config';
import { getComprobantePermitSecret } from './comprobante-permit';
import {
  COMPROBANTES_BUCKET,
  planComprobanteView,
} from './comprobante-storage';
import { getServiceSupabaseClient } from './supabase-server';

export type ComprobanteMediaVariant = 'preview' | 'file' | 'download';

const MEDIA_TTL_SEC = 5 * 60;
const DISPLAY_MAX_BYTES = 3 * 1024 * 1024;
const DOWNLOAD_TIMEOUT_MS = 12_000;
const RESIZE_TIMEOUT_MS = 8_000;

/** Compact first paint for slow phones / Wi‑Fi. */
const PREVIEW_WIDTH = 560;
const PREVIEW_QUALITY = 52;
/** Display / zoom still goes through our domain, not raw phone photos. */
const FILE_WIDTH = 900;
const FILE_QUALITY = 58;

function getMediaSecret(): string {
  return getComprobantePermitSecret();
}

export function isComprobanteMediaVariant(value: unknown): value is ComprobanteMediaVariant {
  return value === 'preview' || value === 'file' || value === 'download';
}

/** Capability URL for merchant Image.network (no Authorization header needed). */
export function buildMerchantComprobanteMediaUrls(orderId: string, objectPath: string): {
  expiresInSec: number;
  url: string;
  previewUrl?: string;
  downloadUrl: string;
} {
  const expiresInSec = MEDIA_TTL_SEC;
  const exp = Date.now() + expiresInSec * 1000;
  const plan = planComprobanteView(objectPath, orderId);
  const base = `${publicSiteUrl}/api/business/orders/${encodeURIComponent(orderId)}/comprobante/media`;
  const file = signMediaUrl(base, orderId, 'file', exp);
  const download = signMediaUrl(base, orderId, 'download', exp);
  return {
    expiresInSec,
    url: file,
    ...(plan.preview ? { previewUrl: signMediaUrl(base, orderId, 'preview', exp) } : {}),
    downloadUrl: download,
  };
}

export function buildPublicComprobanteMediaUrls(
  code: string,
  objectPath: string,
  index = 0,
): {
  fileUrl: string;
  previewUrl: string | null;
  downloadUrl: string;
} {
  const plan = planComprobanteView(objectPath, code);
  const base = `/api/p/${encodeURIComponent(code)}/image`;
  const indexQuery = index > 0 ? `&i=${index}` : '';
  return {
    fileUrl: `${base}?v=file${indexQuery}`,
    previewUrl: plan.preview ? `${base}?v=preview${indexQuery}` : null,
    downloadUrl: `${base}?v=download${indexQuery}`,
  };
}

function signMediaUrl(
  base: string,
  orderId: string,
  variant: ComprobanteMediaVariant,
  exp: number,
): string {
  const sig = signMediaToken(orderId, variant, exp);
  return `${base}?v=${variant}&exp=${exp}&sig=${encodeURIComponent(sig)}`;
}

export function signMediaToken(
  orderId: string,
  variant: ComprobanteMediaVariant,
  exp: number,
): string {
  const payload = `${orderId.trim()}.${variant}.${exp}`;
  return createHmac('sha256', getMediaSecret()).update(payload).digest('base64url');
}

export function verifyMediaToken(
  orderId: string,
  variant: ComprobanteMediaVariant,
  expRaw: string,
  sigRaw: string,
  now = Date.now(),
): { ok: true } | { ok: false } {
  const exp = Number(expRaw);
  const sig = decodeURIComponent(sigRaw || '').trim();
  if (!Number.isFinite(exp) || !sig || exp < now) return { ok: false };
  if (exp - now > MEDIA_TTL_SEC * 1000 + 30_000) return { ok: false };

  const expected = signMediaToken(orderId, variant, exp);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false };
  return { ok: true };
}

function guessContentType(objectPath: string): string {
  const lower = objectPath.toLowerCase();
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  return 'application/octet-stream';
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label}_TIMEOUT`)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function downloadObject(
  objectPath: string,
): Promise<{ ok: true; bytes: Buffer; contentType: string } | { ok: false }> {
  try {
    const supabase = getServiceSupabaseClient();
    const result = await withTimeout(
      supabase.storage.from(COMPROBANTES_BUCKET).download(objectPath),
      DOWNLOAD_TIMEOUT_MS,
      'STORAGE_DOWNLOAD',
    );
    const { data, error } = result;
    if (error || !data) {
      console.error('[comprobante-media] download failed');
      return { ok: false };
    }
    const bytes = Buffer.from(
      await withTimeout(data.arrayBuffer(), DOWNLOAD_TIMEOUT_MS, 'STORAGE_READ'),
    );
    if (bytes.byteLength <= 0) return { ok: false };
    return { ok: true, bytes, contentType: guessContentType(objectPath) };
  } catch (error) {
    console.error('[comprobante-media] download timed out or failed', error);
    return { ok: false };
  }
}

async function toDisplayImage(
  bytes: Buffer,
  contentType: string,
  width: number,
  quality: number,
): Promise<{ bytes: Buffer; contentType: string }> {
  if (contentType === 'application/pdf') {
    return { bytes, contentType };
  }

  // Already small enough for slow networks — skip sharp.
  if (
    bytes.byteLength > 0 &&
    bytes.byteLength <= 160_000 &&
    (contentType === 'image/jpeg' || contentType === 'image/webp' || contentType === 'image/png')
  ) {
    return { bytes, contentType };
  }

  try {
    const out = await withTimeout(
      sharp(bytes, { failOn: 'none' })
        .rotate()
        .resize({
          width,
          height: Math.round(width * 1.7),
          fit: 'inside',
          withoutEnlargement: true,
        })
        .webp({ quality })
        .toBuffer(),
      RESIZE_TIMEOUT_MS,
      'SHARP_RESIZE',
    );
    if (out.byteLength > 0 && out.byteLength <= DISPLAY_MAX_BYTES) {
      return { bytes: out, contentType: 'image/webp' };
    }
  } catch (error) {
    console.error('[comprobante-media] resize failed', error);
  }

  if (bytes.byteLength <= DISPLAY_MAX_BYTES) {
    return { bytes, contentType };
  }

  try {
    const out = await withTimeout(
      sharp(bytes, { failOn: 'none' })
        .rotate()
        .resize({ width: 480, withoutEnlargement: true })
        .webp({ quality: 48 })
        .toBuffer(),
      RESIZE_TIMEOUT_MS,
      'SHARP_FALLBACK',
    );
    return { bytes: out, contentType: 'image/webp' };
  } catch {
    return { bytes: bytes.subarray(0, Math.min(bytes.byteLength, DISPLAY_MAX_BYTES)), contentType };
  }
}

export async function buildComprobanteMediaResponse(input: {
  objectPath: string;
  orderId: string;
  variant: ComprobanteMediaVariant;
}): Promise<Response> {
  const downloaded = await downloadObject(input.objectPath);
  if (downloaded.ok === false) {
    return new Response('No disponible.', {
      status: 504,
      headers: { 'Cache-Control': 'no-store' },
    });
  }

  const plan = planComprobanteView(input.objectPath, input.orderId);
  const isPdf = downloaded.contentType === 'application/pdf';

  if (input.variant === 'download' || isPdf) {
    const headers = new Headers({
      'Content-Type': downloaded.contentType,
      'Cache-Control': 'private, max-age=120',
      'X-Content-Type-Options': 'nosniff',
    });
    if (input.variant === 'download') {
      headers.set(
        'Content-Disposition',
        `attachment; filename="${plan.downloadName.replace(/"/g, '')}"`,
      );
    } else {
      headers.set(
        'Content-Disposition',
        `inline; filename="${plan.downloadName.replace(/"/g, '')}"`,
      );
    }
    return new Response(new Uint8Array(downloaded.bytes), { status: 200, headers });
  }

  const width = input.variant === 'preview' ? PREVIEW_WIDTH : FILE_WIDTH;
  const quality = input.variant === 'preview' ? PREVIEW_QUALITY : FILE_QUALITY;
  const display = await toDisplayImage(
    downloaded.bytes,
    downloaded.contentType,
    width,
    quality,
  );
  return new Response(new Uint8Array(display.bytes), {
    status: 200,
    headers: {
      'Content-Type': display.contentType,
      // Browser can reuse after a failed paint / retry without re-hitting storage.
      'Cache-Control': 'private, max-age=300, stale-while-revalidate=600',
      'X-Content-Type-Options': 'nosniff',
      'Content-Disposition': 'inline',
    },
  });
}
