'use client';

import { useRef } from 'react';

export type PhotoTarget = {
  productId: string;
  productName: string;
  imageUrl?: string | null;
};

/** In-chat photo picker: gallery or camera for one specific product. */
export function BusinessPhotoPickerCard({
  target,
  disabled,
  onPick,
}: {
  target: PhotoTarget;
  disabled?: boolean;
  onPick: (file: File, previewUrl: string, target: PhotoTarget) => void;
}) {
  const galleryRef = useRef<HTMLInputElement | null>(null);
  const cameraRef = useRef<HTMLInputElement | null>(null);

  const handle = (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    onPick(file, URL.createObjectURL(file), target);
  };

  return (
    <div
      className="mt-1.5 w-full max-w-[min(92%,22rem)] overflow-hidden rounded-xl border border-[var(--chat-card-border)] bg-[var(--chat-card)] p-3 shadow-sm"
      data-business-photo-picker="1"
    >
      <div className="flex items-center gap-3">
        {target.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={target.imageUrl}
            alt=""
            className="h-14 w-14 shrink-0 rounded-lg object-cover"
          />
        ) : (
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-[var(--chat-input)] text-xl">
            🖼️
          </div>
        )}
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold text-[var(--chat-text)]">
            {target.productName}
          </p>
          <p className="text-[12px] text-[var(--chat-text-muted)]">
            {target.imageUrl ? 'Foto actual' : 'Aún sin foto'}
          </p>
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          disabled={disabled}
          onClick={() => galleryRef.current?.click()}
          className="inline-flex flex-1 items-center justify-center rounded-lg bg-[var(--chat-send)] px-3 py-2 text-[12px] font-semibold text-[var(--chat-send-fg)] disabled:opacity-50"
        >
          🖼️ Galería
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => cameraRef.current?.click()}
          className="inline-flex flex-1 items-center justify-center rounded-lg border border-[var(--chat-card-border)] bg-[var(--chat-input)] px-3 py-2 text-[12px] font-semibold text-[var(--chat-text)] disabled:opacity-50"
        >
          📸 Cámara
        </button>
      </div>
      <input
        ref={galleryRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          handle(e.target.files);
          e.target.value = '';
        }}
      />
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          handle(e.target.files);
          e.target.value = '';
        }}
      />
    </div>
  );
}
