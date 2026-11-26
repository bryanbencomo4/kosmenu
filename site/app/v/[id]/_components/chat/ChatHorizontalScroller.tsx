'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  DragEvent as ReactDragEvent,
  KeyboardEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  ReactNode,
  TouchEvent,
} from 'react';

type ChatHorizontalScrollerProps = {
  children: ReactNode;
  /** Enable CSS scroll-snap (children should be `shrink-0 snap-start`). */
  snap?: boolean;
  ariaLabel?: string;
  className?: string;
  /** Extra classes for the inner flex track. */
  trackClassName?: string;
};

/** Pixels the pointer must travel before a press becomes a drag (keeps clicks working). */
const DRAG_SLOP_PX = 5;

type DragState = {
  pointerId: number;
  startX: number;
  startScrollLeft: number;
  dragging: boolean;
};

/**
 * Horizontal rail for chat carousels.
 * - Touch: native momentum scrolling.
 * - Mouse / pen: press-and-drag scrolls the rail.
 * - Desktop: chevron buttons when content overflows (clear PC affordance).
 */
export function ChatHorizontalScroller({
  children,
  snap = true,
  ariaLabel,
  className = '',
  trackClassName = '',
}: ChatHorizontalScrollerProps) {
  const ref = useRef<HTMLDivElement>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const drag = useRef<DragState | null>(null);
  const suppressClick = useRef(false);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);

  const syncOverflow = useCallback(() => {
    const el = ref.current;
    if (!el) {
      setCanPrev(false);
      setCanNext(false);
      return;
    }
    const max = el.scrollWidth - el.clientWidth;
    if (max <= 4) {
      setCanPrev(false);
      setCanNext(false);
      return;
    }
    setCanPrev(el.scrollLeft > 4);
    setCanNext(el.scrollLeft < max - 4);
  }, []);

  const scrollByPage = useCallback((dir: -1 | 1) => {
    const el = ref.current;
    if (!el) return;
    el.scrollBy({
      left: dir * Math.max(140, el.clientWidth * 0.75),
      behavior: 'smooth',
    });
  }, []);

  const onKeyDown = useCallback((e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const el = ref.current;
    if (!el || el.scrollWidth <= el.clientWidth) return;
    e.preventDefault();
    e.stopPropagation();
    const dir = e.key === 'ArrowRight' ? 1 : -1;
    el.scrollBy({ left: dir * Math.max(120, el.clientWidth * 0.8), behavior: 'smooth' });
  }, []);

  const onTouchStart = useCallback((e: TouchEvent<HTMLDivElement>) => {
    const t = e.touches[0];
    start.current = t ? { x: t.clientX, y: t.clientY } : null;
  }, []);

  const onTouchMove = useCallback((e: TouchEvent<HTMLDivElement>) => {
    const s = start.current;
    const t = e.touches[0];
    if (!s || !t) return;
    const dx = Math.abs(t.clientX - s.x);
    const dy = Math.abs(t.clientY - s.y);
    if (dx > 6 && dx > dy) e.stopPropagation();
  }, []);

  const onTouchEnd = useCallback(() => {
    start.current = null;
  }, []);

  const endDrag = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const el = ref.current;
    try {
      el?.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    if (el) {
      el.style.scrollSnapType = '';
      el.style.scrollBehavior = '';
      el.style.userSelect = '';
    }
    if (d.dragging) {
      suppressClick.current = true;
      window.setTimeout(() => {
        suppressClick.current = false;
      }, 0);
    }
    drag.current = null;
    syncOverflow();
  }, [syncOverflow]);

  const onPointerDown = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'touch') return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const el = ref.current;
    if (!el || el.scrollWidth <= el.clientWidth) return;
    // Allow drag starting on chip buttons; only block true form controls / opt-outs.
    // Click is preserved via DRAG_SLOP + suppressClick after a real drag.
    if (
      (e.target as Element | null)?.closest(
        'input,textarea,select,[data-chat-no-drag],[data-chat-thumb-retry],[data-chat-no-swipe],[data-chat-h-scroll-prev],[data-chat-h-scroll-next]',
      )
    ) {
      return;
    }
    drag.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startScrollLeft: el.scrollLeft,
      dragging: false,
    };
  }, []);

  const onPointerMove = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    const el = ref.current;
    if (!d || !el || d.pointerId !== e.pointerId) return;
    const dx = e.clientX - d.startX;
    if (!d.dragging) {
      if (Math.abs(dx) < DRAG_SLOP_PX) return;
      d.dragging = true;
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      el.style.scrollSnapType = 'none';
      el.style.scrollBehavior = 'auto';
      el.style.userSelect = 'none';
    }
    el.scrollLeft = d.startScrollLeft - dx;
    e.preventDefault();
  }, []);

  const onClickCapture = useCallback((e: ReactMouseEvent<HTMLDivElement>) => {
    if (suppressClick.current) {
      e.preventDefault();
      e.stopPropagation();
      suppressClick.current = false;
    }
  }, []);

  const onDragStart = useCallback((e: ReactDragEvent<HTMLDivElement>) => {
    e.preventDefault();
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    syncOverflow();
    const onScroll = () => syncOverflow();
    el.addEventListener('scroll', onScroll, { passive: true });
    const ro =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => syncOverflow())
        : null;
    ro?.observe(el);
    window.addEventListener('resize', syncOverflow);
    return () => {
      el.removeEventListener('scroll', onScroll);
      ro?.disconnect();
      window.removeEventListener('resize', syncOverflow);
      drag.current = null;
    };
  }, [syncOverflow, children]);

  const showArrows = canPrev || canNext;

  return (
    <div className="relative" data-chat-h-scroll-wrap="1">
      <div
        ref={ref}
        data-chat-h-scroll="1"
        role="group"
        aria-label={ariaLabel}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onClickCapture={onClickCapture}
        onDragStart={onDragStart}
        className={`cursor-grab overflow-x-auto overflow-y-hidden overscroll-x-contain scroll-smooth outline-none active:cursor-grabbing [-ms-overflow-style:none] [scrollbar-width:none] [touch-action:pan-x_pan-y] focus-visible:ring-2 focus-visible:ring-[var(--chat-send)] [&::-webkit-scrollbar]:hidden ${
          snap ? 'snap-x snap-proximity scroll-pl-3' : ''
        } ${className}`}
      >
        <div
          className={`flex w-max gap-2.5 px-3 pb-1 after:block after:w-6 after:shrink-0 after:content-[''] ${trackClassName}`}
        >
          {children}
        </div>
      </div>
      {showArrows ? (
        <>
          <button
            type="button"
            data-chat-h-scroll-prev="1"
            data-chat-no-drag="1"
            aria-label="Anterior"
            disabled={!canPrev}
            onClick={() => scrollByPage(-1)}
            className="absolute left-1 top-1/2 z-[2] hidden h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-[var(--chat-card-border)] bg-[var(--chat-card)] text-[var(--chat-text)] shadow-md disabled:opacity-30 sm:inline-flex"
          >
            <ChevronLeft className="h-4 w-4" strokeWidth={2.2} aria-hidden />
          </button>
          <button
            type="button"
            data-chat-h-scroll-next="1"
            data-chat-no-drag="1"
            aria-label="Siguiente"
            disabled={!canNext}
            onClick={() => scrollByPage(1)}
            className="absolute right-1 top-1/2 z-[2] hidden h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-[var(--chat-card-border)] bg-[var(--chat-card)] text-[var(--chat-text)] shadow-md disabled:opacity-30 sm:inline-flex"
          >
            <ChevronRight className="h-4 w-4" strokeWidth={2.2} aria-hidden />
          </button>
        </>
      ) : null}
    </div>
  );
}
