'use client';

import { useCallback, useRef } from 'react';
import type { KeyboardEvent, ReactNode, TouchEvent } from 'react';

type ChatHorizontalScrollerProps = {
  children: ReactNode;
  /** Enable CSS scroll-snap (children should be `shrink-0 snap-start`). */
  snap?: boolean;
  ariaLabel?: string;
  className?: string;
  /** Extra classes for the inner flex track. */
  trackClassName?: string;
};

/**
 * Horizontal rail for chat carousels.
 * - `touch-pan-x touch-pan-y`: horizontal drags scroll the rail, vertical drags
 *   still pan the chat list (we never lock to pan-x only).
 * - `overscroll-x-contain`: no browser back-swipe / parent horizontal chaining.
 * - Touch moves that are clearly horizontal don't bubble to React ancestors
 *   (future swipe-to-reply gestures); vertical moves bubble untouched.
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
      className={`touch-pan-x touch-pan-y overflow-x-auto overflow-y-hidden overscroll-x-contain scroll-smooth outline-none [-ms-overflow-style:none] [scrollbar-width:none] focus-visible:ring-2 focus-visible:ring-[var(--chat-send)] [&::-webkit-scrollbar]:hidden ${
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
