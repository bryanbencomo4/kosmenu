'use client';

import type { MouseEvent } from 'react';

import { ChatHorizontalScroller } from './ChatHorizontalScroller';
import { findProductImageEl, flyToCart } from './chat-fly-to-cart';
import type { ChatProductCardData } from './chat-types';

type ChatProductCarouselProps = {
  products: ChatProductCardData[];
  onConfigure?: (productId: string) => void;
  onAddSimple?: (productId: string) => void;
  onSeeAll?: () => void;
  seeAllLabel?: string;
};

export function ChatProductCarouselCard({
  card,
  onConfigure,
  onAddSimple,
}: {
  card: ChatProductCardData;
  onConfigure?: (productId: string) => void;
  onAddSimple?: (productId: string) => void;
}) {
  const canConfigure =
    card.available && card.requires_configuration && typeof onConfigure === 'function';
  const canAdd =
    card.available && !card.requires_configuration && typeof onAddSimple === 'function';
  const price =
    card.price_label ||
    (card.price_unit != null ? `${card.price_unit} ${card.currency}` : 'Ver precio');

  const handleAdd = (e: MouseEvent<HTMLButtonElement>) => {
    // Visual only: grab the image rect first, then add via the normal path.
    void flyToCart({
      source: findProductImageEl(e.currentTarget),
      imageUrl: card.image_url,
    });
    onAddSimple?.(card.product_id);
  };

  return (
    <article
      data-chat-product-card={card.product_id}
      className={`flex w-[168px] shrink-0 snap-start flex-col overflow-hidden rounded-xl border border-[var(--chat-card-border)] bg-[var(--chat-card)] shadow-sm ${
        card.available ? '' : 'opacity-70'
      }`}
    >
      <div className="relative h-[110px] w-full shrink-0 bg-[var(--chat-input)]">
        {card.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={card.image_url}
            alt=""
            className="h-full w-full object-cover"
            loading="lazy"
            draggable={false}
          />
        ) : (
          <div
            className="flex h-full w-full items-center justify-center text-3xl font-semibold text-[var(--chat-text-muted)]"
            aria-hidden
          >
            {(card.name || '?').slice(0, 1).toUpperCase()}
          </div>
        )}
        {!card.available ? (
          <span className="absolute left-1.5 top-1.5 rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-semibold text-white">
            No disponible
          </span>
        ) : null}
      </div>
      <div className="flex min-h-0 flex-1 flex-col p-2">
        <h3 className="line-clamp-1 text-[13px] font-semibold leading-snug text-[var(--chat-text)]">
          {card.name}
        </h3>
        <p className="mt-0.5 line-clamp-2 min-h-[2.1rem] text-[11.5px] leading-[1.05rem] text-[var(--chat-text-muted)]">
          {card.description || ''}
        </p>
        <p className="mt-1 text-[13px] font-semibold tabular-nums text-[var(--chat-text)]">
          {price}
        </p>
        <div className="mt-auto pt-1.5">
          {canConfigure ? (
            <button
              type="button"
              data-chat-configure={card.product_id}
              onClick={() => onConfigure?.(card.product_id)}
              className="w-full rounded-lg bg-[var(--chat-send)] px-2 py-1.5 text-[12px] font-semibold text-[var(--chat-send-fg)] active:opacity-90"
            >
              Elegir opciones
            </button>
          ) : canAdd ? (
            <button
              type="button"
              data-chat-add-simple={card.product_id}
              onClick={handleAdd}
              className="w-full rounded-lg border border-[var(--chat-card-border)] bg-[var(--chat-input)] px-2 py-1.5 text-[12px] font-semibold text-[var(--chat-text)] active:opacity-90"
            >
              Agregar
            </button>
          ) : (
            <div className="h-[30px]" aria-hidden />
          )}
        </div>
      </div>
    </article>
  );
}

export function ChatProductCarousel({
  products,
  onConfigure,
  onAddSimple,
  onSeeAll,
  seeAllLabel = 'Ver todos los productos',
}: ChatProductCarouselProps) {
  if (products.length === 0) return null;
  const canSeeAll = typeof onSeeAll === 'function';
  return (
    <div data-chat-product-carousel="1">
      <ChatHorizontalScroller ariaLabel="Productos" className="py-1">
        {products.map((card) => (
          <ChatProductCarouselCard
            key={card.product_id}
            card={card}
            onConfigure={onConfigure}
            onAddSimple={onAddSimple}
          />
        ))}
        {canSeeAll ? (
          // Card-sized tail chip: visible while swiping, no need to reach the bottom button.
          <button
            type="button"
            data-chat-see-all-inline="1"
            onClick={onSeeAll}
            className="flex w-[104px] shrink-0 snap-start flex-col items-center justify-center gap-1 self-stretch rounded-xl border border-dashed border-[var(--chat-card-border)] bg-[var(--chat-card)] px-2 text-center text-[12px] font-semibold text-[var(--chat-text)] shadow-sm active:opacity-90"
          >
            <span className="text-[18px] leading-none" aria-hidden>
              →
            </span>
            <span>Ver todos</span>
          </button>
        ) : null}
      </ChatHorizontalScroller>
      {canSeeAll ? (
        // In-flow (not sticky): sticky bottom stuck to the message scroller and
        // disappeared under the composer on phones. Always visible under the rail.
        <div className="px-3 pb-1 pt-1.5">
          <button
            type="button"
            data-chat-see-all="1"
            onClick={onSeeAll}
            className="flex w-full min-h-[40px] items-center justify-center rounded-full border border-[var(--chat-card-border)] bg-[var(--chat-card)] px-4 py-2 text-[12.5px] font-semibold text-[var(--chat-text)] shadow-sm active:opacity-90"
          >
            {seeAllLabel}
          </button>
        </div>
      ) : null}
    </div>
  );
}
