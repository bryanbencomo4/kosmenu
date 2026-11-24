'use client';

import { RefreshCw } from 'lucide-react';
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
} from 'react';

import {
  resolveMenuImageSources,
  VARIANT_WIDTHS,
} from '../../../../_lib/optimize-storage-image';
import {
  autoRetryDelayMs,
  IMAGE_MAX_AUTO_RETRIES,
  IMAGE_TOTAL_BUDGET_MS,
  initialPhase,
  nextPhase,
  urlForPhase,
  type ImageCascadeUrls,
  type ImageLoadPhase,
} from '../../_lib/kiosk-image-load';

/** Chat thumbs: fail cold/hot faster and always fall through to original. */
const CHAT_PHASE_TIMEOUT_MS: Record<ImageLoadPhase, number> = {
  cold: 4_000,
  hot: 5_000,
  original: 8_000,
};

type ChatThumbImageProps = {
  /** Preferred display URL (often cold WebP). */
  src: string | null | undefined;
  /** Raw Storage URL — enables the same cold→hot→original cascade as the menu. */
  sourceUrl?: string | null;
  displayWidth?: number;
  alt?: string;
  className?: string;
  priority?: boolean;
  fallbackLetter?: string;
};

function buildCascade(
  src: string,
  sourceUrl: string | null | undefined,
  displayWidth: number,
): ImageCascadeUrls {
  const preferred = (src || '').trim();
  const original = (sourceUrl || '').trim() || preferred;
  if (!original && !preferred) {
    return { cold: null, hot: null, original: null };
  }
  const sources = resolveMenuImageSources(original, displayWidth);
  if (!sources) {
    return { cold: null, hot: null, original: preferred || original || null };
  }
  return {
    cold: sources.coldWebp,
    hot: sources.hot,
    original: sources.original || preferred || original,
  };
}

function queueColdVariantBackfill(imageUrl: string) {
  if (typeof window === 'undefined') return;
  const key = `kos-var:${imageUrl}`;
  try {
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, '1');
  } catch {
    /* ignore */
  }
  void fetch('/api/images/variants', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ imageUrl, lazy: true }),
    keepalive: true,
  }).catch(() => {});
}

/**
 * Chat thumbs using the same cascade rules as the menu (cold → hot → original),
 * without importing KioskImage (keeps menu codepath untouched).
 */
export function ChatThumbImage({
  src,
  sourceUrl = null,
  displayWidth = VARIANT_WIDTHS.thumb,
  alt = '',
  className = 'h-full w-full object-cover',
  priority = false,
  fallbackLetter = '?',
}: ChatThumbImageProps) {
  const imageRef = useRef<HTMLImageElement | null>(null);
  const loadGenRef = useRef(0);
  const attemptStartedAtRef = useRef(0);
  const phaseStartedAtRef = useRef(0);
  const phaseRef = useRef<ImageLoadPhase>('cold');
  const urlsRef = useRef<ImageCascadeUrls>({ cold: null, hot: null, original: null });
  const phaseTimerRef = useRef<number | null>(null);
  const retryTimerRef = useRef<number | null>(null);
  const autoRetriesRef = useRef(0);
  const waitingUrlRef = useRef<string | null>(null);

  const [sharpReady, setSharpReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [activeSrc, setActiveSrc] = useState('');

  const letter = (fallbackLetter || '?').trim().charAt(0).toUpperCase() || '?';
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

  function attemptElapsedMs(): number {
    if (typeof performance === 'undefined') return 0;
    return Math.max(0, performance.now() - attemptStartedAtRef.current);
  }

  function phaseWaitMs(phase: ImageLoadPhase, elapsedMs: number): number {
    const remaining = Math.max(0, IMAGE_TOTAL_BUDGET_MS - elapsedMs);
    return Math.min(CHAT_PHASE_TIMEOUT_MS[phase], remaining);
  }

  function armPhaseTimer(gen: number, currentPhase: ImageLoadPhase) {
    clearPhaseTimer();
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      finalizeFailure(gen);
      return;
    }
    const wait = phaseWaitMs(currentPhase, attemptElapsedMs());
    if (wait <= 0) {
      advanceOrFail(gen, currentPhase, 'timeout');
      return;
    }
    phaseTimerRef.current = window.setTimeout(() => {
      advanceOrFail(gen, currentPhase, 'timeout');
    }, wait);
  }

  function advanceOrFail(
    gen: number,
    fromPhase: ImageLoadPhase,
    _why: 'error' | 'timeout',
  ) {
    if (gen !== loadGenRef.current) return;
    // Always try the next URL in chat. Cold WebP variants are often missing or
    // slow; the original Storage object usually loads. (Kiosk keeps the stricter
    // "timeout does not advance" rule — chat must stay resilient.)
    const urls = urlsRef.current;
    const upcoming = nextPhase(urls, fromPhase);
    if (upcoming) {
      const original = (sourceUrl || src || '').trim();
      if (fromPhase === 'cold' && original) {
        queueColdVariantBackfill(original);
      }
      const nextUrl = urlForPhase(urls, upcoming);
      if (!nextUrl || phaseWaitMs(upcoming, attemptElapsedMs()) <= 0) {
        finalizeFailure(gen);
        return;
      }
      phaseRef.current = upcoming;
      phaseStartedAtRef.current =
        typeof performance !== 'undefined' ? performance.now() : 0;
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
    if (autoRetriesRef.current >= IMAGE_MAX_AUTO_RETRIES) return;
    const delay = autoRetryDelayMs(attemptElapsedMs(), IMAGE_TOTAL_BUDGET_MS);
    if (delay == null) return;
    autoRetriesRef.current += 1;
    clearRetryTimer();
    retryTimerRef.current = window.setTimeout(() => {
      if (gen !== loadGenRef.current) return;
      beginCascade(false);
    }, delay);
  }

  function beginCascade(resetRetries: boolean) {
    clearPhaseTimer();
    clearRetryTimer();
    if (resetRetries) {
      autoRetriesRef.current = 0;
      attemptStartedAtRef.current =
        typeof performance !== 'undefined' ? performance.now() : 0;
    }

    const gen = loadGenRef.current + 1;
    loadGenRef.current = gen;
    const preferred = (src || '').trim();
    const urls = buildCascade(preferred, sourceUrl, displayWidth);
    urlsRef.current = urls;
    const startPhase = initialPhase(urls);
    const startUrl = urlForPhase(urls, startPhase);
    phaseRef.current = startPhase;
    phaseStartedAtRef.current =
      typeof performance !== 'undefined' ? performance.now() : 0;
    if (!attemptStartedAtRef.current) {
      attemptStartedAtRef.current = phaseStartedAtRef.current;
    }
    setFailed(false);
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

    requestAnimationFrame(() => {
      if (gen !== loadGenRef.current) return;
      const image = imageRef.current;
      if (
        image?.complete &&
        image.naturalWidth > 0 &&
        image.currentSrc &&
        isCurrentImageResponse(image)
      ) {
        clearPhaseTimer();
        setSharpReady(true);
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
  }, [src, sourceUrl, displayWidth]);

  useEffect(
    () => () => {
      clearPhaseTimer();
      clearRetryTimer();
    },
    [],
  );

  function handleManualRetry(event: MouseEvent | PointerEvent) {
    // Do NOT preventDefault on pointerdown — that cancels the synthetic click
    // on touch/mobile and made "Reintentar" appear dead.
    event.stopPropagation();
    if ('preventDefault' in event && event.type === 'click') {
      event.preventDefault();
    }
    autoRetriesRef.current = 0;
    beginCascade(true);
  }

  if (failed || !activeSrc) {
    return (
      <span
        className="relative z-20 flex h-full w-full flex-col items-center justify-center gap-1 bg-[var(--chat-input)] text-[var(--chat-text-muted)]"
        data-chat-thumb="error"
      >
        <span className="text-xl font-semibold leading-none" aria-hidden>
          {letter}
        </span>
        <button
          type="button"
          data-chat-thumb-retry="1"
          data-chat-no-swipe="1"
          data-chat-no-drag="1"
          aria-label="Reintentar carga de imagen"
          className="relative z-30 inline-flex items-center gap-1 rounded-full bg-[var(--chat-send)] px-2.5 py-1 text-[10px] font-bold text-[var(--chat-send-fg)] shadow-sm pointer-events-auto"
          onClick={handleManualRetry}
          onPointerDown={(event) => {
            event.stopPropagation();
          }}
          onPointerUp={(event) => event.stopPropagation()}
        >
          <RefreshCw className="h-3 w-3" strokeWidth={2.4} aria-hidden />
          Reintentar
        </button>
      </span>
    );
  }

  return (
    <span className="relative block h-full w-full" data-chat-thumb={shown ? 'ok' : 'loading'}>
      {!shown ? (
        <span
          className="absolute inset-0 animate-pulse bg-[color-mix(in_srgb,var(--chat-text-muted)_18%,var(--chat-input))]"
          aria-hidden
        />
      ) : null}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={imageRef}
        src={activeSrc}
        alt={alt}
        className={`${className} ${shown ? 'opacity-100' : 'opacity-0'} transition-opacity duration-200`}
        loading={priority ? 'eager' : 'lazy'}
        decoding="async"
        fetchPriority={priority ? 'high' : 'auto'}
        draggable={false}
        onLoad={() => {
          if (!isCurrentImageResponse(imageRef.current)) return;
          clearPhaseTimer();
          setFailed(false);
          setSharpReady(true);
        }}
        onError={() => {
          if (!isCurrentImageResponse(imageRef.current)) return;
          const gen = loadGenRef.current;
          clearPhaseTimer();
          advanceOrFail(gen, phaseRef.current, 'error');
        }}
      />
    </span>
  );
}
