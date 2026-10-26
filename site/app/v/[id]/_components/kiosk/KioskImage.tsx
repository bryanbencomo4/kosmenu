'use client';

import { useLayoutEffect, useRef, useState } from 'react';

import {
  resolveMenuImageSources,
  VARIANT_WIDTHS,
} from '../../../../_lib/optimize-storage-image';

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
  /** Eager-load + high fetch priority (home logo / LCP). Keep false for grids. */
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
   * Skip cold variants (use hot transform). Avoids cold-404→hot swap that
   * looks like the image "adjusts" after refresh on freshly uploaded covers.
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

function preferredSrc(
  src: string,
  sourceUrl: string | null | undefined,
  displayWidth: number,
  preferHot = false,
): { active: string; hot: string | null; original: string | null } {
  if (!sourceUrl) {
    return { active: src, hot: null, original: null };
  }
  const sources = resolveMenuImageSources(sourceUrl, displayWidth);
  if (!sources) {
    return { active: src, hot: null, original: null };
  }
  if (preferHot) {
    return {
      active: sources.hot || src,
      hot: null,
      original: sources.original,
    };
  }
  // Cold-first: one URL, browser-cache friendly. Fallback only on error.
  return {
    active: sources.coldWebp || sources.hot || src,
    hot: sources.hot,
    original: sources.original,
  };
}

/**
 * Cover/contain media. Parent should use `overflow-hidden` + border-radius.
 * Loads a single preferred URL (cold WebP). On error: hot transform → original.
 * No hot→cold upgrade after paint (that caused flicker / double fetch).
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
  const cascadeRef = useRef<{ hot: string | null; original: string | null }>({
    hot: null,
    original: null,
  });
  const [sharpReady, setSharpReady] = useState(false);
  const [fillReady, setFillReady] = useState(false);
  const [failed, setFailed] = useState(false);

  const resolved = preferredSrc(src, sourceUrl, displayWidth, preferHot);
  const [activeSrc, setActiveSrc] = useState(resolved.active);

  const useWidth = fit === 'width';
  const useCover = fit !== 'contain' && !useWidth;
  const keepBlurFill = showBlurFill ?? fit === 'contain';
  // Only load a blur layer when letterboxing (contain). Cover/width tiles use one <img> only.
  const fillSrc = keepBlurFill ? (previewSrc ?? '').trim() || activeSrc : '';
  const shown = Boolean(activeSrc) && !failed && sharpReady;

  useLayoutEffect(() => {
    const next = preferredSrc(src, sourceUrl, displayWidth, preferHot);
    cascadeRef.current = { hot: next.hot, original: next.original };
    setActiveSrc(next.active);
    setFailed(false);
    setFillReady(false);
    setSharpReady(false);
    const blur = blurRef.current;
    const image = imageRef.current;
    // If the browser already has the image decoded (bfcache / same URL remount), skip fade-in.
    if (blur?.complete && blur.naturalWidth > 0 && blur.currentSrc) setFillReady(true);
    if (image?.complete && image.naturalWidth > 0 && image.currentSrc) {
      setSharpReady(true);
      setFillReady(true);
    }
  }, [src, sourceUrl, displayWidth, preferHot]);

  function handleSharpError() {
    const { hot, original } = cascadeRef.current;
    if (hot && activeSrc !== hot && activeSrc !== original) {
      setActiveSrc(hot);
      setSharpReady(false);
      if (sourceUrl) queueLazyVariants(sourceUrl);
      return;
    }
    if (original && activeSrc !== original) {
      setActiveSrc(original);
      setSharpReady(false);
      return;
    }
    setFailed(true);
    setSharpReady(true);
  }

  return (
    <div
      className={`relative overflow-hidden ${useWidth ? 'w-full' : ''} ${className}`}
      style={
        useWidth
          ? undefined
          : { backgroundColor: 'var(--menu-surface-alt, #f3f4f6)' }
      }
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
          className={`grid place-items-center text-2xl text-[var(--menu-text-muted)] ${
            useWidth ? 'aspect-[2/3] w-full' : 'h-full w-full'
          }`}
          aria-hidden
        >
          🍽️
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
              decoding="async"
              fetchPriority={priority ? 'high' : 'auto'}
              onLoad={() => setFillReady(true)}
              onError={() => setFillReady(false)}
              className={`pointer-events-none absolute inset-0 h-full w-full object-cover blur-xl transition-opacity duration-200 ${
                fillReady ? (shown ? 'opacity-80' : 'opacity-90') : 'opacity-0'
              }`}
              style={{ transform: 'scale(1.28)' }}
            />
          ) : null}

          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            ref={imageRef}
            src={activeSrc}
            alt={alt}
            loading={priority ? 'eager' : 'lazy'}
            decoding="async"
            fetchPriority={priority ? 'high' : 'auto'}
            className={`relative z-[1] transition-opacity duration-150 ${
              useWidth
                ? 'block h-auto w-full'
                : `h-full w-full ${useCover ? 'object-cover' : 'object-contain'}`
            } ${shown ? 'opacity-100' : 'opacity-0'} ${imgClassName}`}
            onLoad={() => {
              setFailed(false);
              setSharpReady(true);
              setFillReady(true);
            }}
            onError={handleSharpError}
          />
        </>
      )}
    </div>
  );
}
