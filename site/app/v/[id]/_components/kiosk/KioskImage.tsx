'use client';

import { useLayoutEffect, useRef, useState } from 'react';

type KioskImageProps = {
  src: string;
  alt?: string;
  className?: string;
  imgClassName?: string;
  /** Eager-load + high fetch priority (home logo / LCP). Keep false for grids. */
  priority?: boolean;
};

export function KioskImage({
  src,
  alt = '',
  className = '',
  imgClassName = '',
  priority = false,
}: KioskImageProps) {
  const imageRef = useRef<HTMLImageElement | null>(null);
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);
  const shown = Boolean(src) && loadedSrc === src;

  useLayoutEffect(() => {
    const image = imageRef.current;
    if (image?.complete) {
      setLoadedSrc(src);
    }
  }, [src]);

  return (
    <div className={`relative overflow-hidden ${className}`}>
      {!shown ? <div className="absolute inset-0 animate-pulse bg-neutral-200" aria-hidden /> : null}
      {src ? (
        <img
          ref={imageRef}
          src={src}
          alt={alt}
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
          fetchPriority={priority ? 'high' : 'auto'}
          className={`relative h-full w-full object-cover ${shown ? 'opacity-100' : 'opacity-0'} ${imgClassName}`}
          onLoad={() => setLoadedSrc(src)}
          onError={() => setLoadedSrc(src)}
        />
      ) : null}
    </div>
  );
}
