'use client';

import { LayoutGrid } from 'lucide-react';

import { VARIANT_WIDTHS } from '../../../../_lib/optimize-storage-image';
import { ChatHorizontalScroller } from './ChatHorizontalScroller';
import { ChatThumbImage } from './ChatThumbImage';
import type { ChatCatalogCategory } from './chat-types';

type ChatCategoryCarouselProps = {
  categories: ChatCatalogCategory[];
  onSelectCategory: (categoryId: string) => void;
  /** Trueno-style “Ver todos” when more categories remain. */
  onSeeAll?: () => void;
  seeAllLabel?: string;
};

/**
 * Meta / WhatsApp Business–style category tiles: portrait covers (3:4),
 * full-bleed image, bottom caption gradient, soft count pill.
 *
 * Outer element is a div (not button) so nested "Reintentar" on failed thumbs
 * remains clickable — nested <button> inside <button> breaks pointer events.
 */
export function ChatCategoryCarousel({
  categories,
  onSelectCategory,
  onSeeAll,
  seeAllLabel = 'Ver todas las categorías',
}: ChatCategoryCarouselProps) {
  if (categories.length === 0) return null;
  const canSeeAll = typeof onSeeAll === 'function';

  return (
    <div data-chat-category-carousel="1">
      <ChatHorizontalScroller ariaLabel="Categorías del menú" className="py-1">
        {categories.map((c, index) => (
          <div
            key={c.id}
            role="button"
            tabIndex={0}
            data-chat-category={c.id}
            data-chat-category-card="1"
            onClick={() => onSelectCategory(c.id)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onSelectCategory(c.id);
              }
            }}
            aria-label={`${c.name}, ${c.availableCount} disponibles`}
            className="relative aspect-[3/4] w-[120px] shrink-0 cursor-pointer snap-start overflow-hidden rounded-2xl bg-[var(--chat-input)] text-left shadow-[0_6px_18px_rgba(0,0,0,0.22)] transition active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-send)]"
          >
            <span className="absolute inset-0">
              <ChatThumbImage
                src={c.imageUrl}
                sourceUrl={c.imageSourceUrl || c.imageUrl}
                displayWidth={VARIANT_WIDTHS.card}
                priority={index < 3}
                fallbackLetter={c.name}
                className="h-full w-full object-cover object-center"
              />
            </span>
            {/* Soft vignette so titles stay readable (Meta catalog feel). */}
            <span
              className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-[48%] bg-gradient-to-t from-black/75 via-black/35 to-transparent"
              aria-hidden
            />
            <span
              className="pointer-events-none absolute right-2 top-2 z-10 rounded-full bg-black/45 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums leading-4 text-white backdrop-blur-[2px]"
              aria-hidden
            >
              {c.productCount}
            </span>
            <span className="pointer-events-none absolute inset-x-0 bottom-0 z-10 px-2.5 pb-2.5 pt-6">
              <span className="line-clamp-2 text-[12.5px] font-semibold leading-tight tracking-wide text-white drop-shadow-sm">
                {c.name}
              </span>
            </span>
          </div>
        ))}
        {canSeeAll ? (
          <button
            type="button"
            data-chat-see-all-categories-inline="1"
            onClick={onSeeAll}
            className="flex w-[112px] shrink-0 snap-start flex-col items-center justify-center gap-2 self-stretch rounded-xl border border-[var(--chat-card-border)] bg-[color-mix(in_srgb,var(--chat-send)_12%,var(--chat-card))] px-2 text-center shadow-sm transition active:scale-[0.98] active:opacity-90"
          >
            <span
              className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--chat-send)] text-[var(--chat-send-fg)] shadow-sm"
              aria-hidden
            >
              <LayoutGrid className="h-5 w-5" strokeWidth={2.1} />
            </span>
            <span className="text-[12px] font-semibold leading-tight text-[var(--chat-text)]">
              Ver todos
            </span>
          </button>
        ) : null}
      </ChatHorizontalScroller>
      {canSeeAll ? (
        <div className="px-3 pb-1 pt-1.5">
          <button
            type="button"
            data-chat-see-all-categories="1"
            onClick={onSeeAll}
            className="inline-flex w-full min-h-[42px] items-center justify-center gap-2 rounded-full bg-[var(--chat-send)] px-4 py-2 text-[13px] font-semibold text-[var(--chat-send-fg)] shadow-sm active:opacity-90"
          >
            <LayoutGrid className="h-4 w-4 shrink-0" strokeWidth={2.1} aria-hidden />
            {seeAllLabel}
          </button>
        </div>
      ) : null}
    </div>
  );
}
