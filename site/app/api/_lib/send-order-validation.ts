import { z } from 'zod';

import { publicSiteUrl } from './public-site-url';

export const MAX_SEND_ORDER_BODY_BYTES = 8_192;

const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3)
  .max(254)
  .email()
  .refine((value) => !value.includes('\n') && !value.includes('\r'), {
    message: 'Invalid email.',
  });

const orderIdSchema = z
  .string()
  .trim()
  .min(6)
  .max(120)
  .regex(/^[A-Za-z0-9._:-]+$/, 'Invalid orderId.');

/**
 * Public POST body for /api/send-order.
 * Unknown keys rejected. Client cannot supply from/subject/html/template.
 */
export const sendOrderRequestSchema = z
  .object({
    clientEmail: emailSchema,
    orderId: orderIdSchema,
    // Accepted for backward compatibility but ignored for tracking URL / naming.
    // Comercio name is loaded from the order record server-side when available.
    comercioNombre: z.string().trim().max(120).optional(),
    comercioName: z.string().trim().max(120).optional(),
    orderTrackingUrl: z.string().trim().max(500).optional(),
    /**
     * Explicit opt-in to mint/rotate the public tracking token and include a fresh link.
     * Absent/false: receipt email may be resent without invalidating existing tracking links
     * (tracking URL omitted because plaintext token is never stored).
     */
    regenerateTrackingLink: z.literal(true).optional(),
  })
  .strict();

export type SendOrderRequest = z.infer<typeof sendOrderRequestSchema>;

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function sanitizeDisplayName(value: string | undefined, fallback = 'elmenuxfa.com'): string {
  const cleaned = (value ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[<>]/g, '')
    .trim()
    .slice(0, 120);
  return cleaned || fallback;
}

export function buildOrderTrackingUrl(
  orderId: string,
  comercioSlug?: string | null,
  trackingToken?: string | null,
): string {
  const safeOrderId = encodeURIComponent(orderId.trim());
  const slug = (comercioSlug ?? '').trim();
  const base = slug
    ? `${publicSiteUrl}/v/${encodeURIComponent(slug)}/orders/${safeOrderId}`
    : `${publicSiteUrl}/orders/${safeOrderId}`;
  const token = (trackingToken ?? '').trim();
  if (!token) return base;
  const url = new URL(base);
  url.searchParams.set('t', token);
  return url.toString();
}

/**
 * Only same-origin tracking URLs under /orders or /v/.../orders with a token are accepted.
 * Token-less paths are rejected (they are not usable credentials after H04).
 * Arbitrary absolute URLs (open redirects / phishing) are rejected.
 */
export function resolveSafeTrackingUrl(
  candidate: string | undefined,
  orderId: string,
  // Kept for call-site compatibility; tokenized URLs already encode slug in path.
  comercioSlug?: string | null,
): string | null {
  void comercioSlug;
  const raw = (candidate ?? '').trim();
  if (!raw) return null;

  try {
    const site = new URL(publicSiteUrl);
    const url = new URL(raw, site.origin);
    if (url.origin !== site.origin) return null;
    if (url.username || url.password) return null;

    const path = url.pathname;
    const isOrdersPath =
      path === `/orders/${encodeURIComponent(orderId)}` ||
      path === `/orders/${orderId}` ||
      /^\/v\/[^/]+\/orders\/[^/]+$/.test(path);

    if (!isOrdersPath) return null;
    if (!path.endsWith(`/${orderId}`) && !path.endsWith(`/${encodeURIComponent(orderId)}`)) {
      return null;
    }

    const token = (url.searchParams.get('t') ?? '').trim();
    if (!token) return null;

    const safe = new URL(`${url.origin}${url.pathname}`);
    safe.searchParams.set('t', token);
    return safe.toString();
  } catch {
    return null;
  }
}

export async function readJsonBodyWithLimit(
  request: Request,
  maxBytes: number,
): Promise<{ ok: true; value: unknown } | { ok: false; error: 'too_large' | 'invalid_json' }> {
  const contentLength = request.headers.get('content-length');
  if (contentLength) {
    const length = Number(contentLength);
    if (Number.isFinite(length) && length > maxBytes) {
      return { ok: false, error: 'too_large' };
    }
  }

  const raw = await request.text();
  if (raw.length > maxBytes) {
    return { ok: false, error: 'too_large' };
  }

  try {
    return { ok: true, value: JSON.parse(raw) as unknown };
  } catch {
    return { ok: false, error: 'invalid_json' };
  }
}
