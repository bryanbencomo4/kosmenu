'use client';

import { useLayoutEffect, useRef, useState } from 'react';

type KioskImageProps = {
  src: string;
  /** Smaller/cached URL for the blur fill — shown immediately while `src` loads. */
  previewSrc?: string | null;
  alt?: string;
  className?: string;
  imgClassName?: string;
  /** Eager-load + high fetch priority (home logo / LCP). Keep false for grids. */
  priority?: boolean;
  /**
   * `contain` (default) = full photo + blurred cover fill behind.
   * `cover` = fill frame (logos only).
   * `auto` = treated as `contain` (legacy alias).
   */
  fit?: 'auto' | 'contain' | 'cover';
  /** Inner padding for the sharp contain layer. */
  pad?: boolean;
};

/** Extreme portraits narrower than this share of the frame get a soft widen. */
const MIN_WIDTH_FILL = 0.7;
/** Cap soft-widen so we never aggressively crop. */
const MAX_WIDEN = 1.28;

/**
 * Contain-first media tile: sharp centered photo + blurred cover fill.
 * Prefer a cached `previewSrc` for the blur layer so it paints before HD.
 */
export function KioskImage({
  src,
  previewSrc,
  alt = '',
  className = '',
  imgClassName = '',
  priority = false,
  fit = 'contain',
  pad = true,
}: KioskImageProps) {
  const frameRef = useRef<HTMLDivElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const [sharpReady, setSharpReady] = useState(false);
  const [fillReady, setFillReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [widenScale, setWidenScale] = useState(1);

  const useContain = fit !== 'cover';
  const fillSrc = (previewSrc ?? '').trim() || src;
  const shown = Boolean(src) && !failed && sharpReady;

  useLayoutEffect(() => {
    setFailed(false);
    setFillReady(false);
    setWidenScale(1);
    const image = imageRef.current;
    if (image?.complete && image.naturalWidth > 0) {
      setSharpReady(true);
    } else {
      setSharpReady(false);
    }
  }, [src, fillSrc]);

  useLayoutEffect(() => {
    if (!useContain || !shown) return;
    const frame = frameRef.current;
    const image = imageRef.current;
    if (!frame || !image) return;

    const update = () => {
      const boxW = frame.clientWidth;
      const boxH = frame.clientHeight;
      const imgW = image.naturalWidth;
      const imgH = image.naturalHeight;
      if (!boxW || !boxH || !imgW || !imgH) {
        setWidenScale(1);
        return;
      }
      const imgAspect = imgW / imgH;
      const boxAspect = boxW / boxH;
      // Width of the contain-fitted image as a fraction of the frame.
      const widthFill = imgAspect >= boxAspect ? 1 : imgAspect / boxAspect;
      if (widthFill >= MIN_WIDTH_FILL) {
        setWidenScale(1);
        return;
      }
      setWidenScale(Math.min(MAX_WIDEN, MIN_WIDTH_FILL / widthFill));
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(frame);
    return () => observer.disconnect();
  }, [useContain, shown, src]);

  return (
    <div
      ref={frameRef}
      className={`relative overflow-hidden ${className}`}
      style={
        useContain
          ? { backgroundColor: 'var(--menu-surface-alt, #f3f4f6)' }
          : undefined
      }
    >
      {!fillReady && !shown && !failed ? (
        <div
          className="absolute inset-0 bg-[var(--menu-surface-alt,#e5e7eb)]"
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
          {useContain ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={fillSrc}
              alt=""
              aria-hidden
              loading={priority ? 'eager' : 'lazy'}
              decoding="async"
              fetchPriority={priority ? 'high' : 'auto'}
              onLoad={() => setFillReady(true)}
              onError={() => {
                // Fall back to sharp URL if preview fails.
                if (fillSrc !== src) setFillReady(false);
              }}
              className={`pointer-events-none absolute inset-0 h-full w-full object-cover blur-xl transition-opacity duration-200 ${
                fillReady || shown ? 'opacity-85' : 'opacity-0'
              }`}
              style={{ transform: 'scale(1.28)' }}
            />
          ) : null}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            ref={imageRef}
            src={src}
            alt={alt}
            loading={priority ? 'eager' : 'lazy'}
            decoding="async"
            fetchPriority={priority ? 'high' : 'auto'}
            className={`relative z-[1] h-full w-full transition-opacity duration-300 ${
              useContain ? 'object-contain object-center' : 'object-cover'
            } ${useContain && pad ? 'p-1 sm:p-1.5' : ''} ${
              shown ? 'opacity-100' : 'opacity-0'
            } ${imgClassName}`}
            style={
              useContain && widenScale > 1
                ? { transform: `scale(${widenScale})` }
                : undefined
            }
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
