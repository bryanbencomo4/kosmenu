'use client';

import { ChatHorizontalScroller } from './ChatHorizontalScroller';
import { ChatThumbImage } from './ChatThumbImage';
import type { ChatCatalogCategory } from './chat-types';

type ChatCategoryCarouselProps = {
  categories: ChatCatalogCategory[];
  onSelectCategory: (categoryId: string) => void;
};

export function ChatCategoryCarousel({
  categories,
  onSelectCategory,
}: ChatCategoryCarouselProps) {
  if (categories.length === 0) return null;
  return (
    <div data-chat-category-carousel="1">
    <ChatHorizontalScroller ariaLabel="Categorías del menú" className="py-1">
      {categories.map((c, index) => (
        <button
          key={c.id}
          type="button"
          data-chat-category={c.id}
          data-chat-category-card="1"
          onClick={() => onSelectCategory(c.id)}
          aria-label={`${c.name}, ${c.availableCount} disponibles`}
          className="relative flex h-[118px] w-[120px] shrink-0 snap-start flex-col items-center justify-center gap-1.5 rounded-xl border border-[var(--chat-card-border)] bg-[var(--chat-card)] px-2 py-2 text-center shadow-sm transition active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-send)]"
        >
          <span className="relative block h-[70px] w-[70px] shrink-0 overflow-hidden rounded-lg bg-[var(--chat-input)]">
            <ChatThumbImage
              src={c.imageUrl}
              sourceUrl={c.imageSourceUrl || c.imageUrl}
              priority={index < 3}
              fallbackLetter={c.name}
            />
          </span>
          <span className="line-clamp-1 w-full text-[12.5px] font-semibold leading-tight text-[var(--chat-text)]">
            {c.name}
          </span>
          <span
            className="absolute right-1.5 top-1.5 rounded-full bg-[var(--chat-send)] px-1.5 py-px text-[10px] font-semibold tabular-nums leading-4 text-[var(--chat-send-fg)]"
            aria-hidden
          >
            {c.productCount}
          </span>
        </button>
      ))}
    </ChatHorizontalScroller>
    </div>
  );
}
