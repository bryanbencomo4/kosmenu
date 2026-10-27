/** Pure load/cascade helpers for KioskImage (testable without DOM). */

export type ImageLoadPhase = 'cold' | 'hot' | 'original';

export type ImageCascadeUrls = {
  cold: string | null;
  hot: string | null;
  original: string | null;
};

/** Per-phase wait before advancing. Slow links still get a full window. */
export const IMAGE_PHASE_TIMEOUT_MS: Record<ImageLoadPhase, number> = {
  cold: 12_000,
  hot: 8_000,
  original: 8_000,
};

/** Hard cap across the whole cascade (same-origin hangs must not stack forever). */
export const IMAGE_TOTAL_BUDGET_MS = 22_000;

/** One automatic full-cascade retry after hard failure. */
export const IMAGE_AUTO_RETRY_DELAY_MS = 2_500;
export const IMAGE_MAX_AUTO_RETRIES = 1;

export function initialPhase(urls: ImageCascadeUrls): ImageLoadPhase {
  if (urls.cold) return 'cold';
  if (urls.hot) return 'hot';
  return 'original';
}

export function urlForPhase(urls: ImageCascadeUrls, phase: ImageLoadPhase): string | null {
  if (phase === 'cold') return urls.cold;
  if (phase === 'hot') return urls.hot;
  return urls.original;
}

export function nextPhase(
  urls: ImageCascadeUrls,
  current: ImageLoadPhase,
): ImageLoadPhase | null {
  if (current === 'cold') {
    if (urls.hot && urls.hot !== urls.cold) return 'hot';
    if (urls.original && urls.original !== urls.cold && urls.original !== urls.hot) return 'original';
    return null;
  }
  if (current === 'hot') {
    if (urls.original && urls.original !== urls.hot && urls.original !== urls.cold) return 'original';
    return null;
  }
  return null;
}

export function phaseTimeoutMs(
  phase: ImageLoadPhase,
  elapsedMs: number,
  totalBudgetMs: number = IMAGE_TOTAL_BUDGET_MS,
): number {
  const remaining = Math.max(0, totalBudgetMs - elapsedMs);
  const preferred = IMAGE_PHASE_TIMEOUT_MS[phase];
  return Math.min(preferred, remaining);
}

/** Stable short hash of a storage object path (no PII / no full URL). */
export function hashImagePath(url: string): string {
  const raw = (url || '').trim();
  let path = raw;
  try {
    path = new URL(raw).pathname;
  } catch {
    // keep raw
  }
  const marker = '/storage/v1/object/';
  const idx = path.indexOf(marker);
  if (idx >= 0) path = path.slice(idx + marker.length);
  let hash = 2166136261;
  for (let i = 0; i < path.length; i += 1) {
    hash ^= path.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}
