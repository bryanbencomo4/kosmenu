'use client';

import { useEffect } from 'react';

let locks = 0;
let previousOverflow = '';
let previousPaddingRight = '';
let previousTouchAction = '';
let previousOverscroll = '';
let previousHtmlOverflow = '';

function lock() {
  if (typeof document === 'undefined') return;
  const { body, documentElement } = document;
  if (locks === 0) {
    previousOverflow = body.style.overflow ?? '';
    previousPaddingRight = body.style.paddingRight ?? '';
    previousTouchAction = body.style.touchAction ?? '';
    previousOverscroll = body.style.overscrollBehavior ?? '';
    previousHtmlOverflow = documentElement.style.overflow ?? '';
    const gap = window.innerWidth - documentElement.clientWidth;
    if (gap > 0) body.style.paddingRight = `${gap}px`;
    body.style.overflow = 'hidden';
    body.style.touchAction = 'none';
    body.style.overscrollBehavior = 'none';
    documentElement.style.overflow = 'hidden';
    documentElement.style.overscrollBehavior = 'none';
    attachScrollGuards();
  }
  locks += 1;
}

function blockBackgroundScroll(event: Event) {
  const target = event.target;
  if (!(target instanceof Element)) {
    event.preventDefault();
    return;
  }
  if (target.closest('[role="dialog"], [data-sheet-scroll], [data-allow-scroll]')) return;
  event.preventDefault();
}

function attachScrollGuards() {
  window.addEventListener('wheel', blockBackgroundScroll, { passive: false });
  window.addEventListener('touchmove', blockBackgroundScroll, { passive: false });
}

function detachScrollGuards() {
  window.removeEventListener('wheel', blockBackgroundScroll);
  window.removeEventListener('touchmove', blockBackgroundScroll);
}

function unlock() {
  if (typeof document === 'undefined' || locks === 0) return;
  locks -= 1;
  if (locks > 0) return;
  detachScrollGuards();
  const { body, documentElement } = document;
  body.style.overflow = previousOverflow;
  body.style.paddingRight = previousPaddingRight;
  body.style.touchAction = previousTouchAction;
  body.style.overscrollBehavior = previousOverscroll;
  documentElement.style.overflow = previousHtmlOverflow;
  documentElement.style.overscrollBehavior = '';
}

/** Locks the page behind a sheet. Nested sheets share one lock and restore on the last close. */
export function useLockBodyScroll(locked: boolean) {
  useEffect(() => {
    if (!locked) return;
    lock();
    return unlock;
  }, [locked]);
}

export const __lockBodyScrollForTests = lock;
export const __unlockBodyScrollForTests = unlock;

export function __resetLockBodyScrollForTests() {
  locks = 0;
  previousOverflow = '';
  previousPaddingRight = '';
  previousTouchAction = '';
  previousOverscroll = '';
  previousHtmlOverflow = '';
  if (typeof document === 'undefined') return;
  document.body.style.overflow = '';
  document.body.style.paddingRight = '';
  document.body.style.touchAction = '';
  document.body.style.overscrollBehavior = '';
  document.documentElement.style.overflow = '';
  document.documentElement.style.overscrollBehavior = '';
}
