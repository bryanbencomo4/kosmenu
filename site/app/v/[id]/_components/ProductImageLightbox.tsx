'use client';

import { useEffect, useState, type CSSProperties } from 'react';

type ProductImageLightboxProps = {
  src: string;
  /** Already-cached smaller variant shown blurred while hi-res loads. */
  previewSrc?: string | null;
  alt: string;
  title: string;
  description?: string;
  titleFontStyle?: CSSProperties;
  onClose: () => void;
};

export function ProductImageLightbox({
  src,
  previewSrc,
  alt,
  title,
  description,
  titleFontStyle,
  onClose,
}: ProductImageLightboxProps) {
  const [hiResReady, setHiResReady] = useState(false);

  useEffect(() => {
    setHiResReady(false);
  }, [src]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const preview = (previewSrc ?? '').trim() || null;

  return (
    <section
      className="fixed inset-0 z-[160] flex items-center justify-center bg-black/88 p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      aria-busy={!hiResReady}
      onClick={onClose}
    >
      <div className="relative mx-auto flex h-full w-full max-w-5xl flex-col items-center justify-center">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-0 top-0 z-10 rounded-full border border-white/30 bg-black/50 px-3 py-1.5 text-xs font-semibold text-white sm:right-2 sm:top-2"
        >
          Cerrar
        </button>
        <div
          className="flex max-h-full w-full flex-col items-center"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="relative flex w-full max-h-[min(72vh,720px)] min-h-[min(42vh,360px)] items-center justify-center overflow-hidden rounded-2xl bg-black/35">
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={preview}
                alt=""
                aria-hidden
                className={`pointer-events-none absolute inset-0 h-full w-full scale-110 object-cover blur-2xl transition-opacity duration-300 ${
                  hiResReady ? 'opacity-35' : 'opacity-55'
                }`}
              />
            ) : null}

            {!hiResReady ? (
              <div className="absolute inset-0 z-[1] grid place-items-center" aria-hidden>
                <div className="h-9 w-9 animate-spin rounded-full border-2 border-white/25 border-t-white" />
              </div>
            ) : null}

            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt={alt}
              loading="eager"
              decoding="async"
              fetchPriority="high"
              className={`relative z-[2] max-h-[min(72vh,720px)] w-full object-contain object-center transition-opacity duration-300 ${
                hiResReady ? 'opacity-100' : 'opacity-0'
              }`}
              onLoad={() => setHiResReady(true)}
              onError={() => setHiResReady(true)}
            />
          </div>
          <div className="mt-3 w-full max-w-2xl rounded-2xl bg-black/55 px-4 py-3 text-white">
            <h3 className="text-base font-black md:text-lg" style={titleFontStyle}>
              {title}
            </h3>
            {description ? (
              <p className="mt-1 text-sm text-white/90">{description}</p>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
