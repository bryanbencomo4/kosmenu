'use client';

import { LayoutGrid, Plus, Settings2 } from 'lucide-react';
import type { MouseEvent } from 'react';

import { ChatHorizontalScroller } from './ChatHorizontalScroller';
import { ChatThumbImage } from './ChatThumbImage';
import { findProductImageEl, flyToCart } from './chat-fly-to-cart';
import type { ChatProductCardData } from './chat-types';

type ChatProductCarouselProps = {
  products: ChatProductCardData[];
  onConfigure?: (productId: string) => void;
  onAddSimple?: (productId: string) => void;
  onOpenImage?: (src: string, alt: string) => void;
  onSeeAll?: () => void;
  seeAllLabel?: string;
};

const btnPrimary =
  'inline-flex w-full items-center justify-center gap-1 rounded-lg bg-[var(--chat-send)] px-2 py-1.5 text-[12px] font-semibold text-[var(--chat-send-fg)] active:opacity-90';

export function ChatProductCarouselCard({
  card,
  onConfigure,
  onAddSimple,
  onOpenImage,
  priority = false,
}: {
  card: ChatProductCardData;
  onConfigure?: (productId: string) => void;
  onAddSimple?: (productId: string) => void;
  onOpenImage?: (src: string, alt: string) => void;
  priority?: boolean;
}) {
  const canConfigure =
    card.available && card.requires_configuration && typeof onConfigure === 'function';
  const canAdd =
    card.available && !card.requires_configuration && typeof onAddSimple === 'function';
  const price =
    card.price_label ||
    (card.price_unit != null ? `${card.price_unit} ${card.currency}` : 'Ver precio');

  const handleAdd = (e: MouseEvent<HTMLButtonElement>) => {
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
      <button
        type="button"
        className="relative h-[110px] w-full shrink-0 bg-[var(--chat-input)]"
        disabled={!card.image_url || !onOpenImage}
        onClick={() => {
          if (card.image_url) onOpenImage?.(card.image_url, card.name);
        }}
        aria-label={card.image_url ? `Ver foto de ${card.name}` : undefined}
        data-chat-product-image="1"
      >
        <ChatThumbImage
          src={card.image_url}
          sourceUrl={card.image_source_url || card.image_url}
          priority={priority}
          fallbackLetter={card.name}
        />
        {!card.available ? (
          <span className="absolute left-1.5 top-1.5 rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-semibold text-white">
            No disponible
          </span>
        ) : null}
      </button>
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
              className={btnPrimary}
            >
              <Settings2 className="h-3.5 w-3.5 shrink-0" strokeWidth={2.2} aria-hidden />
              <span>Opciones</span>
            </button>
          ) : canAdd ? (
            <button
              type="button"
              data-chat-add-simple={card.product_id}
              onClick={handleAdd}
              className={btnPrimary}
            >
              <Plus className="h-3.5 w-3.5 shrink-0" strokeWidth={2.4} aria-hidden />
              <span>Agregar</span>
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
  onOpenImage,
  onSeeAll,
  seeAllLabel = 'Ver todos los productos',
}: ChatProductCarouselProps) {
  if (products.length === 0) return null;
  const canSeeAll = typeof onSeeAll === 'function';
  return (
    <div data-chat-product-carousel="1">
      <ChatHorizontalScroller ariaLabel="Productos" className="py-1">
        {products.map((card, index) => (
          <ChatProductCarouselCard
            key={card.product_id}
            card={card}
            onConfigure={onConfigure}
            onAddSimple={onAddSimple}
            onOpenImage={onOpenImage}
            priority={index < 2}
          />
        ))}
        {canSeeAll ? (
          <button
            type="button"
            data-chat-see-all-inline="1"
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
            data-chat-see-all="1"
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
