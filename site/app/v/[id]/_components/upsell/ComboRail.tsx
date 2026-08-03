'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { ComboRailItem } from '../../_lib/upsell-heuristics';

type ComboRailProps = {
  items: ComboRailItem[];
  formatPrice: (amount: number) => string;
  onAdd: (productId: string) => void;
  titleStyle?: CSSProperties;
  showDemoLabel?: boolean;
};

const badgeStyles: Record<ComboRailItem['badge'], { bg: string; fg: string }> = {
  mas_pedido: { bg: '#DC2626', fg: '#fff' },
  mejor_valor: { bg: '#16A34A', fg: '#fff' },
  ahorra: { bg: '#EA580C', fg: '#fff' },
};

const CARD_STEP_PX = 222; // ~210 card + gap

export function ComboRail({ items, formatPrice, onAdd, titleStyle, showDemoLabel = false }: ComboRailProps) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startScrollLeft: number;
    moved: boolean;
  } | null>(null);
  const suppressClickRef = useRef(false);
  const [canScrollPrev, setCanScrollPrev] = useState(false);
  const [canScrollNext, setCanScrollNext] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const updateScrollState = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const maxScroll = el.scrollWidth - el.clientWidth;
    setCanScrollPrev(el.scrollLeft > 4);
    setCanScrollNext(el.scrollLeft < maxScroll - 4);
  }, []);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    updateScrollState();
    el.addEventListener('scroll', updateScrollState, { passive: true });
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(updateScrollState) : null;
    ro?.observe(el);
    return () => {
      el.removeEventListener('scroll', updateScrollState);
      ro?.disconnect();
    };
  }, [items.length, updateScrollState]);

  const scrollByCards = (direction: -1 | 1) => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollBy({ left: direction * CARD_STEP_PX * 2, behavior: 'smooth' });
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const el = scrollerRef.current;
    if (!el) return;
    if ((event.target as HTMLElement | null)?.closest('button, a, input, textarea, select')) {
      return;
    }
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startScrollLeft: el.scrollLeft,
      moved: false,
    };
    setIsDragging(true);
    el.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    const el = scrollerRef.current;
    if (!drag || !el || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.startX;
    if (Math.abs(dx) > 4) drag.moved = true;
    el.scrollLeft = drag.startScrollLeft - dx;
  };

  const endDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    const el = scrollerRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (drag.moved) {
      suppressClickRef.current = true;
      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 0);
    }
    dragRef.current = null;
    setIsDragging(false);
    if (el?.hasPointerCapture(event.pointerId)) {
      el.releasePointerCapture(event.pointerId);
    }
    updateScrollState();
  };

  if (!items.length) return null;

  return (
    <section className="mx-auto mt-5 w-full max-w-6xl">
      <div className="flex items-end justify-between gap-3 px-4 sm:px-6">
        <h2 className="text-lg font-black tracking-[-0.02em]" style={{ ...titleStyle, color: 'var(--menu-text)' }}>
          Combos recomendados
        </h2>
        <div className="flex items-center gap-2">
          {showDemoLabel ? (
            <span className="hidden text-[11px] font-semibold sm:inline" style={{ color: 'var(--menu-text-muted)' }}>
              Demo upsell
            </span>
          ) : null}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              aria-label="Ver combos anteriores"
              disabled={!canScrollPrev}
              onClick={() => scrollByCards(-1)}
              className="grid h-8 w-8 place-items-center rounded-full border disabled:opacity-35"
              style={{
                backgroundColor: 'var(--menu-surface)',
                borderColor: 'var(--menu-border)',
                color: 'var(--menu-text)',
              }}
            >
              <ChevronLeft className="h-4 w-4" strokeWidth={2.5} />
            </button>
            <button
              type="button"
              aria-label="Ver más combos"
              disabled={!canScrollNext}
              onClick={() => scrollByCards(1)}
              className="grid h-8 w-8 place-items-center rounded-full border disabled:opacity-35"
              style={{
                backgroundColor: 'var(--menu-surface)',
                borderColor: 'var(--menu-border)',
                color: 'var(--menu-text)',
              }}
            >
              <ChevronRight className="h-4 w-4" strokeWidth={2.5} />
            </button>
          </div>
        </div>
      </div>

      <div
        ref={scrollerRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        className={`mt-3 flex touch-pan-x gap-3 overflow-x-auto overscroll-x-contain px-4 pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden sm:px-6 ${
          isDragging ? 'cursor-grabbing select-none' : 'cursor-grab'
        }`}
        style={{
          scrollSnapType: 'x mandatory',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {items.map((item) => {
          const badge = badgeStyles[item.badge];
          const price = Number(item.product.precio ?? 0);
          return (
            <article
              key={item.product.id}
              className="w-[210px] shrink-0 snap-start overflow-hidden rounded-[22px] border"
              style={{
                backgroundColor: 'var(--menu-surface)',
                borderColor: 'var(--menu-border)',
                boxShadow: 'var(--menu-shadow)',
              }}
            >
              <div className="relative h-[128px] bg-[var(--menu-surface-alt)]">
                {item.imageUrl ? (
                  <img
                    src={item.imageUrl}
                    alt={item.product.nombre}
                    draggable={false}
                    className="pointer-events-none h-full w-full object-cover"
                  />
                ) : (
                  <div className="grid h-full place-items-center text-3xl opacity-40">🍽️</div>
                )}
                <span
                  className="absolute left-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.06em]"
                  style={{ backgroundColor: badge.bg, color: badge.fg }}
                >
                  {item.badgeLabel}
                </span>
              </div>
              <div className="p-3">
                <h3 className="line-clamp-1 text-sm font-extrabold" style={{ color: 'var(--menu-text)' }}>
                  {item.product.nombre}
                </h3>
                <p className="mt-1 line-clamp-2 text-[11px] leading-4" style={{ color: 'var(--menu-text-muted)' }}>
                  {item.product.descripcion?.trim() || 'Combo listo para pedir'}
                </p>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <div>
                    <p className="text-[15px] font-black" style={{ color: 'var(--menu-primary)' }}>
                      {formatPrice(price)}
                    </p>
                    <p className="text-[11px] font-semibold line-through" style={{ color: 'var(--menu-text-muted)' }}>
                      {formatPrice(item.compareAtPrice)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={(event) => {
                      if (suppressClickRef.current) {
                        event.preventDefault();
                        event.stopPropagation();
                        return;
                      }
                      onAdd(item.product.id);
                    }}
                    className="rounded-full px-3 py-1.5 text-xs font-black"
                    style={{
                      backgroundColor: 'var(--menu-primary)',
                      color: 'var(--menu-on-primary)',
                    }}
                  >
                    Agregar
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
