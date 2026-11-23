'use client';

const VISITOR_KEY = 'elmx_promo_vid';
const SESSION_KEY = 'elmx_promo_sid';

function randomId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `v_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function getPromoVisitorId() {
  if (typeof window === 'undefined') return 'ssr';
  try {
    const existing = window.localStorage.getItem(VISITOR_KEY);
    if (existing && existing.length >= 8) return existing;
    const next = randomId();
    window.localStorage.setItem(VISITOR_KEY, next);
    return next;
  } catch {
    return randomId();
  }
}

export function getPromoSessionId() {
  if (typeof window === 'undefined') return 'ssr';
  try {
    const existing = window.sessionStorage.getItem(SESSION_KEY);
    if (existing && existing.length >= 4) return existing;
    const next = randomId();
    window.sessionStorage.setItem(SESSION_KEY, next);
    return next;
  } catch {
    return randomId();
  }
}

export type ClientPromoPlacement = 'promoted_carousel' | 'promoted_hero';

const queued: Array<{
  comercioId: string;
  type: 'impression' | 'click';
  placement: ClientPromoPlacement;
}> = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
const seenImpressions = new Set<string>();

function flushPromoEvents() {
  flushTimer = null;
  if (queued.length === 0 || typeof window === 'undefined') return;
  const batch = queued.splice(0, 20);
  const visitorId = getPromoVisitorId();
  const sessionId = getPromoSessionId();
  void fetch('/api/comercios/directory/promo-events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ visitorId, sessionId, events: batch }),
    keepalive: true,
  }).catch(() => {
    // Analytics must never block UX.
  });
}

export function trackDirectoryPromoEvent(options: {
  comercioId: string;
  type: 'impression' | 'click';
  placement?: ClientPromoPlacement;
}) {
  if (!options.comercioId) return;
  const placement = options.placement ?? 'promoted_carousel';
  if (options.type === 'impression') {
    const key = `${options.comercioId}:${placement}`;
    if (seenImpressions.has(key)) return;
    seenImpressions.add(key);
  }
  queued.push({
    comercioId: options.comercioId,
    type: options.type,
    placement,
  });
  if (flushTimer != null) return;
  flushTimer = setTimeout(flushPromoEvents, options.type === 'click' ? 0 : 400);
}

export function withPromoMenuSrc(menuUrl: string) {
  try {
    const url = new URL(menuUrl, typeof window !== 'undefined' ? window.location.origin : 'https://elmenuxfa.com');
    if (!url.searchParams.get('src')) {
      url.searchParams.set('src', 'directory_promoted');
    }
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    const joiner = menuUrl.includes('?') ? '&' : '?';
    return `${menuUrl}${joiner}src=directory_promoted`;
  }
}
