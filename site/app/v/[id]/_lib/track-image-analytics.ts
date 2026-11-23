/**
 * Lightweight image load telemetry for public menus.
 *
 * `image_load` means the browser fired img.onLoad (bytes decoded) — NOT a guarantee
 * that the pixel was painted on screen (CSS opacity, offscreen, GPU). For paint
 * confidence we'd need IntersectionObserver + rAF after onLoad; that is intentionally
 * out of scope to keep the menu cheap.
 *
 * Connection fields: we may send `downlink` / `rtt` hints when available. We never
 * label Wi‑Fi vs cellular from `effectiveType` alone (that is quality, not medium).
 */

import { detectMenuDevice, detectMenuOrigin } from '../../../api/_lib/business-hours';
import { kindForWidth, type ImageVariantKind } from '../../../_lib/optimize-storage-image';
import { isOwnerPreviewPath } from './track-menu-analytics';
import type { ImageLoadPhase } from './kiosk-image-load';

export type ImageAnalyticsEvent = 'image_load' | 'image_error' | 'image_timeout';

const SESSION_CAP_KEY = 'elmenuxfa:img-events:n';
const MAX_EVENTS_PER_SESSION = 24;
/** Successful loads are sampled; failures/timeouts are always eligible (still capped). */
const LOAD_SAMPLE_RATE = 0.08;

function identifier(comercioId: string) {
  return encodeURIComponent(comercioId.trim());
}

function sessionCount(): number {
  try {
    return Number(window.sessionStorage.getItem(SESSION_CAP_KEY) || '0') || 0;
  } catch {
    return MAX_EVENTS_PER_SESSION;
  }
}

function bumpSessionCount() {
  try {
    window.sessionStorage.setItem(SESSION_CAP_KEY, String(sessionCount() + 1));
  } catch {
    // ignore
  }
}

export function shouldSampleImageEvent(event: ImageAnalyticsEvent): boolean {
  if (typeof globalThis === 'undefined' || typeof (globalThis as { window?: unknown }).window === 'undefined') {
    return false;
  }
  if (sessionCount() >= MAX_EVENTS_PER_SESSION) return false;
  if (event === 'image_load') return Math.random() < LOAD_SAMPLE_RATE;
  return true;
}

export function comercioIdFromLocation(pathname: string = typeof window !== 'undefined' ? window.location.pathname : ''): string {
  const match = pathname.match(/^\/v\/([^/]+)/i);
  if (!match?.[1]) return '';
  try {
    return decodeURIComponent(match[1]).trim();
  } catch {
    return match[1].trim();
  }
}

export function imageKindForWidth(displayWidth: number): ImageVariantKind {
  return kindForWidth(displayWidth);
}

type TrackImageArgs = {
  event: ImageAnalyticsEvent;
  comercioId?: string | null;
  phase: ImageLoadPhase;
  kind: ImageVariantKind;
  ms: number;
  pathHash: string;
  reason?: string;
};

export function trackImageAnalyticsEvent(args: TrackImageArgs): void {
  if (typeof window === 'undefined') return;
  if (isOwnerPreviewPath(window.location.pathname)) return;
  const comercioId = (args.comercioId ?? comercioIdFromLocation()).trim();
  if (!comercioId) return;
  if (!shouldSampleImageEvent(args.event)) return;

  bumpSessionCount();

  const origin = detectMenuOrigin(window.location.search, document.referrer);
  const device = detectMenuDevice(window.navigator.userAgent);
  const conn = (navigator as Navigator & {
    connection?: { downlink?: number; rtt?: number; saveData?: boolean };
  }).connection;

  const metadata: Record<string, unknown> = {
    phase: args.phase,
    kind: args.kind,
    ms: Math.max(0, Math.round(args.ms)),
    path_hash: args.pathHash.slice(0, 16),
    signal: 'img_onload', // document limit: decode signal, not paint
  };
  if (args.reason) metadata.reason = String(args.reason).slice(0, 40);
  if (typeof conn?.downlink === 'number') metadata.downlink = Math.round(conn.downlink * 10) / 10;
  if (typeof conn?.rtt === 'number') metadata.rtt = Math.round(conn.rtt);
  if (conn?.saveData) metadata.save_data = true;

  void fetch(`/api/menu/${identifier(comercioId)}/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      event: args.event,
      origin,
      device,
      metadata,
    }),
    keepalive: true,
  }).catch(() => undefined);
}
