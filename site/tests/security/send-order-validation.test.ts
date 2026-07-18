import { afterEach, describe, expect, it } from 'vitest';

import {
  MAX_SEND_ORDER_BODY_BYTES,
  escapeHtml,
  resolveSafeTrackingUrl,
  sanitizeDisplayName,
  sendOrderRequestSchema,
} from '../../app/api/_lib/send-order-validation';
import { consumeRateLimit, resetRateLimitStoreForTests } from '../../app/api/_lib/rate-limit';

describe('sendOrderRequestSchema', () => {
  it('accepts a legitimate payload', () => {
    const parsed = sendOrderRequestSchema.safeParse({
      clientEmail: 'cliente@example.com',
      orderId: 'demo-ORDER-123456',
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects invalid email', () => {
    const parsed = sendOrderRequestSchema.safeParse({
      clientEmail: 'not-an-email',
      orderId: 'demo-ORDER-123456',
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects email header injection', () => {
    const parsed = sendOrderRequestSchema.safeParse({
      clientEmail: 'cliente@example.com\nbcc:evil@example.com',
      orderId: 'demo-ORDER-123456',
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects unexpected fields (arbitrary recipient / template)', () => {
    const parsed = sendOrderRequestSchema.safeParse({
      clientEmail: 'cliente@example.com',
      orderId: 'demo-ORDER-123456',
      to: 'evil@example.com',
      subject: 'Hacked',
      html: '<script>alert(1)</script>',
      from: 'spoof@evil.com',
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects invalid orderId characters', () => {
    const parsed = sendOrderRequestSchema.safeParse({
      clientEmail: 'cliente@example.com',
      orderId: '../../etc/passwd',
    });
    expect(parsed.success).toBe(false);
  });
});

describe('tracking URL safety', () => {
  it('rejects arbitrary absolute URLs', () => {
    const safe = resolveSafeTrackingUrl('https://evil.example/phish', 'ORDER-1', 'demo');
    expect(safe).toBeNull();
  });

  it('rejects same-origin tracking path without token', () => {
    const site = (process.env.SITE_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? 'https://elmenuxfa.com').replace(
      /\/$/,
      '',
    );
    const candidate = `${site}/orders/ORDER-1`;
    expect(resolveSafeTrackingUrl(candidate, 'ORDER-1', null)).toBeNull();
  });

  it('accepts same-origin tracking path with token', () => {
    const site = (process.env.SITE_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? 'https://elmenuxfa.com').replace(
      /\/$/,
      '',
    );
    const candidate = `${site}/orders/ORDER-1?t=secret-token`;
    expect(resolveSafeTrackingUrl(candidate, 'ORDER-1', null)).toBe(candidate);
  });
});

describe('html / display sanitization', () => {
  it('escapes HTML in display strings', () => {
    expect(escapeHtml('<img src=x onerror=alert(1)>')).toBe('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('strips angle brackets from comercio names', () => {
    expect(sanitizeDisplayName('<b>Cafe</b>')).toBe('bCafe/b');
  });
});

describe('body size constant', () => {
  it('keeps a small max body budget', () => {
    expect(MAX_SEND_ORDER_BODY_BYTES).toBeLessThanOrEqual(8_192);
  });
});

describe('rate limit', () => {
  afterEach(() => {
    resetRateLimitStoreForTests();
  });

  it('allows requests under the limit and blocks afterwards', () => {
    const key = 'test-key';
    expect(consumeRateLimit(key, 2, 60_000).ok).toBe(true);
    expect(consumeRateLimit(key, 2, 60_000).ok).toBe(true);
    const blocked = consumeRateLimit(key, 2, 60_000);
    expect(blocked.ok).toBe(false);
    if (blocked.ok === false) {
      expect(blocked.retryAfterSec).toBeGreaterThanOrEqual(1);
    }
  });
});
