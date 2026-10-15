'use client';

import { useLayoutEffect, useRef, useState } from 'react';

type KioskImageProps = {
  src: string;
  /** Smaller/cached URL shown blurred while `src` loads. */
  previewSrc?: string | null;
  alt?: string;
  className?: string;
  imgClassName?: string;
  /** Eager-load + high fetch priority (home logo / LCP). Keep false for grids. */
  priority?: boolean;
  /**
   * `cover` (default) = fill frame, sharp edges clipped by parent radius (Instagram-style).
   * `contain` = full photo letterboxed on a blurred cover fill (product sheet hero).
   * `auto` = treated as `cover` (legacy alias).
   */
  fit?: 'auto' | 'contain' | 'cover';
  /** Keep blurred cover fill behind the photo (default: on for `contain`, off for `cover`). */
  showBlurFill?: boolean;
};

/**
 * Cover/contain media. Parent should use `overflow-hidden` + border-radius.
 */
export function KioskImage({
  src,
  previewSrc,
  alt = '',
  className = '',
  imgClassName = '',
  priority = false,
  fit = 'cover',
  showBlurFill,
}: KioskImageProps) {
  const imageRef = useRef<HTMLImageElement | null>(null);
  const blurRef = useRef<HTMLImageElement | null>(null);
  const [sharpReady, setSharpReady] = useState(false);
  const [fillReady, setFillReady] = useState(false);
  const [failed, setFailed] = useState(false);

  const useCover = fit !== 'contain';
  const keepBlurFill = showBlurFill ?? !useCover;
  const fillSrc = (previewSrc ?? '').trim() || src;
  const shown = Boolean(src) && !failed && sharpReady;

  useLayoutEffect(() => {
    setFailed(false);
    setFillReady(false);
    setSharpReady(false);
    const blur = blurRef.current;
    const image = imageRef.current;
    if (blur?.complete && blur.naturalWidth > 0) setFillReady(true);
    if (image?.complete && image.naturalWidth > 0) {
      setSharpReady(true);
      setFillReady(true);
    }
  }, [src, fillSrc]);

  return (
    <div
      className={`relative overflow-hidden ${className}`}
      style={{ backgroundColor: 'var(--menu-surface-alt, #f3f4f6)' }}
    >
      {!fillReady && !shown && !failed ? (
        <div
          className="absolute inset-0 animate-pulse bg-[var(--menu-surface-alt,#e5e7eb)]"
          aria-hidden
        />
      ) : null}

      {failed || !src ? (
        <div
          className="grid h-full w-full place-items-center text-2xl text-[var(--menu-text-muted)]"
          aria-hidden
        >
          🍽️
        </div>
      ) : (
        <>
          {/* Blur fill: loading placeholder for cover; permanent letterbox fill for contain. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            ref={blurRef}
            src={fillSrc}
            alt=""
            aria-hidden
            loading={priority || fillSrc !== src ? 'eager' : 'lazy'}
            decoding="async"
            fetchPriority={priority || fillSrc !== src ? 'high' : 'auto'}
            onLoad={() => setFillReady(true)}
            onError={() => {
              if (fillSrc !== src) return;
              setFillReady(false);
            }}
            className={`pointer-events-none absolute inset-0 h-full w-full object-cover blur-xl transition-opacity duration-200 ${
              !fillReady
                ? 'opacity-0'
                : keepBlurFill
                  ? shown
                    ? 'opacity-80'
                    : 'opacity-90'
                  : shown
                    ? 'opacity-0'
                    : 'opacity-90'
            }`}
            style={{ transform: 'scale(1.28)' }}
          />

          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            ref={imageRef}
            src={src}
            alt={alt}
            loading={priority ? 'eager' : 'lazy'}
            decoding="async"
            fetchPriority={priority ? 'high' : 'auto'}
            className={`relative z-[1] h-full w-full transition-opacity duration-300 ${
              useCover ? 'object-cover' : 'object-contain'
            } ${shown ? 'opacity-100' : 'opacity-0'} ${imgClassName}`}
            onLoad={() => {
              setFailed(false);
              setSharpReady(true);
              setFillReady(true);
            }}
            onError={() => {
              setFailed(true);
              setSharpReady(true);
            }}
          />
        </>
      )}
    </div>
  );
}
