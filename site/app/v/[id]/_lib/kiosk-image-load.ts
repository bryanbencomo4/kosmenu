/** Pure load/cascade helpers for KioskImage (testable without DOM). */

export type ImageLoadPhase = 'cold' | 'hot' | 'original';

export type ImageCascadeUrls = {
  cold: string | null;
  hot: string | null;
  original: string | null;
};

/**
 * Per-phase wait before treating a request as hung.
 * Slow links that are still downloading should finish inside the cold window.
 * Clear failures (img.onError / 404) advance immediately — they do not wait these timers.
 */
export const IMAGE_PHASE_TIMEOUT_MS: Record<ImageLoadPhase, number> = {
  cold: 12_000,
  hot: 8_000,
  original: 8_000,
};

/**
 * Hard wall-clock cap for one user-visible attempt cycle:
 * all phases + the single automatic retry + its delay.
 * Manual "Reintentar" starts a fresh cycle with a new budget.
 */
export const IMAGE_TOTAL_BUDGET_MS = 22_000;

/** Delay before the single automatic retry (only if budget remains). */
export const IMAGE_AUTO_RETRY_DELAY_MS = 1_500;
export const IMAGE_MAX_AUTO_RETRIES = 1;

/** Minimum remaining budget required to schedule an auto-retry. */
export const IMAGE_AUTO_RETRY_MIN_REMAINING_MS = 2_500;

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

/**
 * After a hang (no onLoad/onError), another URL on the same Storage host will not recover.
 * Only advance on hard errors (404 / decode) where the next URL may legitimately exist.
 */
export function shouldAdvanceAfterFailure(why: 'error' | 'timeout'): boolean {
  return why === 'error';
}

export function autoRetryDelayMs(
  elapsedMs: number,
  totalBudgetMs: number = IMAGE_TOTAL_BUDGET_MS,
): number | null {
  const remaining = totalBudgetMs - elapsedMs;
  if (remaining < IMAGE_AUTO_RETRY_MIN_REMAINING_MS) return null;
  return Math.min(IMAGE_AUTO_RETRY_DELAY_MS, Math.max(0, remaining - IMAGE_AUTO_RETRY_MIN_REMAINING_MS));
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
