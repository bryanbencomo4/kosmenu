const STORAGE_KEY = 'elmenuxfa:upsell-session-id';

/** Anonymous, per-tab session id used only to attribute upsell events (never PII). */
export function getOrCreateUpsellSessionId(): string {
  if (typeof window === 'undefined') return 'server';
  try {
    const existing = window.sessionStorage.getItem(STORAGE_KEY);
    if (existing) return existing;
    const next =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `sess-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    window.sessionStorage.setItem(STORAGE_KEY, next);
    return next;
  } catch {
    return `sess-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

export type UpsellEventType = 'impression' | 'click' | 'add' | 'dismiss' | 'purchase';
export type UpsellSurface = 'add_to_cart' | 'cart' | 'checkout';

export type UpsellEventPayload = {
  comercioId: string;
  sessionId: string;
  orderId?: string | null;
  ruleId?: string | null;
  bundleId?: string | null;
  productId?: string | null;
  surface: UpsellSurface;
  eventType: UpsellEventType;
  unitPrice?: number | null;
  cartAmountBefore?: number | null;
  cartAmountAfter?: number | null;
};

/** Fire-and-forget event tracking. Never blocks or throws on the UI thread. */
export function trackUpsellEvent(payload: UpsellEventPayload) {
  try {
    const body = JSON.stringify(payload);
    if (typeof navigator !== 'undefined' && 'sendBeacon' in navigator) {
      const blob = new Blob([body], { type: 'application/json' });
      navigator.sendBeacon('/api/upsell/events', blob);
      return;
    }
    void fetch('/api/upsell/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Analytics must never break the storefront.
  }
}
