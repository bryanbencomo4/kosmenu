'use client';

import Link from 'next/link';
import { MapPin, MessageCircle, Store } from 'lucide-react';

import { ChatHorizontalScroller } from '../v/[id]/_components/chat/ChatHorizontalScroller';

export type DiscoveryUiRestaurant = {
  id: string;
  slug: string;
  nombre: string;
  logoUrl: string | null;
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
};

type DiscoveryRestaurantCarouselProps = {
  restaurants: DiscoveryUiRestaurant[];
  onOpenMenu?: (restaurant: DiscoveryUiRestaurant) => void;
};

function openBadge(restaurant: DiscoveryUiRestaurant) {
  if (restaurant.isOpen === true) {
    return { label: restaurant.openLabel || 'Abierto', tone: 'open' as const };
  }
  if (restaurant.isOpen === false) {
    return { label: restaurant.openLabel || 'Cerrado', tone: 'closed' as const };
  }
  return { label: 'Horario no confirmado', tone: 'unknown' as const };
}

export function DiscoveryRestaurantCarousel({
  restaurants,
  onOpenMenu,
}: DiscoveryRestaurantCarouselProps) {
  if (restaurants.length === 0) return null;

  return (
    <div data-discovery-restaurant-carousel="1" className="w-full max-w-full">
      <ChatHorizontalScroller ariaLabel="Restaurantes encontrados" className="py-1">
        {restaurants.map((r) => {
          const badge = openBadge(r);
          const zone = r.zonaOperacion || r.direccion;
          return (
            <article
              key={r.id}
              data-discovery-restaurant={r.slug}
              className="flex w-[220px] shrink-0 snap-start flex-col overflow-hidden rounded-2xl border border-[var(--chat-card-border)] bg-[var(--chat-card)] shadow-[0_6px_18px_rgba(0,0,0,0.12)]"
            >
              <div className="flex items-center gap-2.5 px-3 pt-3">
                <div className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-full bg-[var(--chat-input)]">
                  {r.logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={r.logoUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <Store className="h-5 w-5 text-[var(--chat-text-muted)]" aria-hidden />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-semibold leading-tight text-[var(--chat-text)]">
                    {r.nombre}
                  </p>
                  {r.categoria ? (
                    <p className="truncate text-[11px] text-[var(--chat-text-muted)]">{r.categoria}</p>
                  ) : null}
                </div>
              </div>

              <div className="mt-2 space-y-1 px-3">
                <p
                  className={`text-[11px] font-medium ${
                    badge.tone === 'open'
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : badge.tone === 'closed'
                        ? 'text-rose-600 dark:text-rose-400'
                        : 'text-[var(--chat-text-muted)]'
                  }`}
                >
                  {badge.label}
                </p>
                {zone ? (
                  <p className="flex items-start gap-1 text-[11px] text-[var(--chat-text-muted)]">
                    <MapPin className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
                    <span className="line-clamp-2">{zone}</span>
                  </p>
                ) : null}
                {r.distanceKm != null && Number.isFinite(r.distanceKm) ? (
                  <p className="text-[11px] text-[var(--chat-text-muted)]">
                    ~{r.distanceKm < 10 ? r.distanceKm.toFixed(1) : Math.round(r.distanceKm)} km
                  </p>
                ) : null}
              </div>

              <div className="mt-auto flex flex-col gap-1.5 p-3 pt-2.5">
                <Link
                  href={r.menuUrl}
                  onClick={() => onOpenMenu?.(r)}
                  className="inline-flex h-9 items-center justify-center rounded-full bg-[var(--chat-send)] px-3 text-[12px] font-semibold text-[var(--chat-send-fg)]"
                  data-testid={`discovery-menu-${r.slug}`}
                >
                  Ver menú
                </Link>
                {r.chatUrl ? (
                  <Link
                    href={r.chatUrl}
                    className="inline-flex h-9 items-center justify-center gap-1.5 rounded-full border border-[var(--chat-card-border)] bg-[var(--chat-input)] px-3 text-[12px] font-semibold text-[var(--chat-text)]"
                    data-testid={`discovery-chat-${r.slug}`}
                  >
                    <MessageCircle className="h-3.5 w-3.5" aria-hidden />
                    Hablar con el asistente
                  </Link>
                ) : null}
              </div>
            </article>
          );
        })}
      </ChatHorizontalScroller>
    </div>
  );
}
