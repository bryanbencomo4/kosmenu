'use client';

import { X } from 'lucide-react';
import { useEffect } from 'react';

export type ChatMediaLightboxState = {
  src: string;
  alt?: string | null;
} | null;

type ChatMediaLightboxProps = {
  media: ChatMediaLightboxState;
  onClose: () => void;
};

/** Full-bleed image viewer (WhatsApp-like). */
export function ChatMediaLightbox({ media, onClose }: ChatMediaLightboxProps) {
  useEffect(() => {
    if (!media) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [media, onClose]);

  if (!media?.src) return null;

  return (
    <div
      className="fixed inset-0 z-[90] flex flex-col bg-black"
      role="dialog"
      aria-modal="true"
      aria-label={media.alt || 'Imagen'}
      data-chat-media-lightbox="1"
    >
      <div className="flex shrink-0 items-center justify-between px-2 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
        <p className="min-w-0 truncate px-2 text-[14px] font-medium text-white/90">
          {media.alt || 'Foto'}
        </p>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-10 w-10 items-center justify-center rounded-full text-white hover:bg-white/10"
          aria-label="Cerrar"
          data-chat-media-lightbox-close="1"
        >
          <X className="h-6 w-6" strokeWidth={2} />
        </button>
      </div>
      <button
        type="button"
        className="flex min-h-0 flex-1 items-center justify-center px-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
        onClick={onClose}
        aria-label="Cerrar imagen"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={media.src}
          alt={media.alt || ''}
          className="max-h-full max-w-full object-contain"
          data-chat-media-lightbox-img="1"
          onClick={(event) => event.stopPropagation()}
        />
      </button>
    </div>
  );
}
