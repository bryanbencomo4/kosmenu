import { describe, expect, it } from 'vitest';

/**
 * Mirrors the events route policy: image_* are rate-limited; commercial funnel is not.
 * Keeps the contract testable without spinning Next.js.
 */
const IMAGE_EVENTS = new Set(['image_load', 'image_error', 'image_timeout']);
const COMMERCIAL_EVENTS = [
  'menu_view',
  'qr_scan',
  'product_view',
  'add_to_cart',
  'checkout_started',
  'order_completed',
] as const;

function appliesImageRateLimit(eventType: string): boolean {
  return IMAGE_EVENTS.has(eventType);
}

describe('menu events rate-limit isolation', () => {
  it('does not rate-limit commercial funnel events', () => {
    for (const event of COMMERCIAL_EVENTS) {
      expect(appliesImageRateLimit(event)).toBe(false);
    }
  });

  it('rate-limits only image telemetry events', () => {
    expect(appliesImageRateLimit('image_load')).toBe(true);
    expect(appliesImageRateLimit('image_error')).toBe(true);
    expect(appliesImageRateLimit('image_timeout')).toBe(true);
    expect(appliesImageRateLimit('menu_view')).toBe(false);
  });
});
