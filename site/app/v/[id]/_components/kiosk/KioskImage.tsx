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
   * `contain` (default) = full photo in frame with theme letterbox.
   * `cover` = fill frame (logos only).
   * `auto` = treated as `contain` (legacy alias).
   */
  fit?: 'auto' | 'contain' | 'cover';
  /** Inner padding for contain mode (keeps cards uniform while photos breathe). */
  pad?: boolean;
};

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
        // eslint-disable-next-line @next/next/no-img-element
        <img
          ref={imageRef}
          src={src}
          alt={alt}
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
          fetchPriority={priority ? 'high' : 'auto'}
          className={`relative h-full w-full transition-opacity duration-200 ${
            useContain ? 'object-contain' : 'object-cover'
          } ${useContain && pad ? 'p-2 sm:p-2.5' : ''} ${
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
      )}
    </div>
  );
}
