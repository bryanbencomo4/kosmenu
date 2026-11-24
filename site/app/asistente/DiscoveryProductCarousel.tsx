'use client';

import Link from 'next/link';
import { ShoppingBag, Store } from 'lucide-react';

import { ChatHorizontalScroller } from '../v/[id]/_components/chat/ChatHorizontalScroller';
import { ChatThumbImage } from '../v/[id]/_components/chat/ChatThumbImage';
import type { DiscoveryUiProduct } from './discovery-products';

type DiscoveryProductCarouselProps = {
  products: DiscoveryUiProduct[];
  seeMenusLabel?: string;
  onSeeMenus?: () => void;
};

const btnBuy =
  'inline-flex w-full items-center justify-center gap-1 rounded-lg bg-[var(--chat-send)] px-2 py-1.5 text-[12px] font-semibold text-[var(--chat-send-fg)] active:opacity-90';

/**
 * Buy-first dish cards for discovery: photo, price, restaurant logo+name, CTA.
 */
export function DiscoveryProductCarousel({
  products,
  seeMenusLabel = 'Ver menús de restaurantes',
  onSeeMenus,
}: DiscoveryProductCarouselProps) {
  if (products.length === 0) return null;
  const canSeeMenus = typeof onSeeMenus === 'function';

  return (
    <div data-discovery-product-carousel="1" className="w-full max-w-full">
      <ChatHorizontalScroller ariaLabel="Platos recomendados" className="py-1">
        {products.map((p, index) => (
          <article
            key={p.id}
            data-discovery-product={p.id}
            data-chat-product-card={p.id}
            className="flex w-[168px] shrink-0 snap-start flex-col overflow-hidden rounded-xl border border-[var(--chat-card-border)] bg-[var(--chat-card)] shadow-sm"
          >
            <div className="relative h-[118px] w-full shrink-0 bg-[var(--chat-input)]">
              <ChatThumbImage
                src={p.imageUrl}
                sourceUrl={p.imageUrl}
                priority={index < 3}
                fallbackLetter={p.name}
                className="h-full w-full object-cover object-center"
              />
              <span className="absolute left-1.5 top-1.5 rounded-full bg-[var(--chat-send)] px-2 py-0.5 text-[11px] font-extrabold tabular-nums text-[var(--chat-send-fg)] shadow-sm">
                {p.priceLabel}
              </span>
              {p.compareAtLabel ? (
                <span className="absolute bottom-1.5 right-1.5 rounded bg-black/55 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-white/85 line-through">
                  {p.compareAtLabel}
                </span>
              ) : null}
            </div>

            <div className="flex min-h-0 flex-1 flex-col p-2">
              <h3 className="line-clamp-2 min-h-[2.2rem] text-[13px] font-semibold leading-snug text-[var(--chat-text)]">
                {p.name}
              </h3>

              <div className="mt-1.5 flex items-center gap-1.5">
                <span className="relative h-6 w-6 shrink-0 overflow-hidden rounded-full bg-[var(--chat-input)] ring-1 ring-[var(--chat-card-border)]">
                  {p.restaurantLogoUrl ? (
                    <ChatThumbImage
                      src={p.restaurantLogoUrl}
                      sourceUrl={p.restaurantLogoUrl}
                      fallbackLetter={p.restaurantName}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="grid h-full w-full place-items-center text-[var(--chat-text-muted)]">
                      <Store className="h-3 w-3" aria-hidden />
                    </span>
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[11px] font-medium leading-tight text-[var(--chat-text)]">
                    {p.restaurantName}
                  </span>
                  {p.isOpen === true ? (
                    <span className="text-[10px] font-semibold text-emerald-500">Abierto</span>
                  ) : p.isOpen === false ? (
                    <span className="text-[10px] text-[var(--chat-text-muted)]">Cerrado</span>
                  ) : null}
                </span>
              </div>

              <div className="mt-auto pt-1.5">
                <Link
                  href={p.menuUrl}
                  className={btnBuy}
                  data-testid={`discovery-buy-${p.restaurantSlug}`}
                >
                  <ShoppingBag className="h-3.5 w-3.5 shrink-0" strokeWidth={2.2} aria-hidden />
                  <span>Pedir ahora</span>
                </Link>
              </div>
            </div>
          </article>
        ))}

        {canSeeMenus ? (
          <button
            type="button"
            data-discovery-see-menus="1"
            onClick={onSeeMenus}
            className="flex w-[112px] shrink-0 snap-start flex-col items-center justify-center gap-2 self-stretch rounded-xl border border-[var(--chat-card-border)] bg-[color-mix(in_srgb,var(--chat-send)_12%,var(--chat-card))] px-2 text-center shadow-sm transition active:scale-[0.98] active:opacity-90"
          >
            <Store className="h-6 w-6 text-[var(--chat-send)]" aria-hidden />
            <span className="text-[12px] font-semibold leading-snug text-[var(--chat-text)]">
              {seeMenusLabel}
            </span>
          </button>
        ) : null}
      </ChatHorizontalScroller>
    </div>
  );
}
