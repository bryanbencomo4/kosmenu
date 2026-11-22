'use client';

import { Plus, Settings2 } from 'lucide-react';

import { findProductImageEl, flyToCart } from './chat-fly-to-cart';
import type { ChatProductCardData } from './chat-types';

type ChatProductCardProps = {
  card: ChatProductCardData;
  onConfigure?: (productId: string) => void;
  onAddSimple?: (productId: string) => void;
  /** Skip outer chrome when embedded in a proposal card. */
  bare?: boolean;
};

export function ChatProductCard({
  card,
  onConfigure,
  onAddSimple,
  bare = false,
}: ChatProductCardProps) {
  const showAdd =
    card.available &&
    !card.requires_configuration &&
    typeof onAddSimple === 'function';
  const showConfigure =
    card.available &&
    card.requires_configuration &&
    typeof onConfigure === 'function';

  const options =
    card.selected_options && card.selected_options.length > 0
      ? card.selected_options.join(' · ')
      : null;

  return (
    <article
      className={
        bare
          ? ''
          : 'overflow-hidden rounded-xl border border-[var(--chat-card-border)] bg-[var(--chat-card)] shadow-sm'
      }
      data-chat-product-card={card.product_id}
    >
      <div className="flex gap-2.5 p-2">
        <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-[var(--chat-input)]">
          {card.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={card.image_url}
              alt=""
              className="h-full w-full object-cover"
              loading="lazy"
            />
          ) : (
            <div
              className="flex h-full w-full items-center justify-center text-base font-semibold text-[var(--chat-text-muted)]"
              aria-hidden
            >
              {(card.name || '?').slice(0, 1).toUpperCase()}
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[14px] font-semibold leading-snug text-[var(--chat-text)]">
            {card.name}
            {card.quantity && card.quantity > 1 ? (
              <span className="ml-1 text-[12px] font-medium text-[var(--chat-text-muted)]">
                ×{card.quantity}
              </span>
            ) : null}
          </h3>
          {options ? (
            <p className="mt-0.5 truncate text-[12px] leading-snug text-[var(--chat-text-muted)]">
              {options}
            </p>
          ) : card.description ? (
            <p className="mt-0.5 line-clamp-1 text-[12px] leading-snug text-[var(--chat-text-muted)]">
              {card.description}
            </p>
          ) : null}
          <p className="mt-1 text-[13px] font-semibold tabular-nums text-[var(--chat-text)]">
            {card.price_label ||
              (card.price_unit != null
                ? `${card.price_unit} ${card.currency}`
                : 'Ver precio')}
            {card.quantity && card.quantity > 1 && card.line_total_label ? (
              <span className="ml-1.5 text-[11px] font-medium text-[var(--chat-text-muted)]">
                · {card.line_total_label}
              </span>
            ) : null}
          </p>
          {!card.available ? (
            <p className="mt-0.5 text-[11px] font-medium text-amber-600 dark:text-amber-300">
              No disponible
            </p>
          ) : null}
        </div>
      </div>
      {(showAdd || showConfigure) && (
        <div className="flex gap-2 border-t border-[var(--chat-card-border)] px-2 py-1.5">
          {showConfigure ? (
            <button
              type="button"
              data-chat-configure={card.product_id}
              className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg bg-[var(--chat-send)] px-2 py-1.5 text-[12px] font-semibold text-[var(--chat-send-fg)]"
              onClick={() => onConfigure?.(card.product_id)}
            >
              <Settings2 className="h-3.5 w-3.5 shrink-0" strokeWidth={2.2} aria-hidden />
              Opciones
            </button>
          ) : null}
          {showAdd ? (
            <button
              type="button"
              className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg bg-[var(--chat-send)] px-2 py-1.5 text-[12px] font-semibold text-[var(--chat-send-fg)]"
              data-chat-add-simple={card.product_id}
              onClick={(e) => {
                void flyToCart({
                  source: findProductImageEl(e.currentTarget),
                  imageUrl: card.image_url,
                });
                onAddSimple?.(card.product_id);
              }}
            >
              <Plus className="h-3.5 w-3.5 shrink-0" strokeWidth={2.4} aria-hidden />
              Agregar
            </button>
          ) : null}
        </div>
      )}
    </article>
  );
}
