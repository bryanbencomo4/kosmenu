'use client';

import { useLayoutEffect, useRef, useState } from 'react';

type KioskImageProps = {
  src: string;
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

/**
 * Contain-first media tile: sharp centered photo + same-URL blurred cover fill
 * so letterbox sides never look empty. Browser cache reuses one network fetch.
 */
export function KioskImage({
  src,
  alt = '',
  className = '',
  imgClassName = '',
  priority = false,
  fit = 'contain',
  pad = true,
}: KioskImageProps) {
  const imageRef = useRef<HTMLImageElement | null>(null);
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  const useContain = fit !== 'cover';
  const shown = Boolean(src) && !failed && loadedSrc === src;

  useLayoutEffect(() => {
    setFailed(false);
    const image = imageRef.current;
    if (image?.complete && image.naturalWidth > 0) {
      setLoadedSrc(src);
    } else {
      setLoadedSrc(null);
    }
  }, [src]);

  return (
    <div
      className={`relative overflow-hidden ${className}`}
      style={
        useContain
          ? { backgroundColor: 'var(--menu-surface-alt, #f3f4f6)' }
          : undefined
      }
    >
      {!shown && !failed ? (
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
            // Same optimized URL as the sharp layer — cache hit, no second original download.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={src}
              alt=""
              aria-hidden
              loading={priority ? 'eager' : 'lazy'}
              decoding="async"
              className={`pointer-events-none absolute inset-0 h-full w-full scale-125 object-cover blur-xl transition-opacity duration-200 ${
                shown ? 'opacity-80' : 'opacity-0'
              }`}
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
            className={`relative z-[1] h-full w-full transition-opacity duration-200 ${
              useContain ? 'object-contain object-center' : 'object-cover'
            } ${useContain && pad ? 'p-1.5 sm:p-2' : ''} ${
              shown ? 'opacity-100' : 'opacity-0'
            } ${imgClassName}`}
            onLoad={() => {
              setFailed(false);
              setLoadedSrc(src);
            }}
            onError={() => {
              setFailed(true);
              setLoadedSrc(src);
            }}
          />
        </>
      )}
    </div>
  );
}
