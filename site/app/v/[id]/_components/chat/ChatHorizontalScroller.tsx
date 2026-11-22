'use client';

import { useCallback, useEffect, useRef } from 'react';
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
 * - `touch-pan-x touch-pan-y`: horizontal drags scroll the rail, vertical drags
 *   still pan the chat list (we never lock to pan-x only).
 * - `overscroll-x-contain`: no browser back-swipe / parent horizontal chaining.
 * - Touch moves that are clearly horizontal don't bubble to React ancestors
 *   (future swipe-to-reply gestures); vertical moves bubble untouched.
 * - Mouse / pen: press-and-drag scrolls the rail (touch keeps native scrolling).
 *   A plain click on a button / link still works; only a press that moves past
 *   a small slop becomes a drag, which suppresses the click that follows.
 *   Form fields (`input,textarea,select`) never start a drag.
 * - Trailing spacer + child widths < container leave a peek of the next card.
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
      // Swallow the click that the browser fires right after a drag release.
      suppressClick.current = true;
      window.setTimeout(() => {
        suppressClick.current = false;
      }, 0);
    }
    drag.current = null;
  }, []);

  const onPointerDown = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    // Touch keeps native momentum scrolling; only mouse / pen get JS drag.
    if (e.pointerType === 'touch') return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const el = ref.current;
    if (!el || el.scrollWidth <= el.clientWidth) return;
    // Form fields keep their own pointer behavior. Buttons / links ARE allowed to
    // start a press (category cards are whole-card buttons): a plain click still
    // activates them; only movement past DRAG_SLOP_PX becomes a drag (and then
    // the trailing click is swallowed in `onClickCapture`).
    if ((e.target as Element | null)?.closest('input,textarea,select,[data-chat-no-drag]')) {
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
      // Snap + smooth scrolling fight 1:1 dragging; restore on release.
      el.style.scrollSnapType = 'none';
      el.style.scrollBehavior = 'auto';
      el.style.userSelect = 'none';
    }
    el.scrollLeft = d.startScrollLeft - dx;
    e.preventDefault();
  }, []);

  // Capture phase: cancel the click that follows a real drag.
  const onClickCapture = useCallback((e: ReactMouseEvent<HTMLDivElement>) => {
    if (suppressClick.current) {
      e.preventDefault();
      e.stopPropagation();
      suppressClick.current = false;
    }
  }, []);

  // Don't let the browser start native image / link drags while we drag the rail.
  const onDragStart = useCallback((e: ReactDragEvent<HTMLDivElement>) => {
    e.preventDefault();
  }, []);

  useEffect(() => {
    return () => {
      drag.current = null;
    };
  }, []);

  return (
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
      // Scrollbar stays hidden; desktop users scroll by dragging (grab cursor).
      className={`touch-pan-x touch-pan-y cursor-grab overflow-x-auto overflow-y-hidden overscroll-x-contain scroll-smooth outline-none active:cursor-grabbing [-ms-overflow-style:none] [scrollbar-width:none] focus-visible:ring-2 focus-visible:ring-[var(--chat-send)] [&::-webkit-scrollbar]:hidden ${
        snap ? 'snap-x snap-proximity scroll-pl-3' : ''
      } ${className}`}
    >
      <div
        className={`flex w-max gap-2.5 px-3 pb-1 after:block after:w-6 after:shrink-0 after:content-[''] ${trackClassName}`}
      >
        {children}
      </div>
    </div>
  );
}
