'use client';

import Link from 'next/link';
import { Store } from 'lucide-react';

import { ChatHorizontalScroller } from '../v/[id]/_components/chat/ChatHorizontalScroller';
import { ChatThumbImage } from '../v/[id]/_components/chat/ChatThumbImage';

import type { DiscoveryUiDish } from './discovery-products';

export type DiscoveryUiRestaurant = {
  id: string;
  slug: string;
  nombre: string;
  /** Real commerce logo (thumbnail). */
  logoUrl: string | null;
  /** Hero / cover photo for restaurant cards. */
  coverUrl?: string | null;
  categoria: string | null;
  direccion: string | null;
  zonaOperacion: string | null;
  menuUrl: string;
  chatUrl: string | null;
  isOpen: boolean | null;
  openLabel: string | null;
  distanceKm: number | null;
  ratingAverage?: number;
  ratingCount?: number;
  currencies?: string[];
  showcaseDishes?: DiscoveryUiDish[];
};

type DiscoveryRestaurantCarouselProps = {
  restaurants: DiscoveryUiRestaurant[];
  onOpenMenu?: (restaurant: DiscoveryUiRestaurant) => void;
};

const btnPrimary =
  'inline-flex w-full items-center justify-center gap-1 rounded-lg bg-[var(--chat-send)] px-2 py-1.5 text-[12px] font-semibold text-[var(--chat-send-fg)] active:opacity-90';

function openBadge(restaurant: DiscoveryUiRestaurant) {
  if (restaurant.isOpen === true) {
    return { label: restaurant.openLabel || 'Abierto', tone: 'open' as const };
  }
  if (restaurant.isOpen === false) {
    return { label: restaurant.openLabel || 'Cerrado', tone: 'closed' as const };
  }
  return { label: 'Horario no confirmado', tone: 'unknown' as const };
}

/**
 * Same card chrome as ChatProductCarouselCard: top photo, title, meta, primary CTA.
 */
export function DiscoveryRestaurantCarousel({
  restaurants,
  onOpenMenu,
}: DiscoveryRestaurantCarouselProps) {
  if (restaurants.length === 0) return null;

  return (
    <div data-discovery-restaurant-carousel="1" className="w-full max-w-full">
      <ChatHorizontalScroller ariaLabel="Restaurantes encontrados" className="py-1">
        {restaurants.map((r, index) => {
          const badge = openBadge(r);
          const zone = r.zonaOperacion || r.direccion;
          const metaParts = [
            badge.label,
            r.categoria,
            r.distanceKm != null && Number.isFinite(r.distanceKm)
              ? `~${r.distanceKm < 10 ? r.distanceKm.toFixed(1) : Math.round(r.distanceKm)} km`
              : null,
          ].filter(Boolean);
          return (
            <article
              key={r.id}
              data-discovery-restaurant={r.slug}
              data-chat-product-card={r.slug}
              className="flex w-[168px] shrink-0 snap-start flex-col overflow-hidden rounded-xl border border-[var(--chat-card-border)] bg-[var(--chat-card)] shadow-sm"
            >
              <div className="relative h-[110px] w-full shrink-0 bg-[var(--chat-input)]">
                {r.coverUrl || r.logoUrl ? (
                  <ChatThumbImage
                    src={r.coverUrl || r.logoUrl}
                    sourceUrl={r.coverUrl || r.logoUrl}
                    priority={index < 3}
                    fallbackLetter={r.nombre}
                    className="h-full w-full object-cover object-center"
                  />
                ) : (
                  <span className="grid h-full w-full place-items-center text-[var(--chat-text-muted)]">
                    <Store className="h-8 w-8" aria-hidden />
                  </span>
                )}
                <span
                  className={`absolute left-1.5 top-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold text-white ${
                    badge.tone === 'open'
                      ? 'bg-emerald-600/90'
                      : badge.tone === 'closed'
                        ? 'bg-rose-600/90'
                        : 'bg-black/70'
                  }`}
                >
                  {badge.tone === 'open' ? 'Abierto' : badge.tone === 'closed' ? 'Cerrado' : 'Horario'}
                </span>
              </div>

              <div className="flex min-h-0 flex-1 flex-col p-2">
                <h3 className="line-clamp-1 text-[13px] font-semibold leading-snug text-[var(--chat-text)]">
                  {r.nombre}
                </h3>
                <p className="mt-0.5 line-clamp-2 min-h-[2.1rem] text-[11.5px] leading-[1.05rem] text-[var(--chat-text-muted)]">
                  {metaParts.join(' · ') || zone || 'Ver menú en elmenuxfa.com'}
                </p>
                <div className="mt-auto pt-1.5">
                  <Link
                    href={r.menuUrl}
                    onClick={() => onOpenMenu?.(r)}
                    className={btnPrimary}
                    data-testid={`discovery-menu-${r.slug}`}
                  >
                    Ver menú
                  </Link>
                </div>
              </div>
            </article>
          );
        })}
      </ChatHorizontalScroller>
    </div>
  );
}
