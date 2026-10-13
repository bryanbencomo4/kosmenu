'use client';

import { useLayoutEffect, useRef, useState } from 'react';

import {
  DEFAULT_IMAGE_FILL,
  extractImageFillAnalysis,
  getCachedImageFillColor,
  getCachedSideUniformity,
} from './extract-image-fill-color';

type KioskImageProps = {
  src: string;
  alt?: string;
  className?: string;
  imgClassName?: string;
  /** Eager-load + high fetch priority (home logo / LCP). Keep false for grids. */
  priority?: boolean;
  /**
   * `auto` = widen extreme food crops; keep Instagram letterbox for studio/pack shots.
   * `contain` / `cover` = force that mode.
   */
  fit?: 'auto' | 'contain' | 'cover';
};

/** If contain would fill less than this of the frame, consider widening. */
const NARROW_FILL = 0.62;
/** Side edges this uniform ⇒ studio/pack shot → keep letterbox (e.g. Maltín). */
const STUDIO_SIDE_UNIFORMITY = 0.45;

function containFillRatio(
  imageWidth: number,
  imageHeight: number,
  boxWidth: number,
  boxHeight: number,
) {
  if (!imageWidth || !imageHeight || !boxWidth || !boxHeight) return 1;
  const imageAspect = imageWidth / imageHeight;
  const boxAspect = boxWidth / boxHeight;
  return imageAspect > boxAspect ? boxAspect / imageAspect : imageAspect / boxAspect;
}

function shouldWiden(
  fillRatio: number,
  sideUniformity: number | undefined,
): boolean {
  if (fillRatio >= NARROW_FILL) return false;
  // Unknown analysis (CORS): still widen extreme strips so burgers don't stay skinny.
  if (sideUniformity == null) return true;
  // Flat side color (drink packs, studio bg) looks good with letterbox — leave it.
  if (sideUniformity >= STUDIO_SIDE_UNIFORMITY) return false;
  return true;
}

export function KioskImage({
  src,
  alt = '',
  className = '',
  imgClassName = '',
  priority = false,
  fit = 'auto',
}: KioskImageProps) {
  const frameRef = useRef<HTMLDivElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);
  const [fillColor, setFillColor] = useState<string>(
    () => getCachedImageFillColor(src) ?? DEFAULT_IMAGE_FILL,
  );
  const [sideUniformity, setSideUniformity] = useState<number | undefined>(() =>
    getCachedSideUniformity(src),
  );
  const [resolvedFit, setResolvedFit] = useState<'contain' | 'cover'>(() =>
    fit === 'auto' ? 'contain' : fit,
  );

  const shown = Boolean(src) && loadedSrc === src;
  const useContain = resolvedFit === 'contain';

  useLayoutEffect(() => {
    setFillColor(getCachedImageFillColor(src) ?? DEFAULT_IMAGE_FILL);
    setSideUniformity(getCachedSideUniformity(src));
    const image = imageRef.current;
    if (image?.complete) {
      setLoadedSrc(src);
    } else {
      setLoadedSrc(null);
    }
    if (fit !== 'auto') {
      setResolvedFit(fit);
    } else {
      setResolvedFit('contain');
    }
  }, [src, fit]);

  useLayoutEffect(() => {
    if (!src || fit === 'cover') return;

    let cancelled = false;
    void extractImageFillAnalysis(src).then((analysis) => {
      if (cancelled || !analysis) return;
      setFillColor(analysis.color);
      setSideUniformity(analysis.sideUniformity);
    });

    return () => {
      cancelled = true;
    };
  }, [src, fit]);

  useLayoutEffect(() => {
    if (fit !== 'auto') {
      setResolvedFit(fit);
      return;
    }

    const frame = frameRef.current;
    const image = imageRef.current;
    if (!frame || !image) return;

    const update = () => {
      const boxW = frame.clientWidth;
      const boxH = frame.clientHeight;
      const imgW = image.naturalWidth;
      const imgH = image.naturalHeight;
      if (!boxW || !boxH || !imgW || !imgH) return;

      const fillRatio = containFillRatio(imgW, imgH, boxW, boxH);
      setResolvedFit(shouldWiden(fillRatio, sideUniformity) ? 'cover' : 'contain');
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(frame);
    return () => observer.disconnect();
  }, [src, fit, loadedSrc, sideUniformity]);

  return (
    <div
      ref={frameRef}
      className={`relative overflow-hidden ${className}`}
      style={useContain ? { backgroundColor: fillColor } : undefined}
    >
      {!shown ? (
        <div className="absolute inset-0 animate-pulse bg-neutral-200" aria-hidden />
      ) : null}

      {src && useContain ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          aria-hidden
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
          className={`pointer-events-none absolute inset-0 h-full w-full scale-125 object-cover blur-2xl transition-opacity duration-500 ${
            shown ? 'opacity-55' : 'opacity-0'
          }`}
        />
      ) : null}

      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          ref={imageRef}
          src={src}
          alt={alt}
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
          fetchPriority={priority ? 'high' : 'auto'}
          className={`relative h-full w-full transition-opacity duration-300 ${
            useContain ? 'object-contain' : 'object-cover'
          } ${shown ? 'opacity-100' : 'opacity-0'} ${imgClassName}`}
          onLoad={() => setLoadedSrc(src)}
          onError={() => setLoadedSrc(src)}
        />
      ) : null}
    </div>
  );
}
