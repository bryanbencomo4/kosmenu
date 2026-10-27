'use client';

import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent, type PointerEvent } from 'react';

import {
  resolveMenuImageSources,
  VARIANT_WIDTHS,
} from '../../../../_lib/optimize-storage-image';
import {
  hashImagePath,
  IMAGE_AUTO_RETRY_DELAY_MS,
  IMAGE_MAX_AUTO_RETRIES,
  IMAGE_TOTAL_BUDGET_MS,
  initialPhase,
  nextPhase,
  phaseTimeoutMs,
  urlForPhase,
  type ImageCascadeUrls,
  type ImageLoadPhase,
} from '../../_lib/kiosk-image-load';
import {
  comercioIdFromLocation,
  imageKindForWidth,
  trackImageAnalyticsEvent,
} from '../../_lib/track-image-analytics';

type KioskImageProps = {
  src: string;
  /** Original Storage URL — enables cold→hot→original fallback without double-loading. */
  sourceUrl?: string | null;
  /** Display width hint for picking thumb/card/hero (defaults to card). */
  displayWidth?: number;
  /** Optional smaller URL for blur while hero loads (sheet only). */
  previewSrc?: string | null;
  alt?: string;
  className?: string;
  imgClassName?: string;
  /** Eager-load + high fetch priority (home logo / first grid tiles). Keep false for below-fold. */
  priority?: boolean;
  /**
   * `cover` (default) = fill frame, sharp edges clipped by parent radius (Instagram-style).
   * `contain` = full photo letterboxed on a blurred cover fill (product sheet hero).
   * `width` = full image at natural aspect, scaled to parent width (no crop, no blur).
   * `auto` = treated as `cover` (legacy alias).
   */
  fit?: 'auto' | 'contain' | 'cover' | 'width';
  /** Keep blurred cover fill behind the photo (default: on for `contain`, off for `cover`/`width`). */
  showBlurFill?: boolean;
  /**
   * @deprecated Prefer cold WebP. Hot `/render/` is slower under concurrency and caches only 1h.
   */
  preferHot?: boolean;
};

function queueLazyVariants(imageUrl: string) {
  if (typeof window === 'undefined') return;
  const key = `kos-var:${imageUrl}`;
  try {
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, '1');
  } catch {
    // ignore quota / private mode
  }
  void fetch('/api/images/variants', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ imageUrl, lazy: true }),
    keepalive: true,
  }).catch(() => {});
}

function buildCascade(
  src: string,
  sourceUrl: string | null | undefined,
  displayWidth: number,
  preferHot = false,
): ImageCascadeUrls {
  if (!sourceUrl) {
    return { cold: null, hot: null, original: src || null };
  }
  const sources = resolveMenuImageSources(sourceUrl, displayWidth);
  if (!sources) {
    return { cold: null, hot: null, original: src || sourceUrl };
  }
  if (preferHot) {
    return {
      cold: null,
      hot: sources.hot || src,
      original: sources.original,
    };
  }
  return {
    cold: sources.coldWebp,
    hot: sources.hot,
    original: sources.original || src,
  };
}

/**
 * Cover/contain media. Parent should use `overflow-hidden` + border-radius.
 * Loads preferred cold WebP; on error/timeout: hot → original; then stable placeholder.
 * Timeouts prevent infinite opacity-0 on hung Wi‑Fi; same-origin cascades share a total budget.
 */
export function KioskImage({
  src,
  sourceUrl,
  displayWidth = VARIANT_WIDTHS.card,
  previewSrc,
  alt = '',
  className = '',
  imgClassName = '',
  priority = false,
  fit = 'cover',
  showBlurFill,
  preferHot = false,
}: KioskImageProps) {
  const imageRef = useRef<HTMLImageElement | null>(null);
  const blurRef = useRef<HTMLImageElement | null>(null);
  const loadGenRef = useRef(0);
  const cascadeStartedAtRef = useRef(0);
  const phaseStartedAtRef = useRef(0);
  const phaseRef = useRef<ImageLoadPhase>('cold');
  const urlsRef = useRef<ImageCascadeUrls>({ cold: null, hot: null, original: null });
  const phaseTimerRef = useRef<number | null>(null);
  const retryTimerRef = useRef<number | null>(null);
  const autoRetriesRef = useRef(0);
  /** URL this generation is waiting for — blocks stale onLoad/onError after src/category changes. */
  const waitingUrlRef = useRef<string | null>(null);

  const [sharpReady, setSharpReady] = useState(false);
  const [fillReady, setFillReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [activeSrc, setActiveSrc] = useState('');
  const [phase, setPhase] = useState<ImageLoadPhase>('cold');

  const useWidth = fit === 'width';
  const useCover = fit !== 'contain' && !useWidth;
  const keepBlurFill = showBlurFill ?? fit === 'contain';
  const fillSrc = keepBlurFill ? (previewSrc ?? '').trim() || activeSrc : '';
  const shown = Boolean(activeSrc) && !failed && sharpReady;

  function clearPhaseTimer() {
    if (phaseTimerRef.current != null) {
      window.clearTimeout(phaseTimerRef.current);
      phaseTimerRef.current = null;
    }
  }

  function clearRetryTimer() {
    if (retryTimerRef.current != null) {
      window.clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  }

  function urlsRoughlyEqual(a: string, b: string): boolean {
    if (a === b) return true;
    try {
      return new URL(a).pathname === new URL(b).pathname;
    } catch {
      return false;
    }
  }

  function isCurrentImageResponse(img: HTMLImageElement | null): boolean {
    const waiting = waitingUrlRef.current;
    if (!img || !waiting) return false;
    const loaded = img.currentSrc || img.getAttribute('src') || '';
    return Boolean(loaded) && urlsRoughlyEqual(loaded, waiting);
  }

  function report(
    event: 'image_load' | 'image_error' | 'image_timeout',
    currentPhase: ImageLoadPhase,
    url: string,
    reason?: string,
  ) {
    const started = phaseStartedAtRef.current || cascadeStartedAtRef.current;
    trackImageAnalyticsEvent({
      event,
      comercioId: comercioIdFromLocation(),
      phase: currentPhase,
      kind: imageKindForWidth(displayWidth),
      ms: typeof performance !== 'undefined' ? performance.now() - started : 0,
      pathHash: hashImagePath(url || sourceUrl || src),
      reason,
    });
  }

  function armPhaseTimer(gen: number, currentPhase: ImageLoadPhase) {
    clearPhaseTimer();
    const elapsed =
      typeof performance !== 'undefined' ? performance.now() - cascadeStartedAtRef.current : 0;
    const wait = phaseTimeoutMs(currentPhase, elapsed, IMAGE_TOTAL_BUDGET_MS);
    if (wait <= 0) {
      handlePhaseTimeout(gen);
      return;
    }
    phaseTimerRef.current = window.setTimeout(() => {
      handlePhaseTimeout(gen);
    }, wait);
  }

  function advanceOrFail(gen: number, fromPhase: ImageLoadPhase, why: 'error' | 'timeout') {
    if (gen !== loadGenRef.current) return;
    const urls = urlsRef.current;
    const upcoming = nextPhase(urls, fromPhase);
    if (upcoming) {
      // Same Supabase host: still try next URL, but shared total budget bounds the hang.
      if (why === 'error' && fromPhase === 'cold' && sourceUrl) {
        queueLazyVariants(sourceUrl);
      }
      const nextUrl = urlForPhase(urls, upcoming);
      if (!nextUrl) {
        finalizeFailure(gen);
        return;
      }
      phaseRef.current = upcoming;
      setPhase(upcoming);
      phaseStartedAtRef.current = typeof performance !== 'undefined' ? performance.now() : 0;
      waitingUrlRef.current = nextUrl;
      setSharpReady(false);
      setActiveSrc(nextUrl);
      armPhaseTimer(gen, upcoming);
      return;
    }
    finalizeFailure(gen);
  }

  function finalizeFailure(gen: number) {
    if (gen !== loadGenRef.current) return;
    clearPhaseTimer();
    waitingUrlRef.current = null;
    setFailed(true);
    setSharpReady(true);
    if (autoRetriesRef.current < IMAGE_MAX_AUTO_RETRIES) {
      autoRetriesRef.current += 1;
      clearRetryTimer();
      retryTimerRef.current = window.setTimeout(() => {
        if (gen !== loadGenRef.current) return;
        beginCascade(false);
      }, IMAGE_AUTO_RETRY_DELAY_MS);
    }
  }

  function handlePhaseTimeout(gen: number) {
    if (gen !== loadGenRef.current) return;
    const currentPhase = phaseRef.current;
    const url = urlForPhase(urlsRef.current, currentPhase) || activeSrc;
    report('image_timeout', currentPhase, url, 'phase_timeout');
    advanceOrFail(gen, currentPhase, 'timeout');
  }

  function beginCascade(resetRetries: boolean) {
    clearPhaseTimer();
    clearRetryTimer();
    if (resetRetries) autoRetriesRef.current = 0;

    const gen = loadGenRef.current + 1;
    loadGenRef.current = gen;
    const urls = buildCascade(src, sourceUrl, displayWidth, preferHot);
    urlsRef.current = urls;
    const startPhase = initialPhase(urls);
    const startUrl = urlForPhase(urls, startPhase);
    phaseRef.current = startPhase;
    setPhase(startPhase);
    cascadeStartedAtRef.current = typeof performance !== 'undefined' ? performance.now() : 0;
    phaseStartedAtRef.current = cascadeStartedAtRef.current;
    setFailed(false);
    setFillReady(false);
    setSharpReady(false);

    if (!startUrl) {
      waitingUrlRef.current = null;
      setActiveSrc('');
      finalizeFailure(gen);
      return;
    }
    waitingUrlRef.current = startUrl;
    setActiveSrc(startUrl);
    armPhaseTimer(gen, startPhase);

    // Cached decode: complete synchronously after src assign.
    requestAnimationFrame(() => {
      if (gen !== loadGenRef.current) return;
      const image = imageRef.current;
      const blur = blurRef.current;
      if (blur?.complete && blur.naturalWidth > 0) setFillReady(true);
      if (
        image?.complete &&
        image.naturalWidth > 0 &&
        image.currentSrc &&
        isCurrentImageResponse(image)
      ) {
        clearPhaseTimer();
        setSharpReady(true);
        setFillReady(true);
        report('image_load', phaseRef.current, image.currentSrc);
      }
    });
  }

  useLayoutEffect(() => {
    beginCascade(true);
    return () => {
      clearPhaseTimer();
      clearRetryTimer();
      loadGenRef.current += 1;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- remount cascade only when identity inputs change
  }, [src, sourceUrl, displayWidth, preferHot]);

  useEffect(() => () => {
    clearPhaseTimer();
    clearRetryTimer();
  }, []);

  function handleSharpLoad() {
    if (!isCurrentImageResponse(imageRef.current)) return;
    clearPhaseTimer();
    setFailed(false);
    setSharpReady(true);
    setFillReady(true);
    report('image_load', phaseRef.current, waitingUrlRef.current || activeSrc);
  }

  function handleSharpError() {
    if (!isCurrentImageResponse(imageRef.current)) return;
    const gen = loadGenRef.current;
    clearPhaseTimer();
    report('image_error', phaseRef.current, waitingUrlRef.current || activeSrc, 'img_error');
    advanceOrFail(gen, phaseRef.current, 'error');
  }

  function handleManualRetry(event: MouseEvent | PointerEvent) {
    event.preventDefault();
    event.stopPropagation();
    autoRetriesRef.current = 0;
    beginCascade(true);
  }

  return (
    <div
      className={`relative overflow-hidden ${useWidth ? 'w-full' : ''} ${className}`}
      style={
        useWidth
          ? undefined
          : { backgroundColor: 'var(--menu-surface-alt, #f3f4f6)' }
      }
      data-image-phase={phase}
    >
      {!shown && !failed ? (
        <div
          className={
            useWidth
              ? 'aspect-[2/3] w-full animate-pulse bg-[var(--menu-surface-alt,#e5e7eb)]'
              : 'absolute inset-0 animate-pulse bg-[var(--menu-surface-alt,#e5e7eb)]'
          }
          aria-hidden
        />
      ) : null}

      {failed || !activeSrc ? (
        <div
          className={`grid place-items-center gap-1 text-[var(--menu-text-muted)] ${
            useWidth ? 'aspect-[2/3] w-full' : 'h-full w-full'
          }`}
          aria-hidden
        >
          <span className="text-2xl">🍽️</span>
          <button
            type="button"
            onClick={handleManualRetry}
            onPointerDown={(event) => event.stopPropagation()}
            className="rounded-full border border-[var(--menu-border,#e5e7eb)] bg-[var(--menu-surface,#fff)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--menu-text,#111)]"
          >
            Reintentar
          </button>
        </div>
      ) : (
        <>
          {keepBlurFill && fillSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              ref={blurRef}
              src={fillSrc}
              alt=""
              aria-hidden
              loading={priority ? 'eager' : 'lazy'}
              decoding={priority ? 'sync' : 'async'}
              fetchPriority={priority ? 'high' : 'low'}
              onLoad={() => setFillReady(true)}
              onError={() => setFillReady(false)}
              className={`pointer-events-none absolute inset-0 h-full w-full object-cover blur-xl transition-opacity duration-200 ${
                fillReady ? (shown ? 'opacity-80' : 'opacity-90') : 'opacity-0'
              }`}
              style={{ transform: 'scale(1.28)' }}
            />
          ) : null}

          {/* key remounts per URL so a cancelled request cannot fire on the next phase's node */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            key={activeSrc}
            ref={imageRef}
            src={activeSrc}
            alt={alt}
            loading={priority ? 'eager' : 'lazy'}
            decoding={priority ? 'sync' : 'async'}
            fetchPriority={priority ? 'high' : 'auto'}
            className={`relative z-[1] transition-opacity duration-150 ${
              useWidth
                ? 'block h-auto w-full'
                : `h-full w-full ${useCover ? 'object-cover' : 'object-contain'}`
            } ${shown ? 'opacity-100' : 'opacity-0'} ${imgClassName}`}
            onLoad={handleSharpLoad}
            onError={handleSharpError}
          />
        </>
      )}
    </div>
  );
}
