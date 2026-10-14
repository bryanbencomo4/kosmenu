'use client';

import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';

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
   * `cover` = fill frame (logos / discovery dishes) with blur-while-loading.
   * `auto` = treated as `contain` (legacy alias).
   */
  fit?: 'auto' | 'contain' | 'cover';
  /** Inset the sharp photo slightly from the frame (contain only). */
  pad?: boolean;
};

/** Extreme portraits narrower than this share of the frame get a soft widen. */
const MIN_WIDTH_FILL = 0.7;
/** Cap soft-widen so we never aggressively crop. */
const MAX_WIDEN = 1.28;

type PhotoBox = { left: number; top: number; width: number; height: number };

function softEdgeMask(featherPx: number): CSSProperties {
  const f = Math.max(4, Math.round(featherPx));
  const x = `linear-gradient(to right, transparent 0px, #000 ${f}px, #000 calc(100% - ${f}px), transparent 100%)`;
  const y = `linear-gradient(to bottom, transparent 0px, #000 ${f}px, #000 calc(100% - ${f}px), transparent 100%)`;
  return {
    WebkitMaskImage: `${x}, ${y}`,
    WebkitMaskComposite: 'source-in',
    maskImage: `${x}, ${y}`,
    maskComposite: 'intersect',
  };
}

function markComplete(
  image: HTMLImageElement | null,
  onReady: () => void,
) {
  if (image?.complete && image.naturalWidth > 0) onReady();
}

/**
 * Contain/cover media with blurred fill while HD loads.
 * Blur uses `previewSrc` when provided (tiny WebP) so it paints before sharp.
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
  const blurRef = useRef<HTMLImageElement | null>(null);
  const [sharpReady, setSharpReady] = useState(false);
  const [fillReady, setFillReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [photoBox, setPhotoBox] = useState<PhotoBox | null>(null);

  const useContain = fit !== 'cover';
  const fillSrc = (previewSrc ?? '').trim() || src;
  const shown = Boolean(src) && !failed && sharpReady;

  useLayoutEffect(() => {
    setFailed(false);
    setFillReady(false);
    setSharpReady(false);
    setPhotoBox(null);
    // Cache hits often skip onLoad — sync from complete flags.
    markComplete(blurRef.current, () => setFillReady(true));
    markComplete(imageRef.current, () => {
      setSharpReady(true);
      setFillReady(true);
    });
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
        setPhotoBox(null);
        return;
      }

      const inset = pad ? Math.min(8, Math.round(Math.min(boxW, boxH) * 0.04)) : 0;
      const availW = Math.max(1, boxW - inset * 2);
      const availH = Math.max(1, boxH - inset * 2);
      const imgAspect = imgW / imgH;
      const boxAspect = availW / availH;

      let width = imgAspect > boxAspect ? availW : availH * imgAspect;
      let height = imgAspect > boxAspect ? availW / imgAspect : availH;

      const widthFill = width / availW;
      if (widthFill < MIN_WIDTH_FILL) {
        const scale = Math.min(MAX_WIDEN, MIN_WIDTH_FILL / widthFill);
        width *= scale;
        height *= scale;
      }

      setPhotoBox({
        left: inset + (availW - width) / 2,
        top: inset + (availH - height) / 2,
        width,
        height,
      });
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(frame);
    return () => observer.disconnect();
  }, [useContain, shown, src, pad]);

  const feather = photoBox ? Math.min(14, Math.max(6, photoBox.width * 0.06)) : 8;

  return (
    <div
      ref={frameRef}
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
          {/* Blur layer: eager tiny preview so it paints before HD. */}
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
              if (fillSrc !== src) {
                // Keep waiting for sharp; don't blank the tile.
                return;
              }
              setFillReady(false);
            }}
            className={`pointer-events-none absolute inset-0 h-full w-full object-cover blur-xl transition-opacity duration-200 ${
              fillReady ? (shown ? 'opacity-80' : 'opacity-90') : 'opacity-0'
            }`}
            style={{ transform: 'scale(1.28)' }}
          />

          {/* Probe for natural size / load (contain path). */}
          {useContain ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              ref={imageRef}
              src={src}
              alt=""
              aria-hidden
              loading={priority ? 'eager' : 'lazy'}
              decoding="async"
              fetchPriority={priority ? 'high' : 'auto'}
              className="pointer-events-none absolute h-0 w-0 opacity-0"
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
          ) : null}

          {useContain && shown && photoBox ? (
            <div
              className="pointer-events-none absolute z-[1] overflow-hidden rounded-2xl"
              style={{
                left: photoBox.left,
                top: photoBox.top,
                width: photoBox.width,
                height: photoBox.height,
                ...softEdgeMask(feather),
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={src}
                alt={alt}
                className={`h-full w-full object-cover transition-opacity duration-300 ${
                  shown ? 'opacity-100' : 'opacity-0'
                } ${imgClassName}`}
              />
            </div>
          ) : null}

          {!useContain ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              ref={imageRef}
              src={src}
              alt={alt}
              loading={priority ? 'eager' : 'lazy'}
              decoding="async"
              fetchPriority={priority ? 'high' : 'auto'}
              className={`relative z-[1] h-full w-full object-cover transition-opacity duration-300 ${
                shown ? 'opacity-100' : 'opacity-0'
              } ${imgClassName}`}
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
          ) : null}
        </>
      )}
    </div>
  );
}
