export type RateLimitResult =
  | { ok: true; remaining: number; resetAt: number }
  | { ok: false; remaining: number; resetAt: number; retryAfterSec: number };

/**
 * Distributed-ready limiter contract.
 * In-memory is for local/dev/tests only — not durable across serverless instances.
 * Production should front this with Vercel WAF / Cloudflare / Upstash Redis.
 */
export interface RateLimiter {
  consume(key: string, limit: number, windowMs: number, now?: number): Promise<RateLimitResult> | RateLimitResult;
}

type RateLimitBucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, RateLimitBucket>();

export class InMemoryRateLimiter implements RateLimiter {
  consume(key: string, limit: number, windowMs: number, now = Date.now()): RateLimitResult {
    const normalizedKey = key.trim() || 'anonymous';
    const existing = buckets.get(normalizedKey);

    if (!existing || existing.resetAt <= now) {
      const resetAt = now + windowMs;
      buckets.set(normalizedKey, { count: 1, resetAt });
      return { ok: true, remaining: Math.max(limit - 1, 0), resetAt };
    }

    if (existing.count >= limit) {
      const retryAfterSec = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
      return { ok: false, remaining: 0, resetAt: existing.resetAt, retryAfterSec };
    }

    existing.count += 1;
    buckets.set(normalizedKey, existing);
    return { ok: true, remaining: Math.max(limit - existing.count, 0), resetAt: existing.resetAt };
  }
}

const defaultLimiter = new InMemoryRateLimiter();

export function consumeRateLimit(
  key: string,
  limit: number,
  windowMs: number,
  now = Date.now(),
): RateLimitResult {
  return defaultLimiter.consume(key, limit, windowMs, now);
}

/** Test-only helper to avoid cross-test pollution. */
export function resetRateLimitStoreForTests() {
  buckets.clear();
}

/**
 * Prefer the left-most x-forwarded-for hop (Vercel sets the client IP first).
 * Truncate and normalize; never trust arbitrary multi-hop chains for auth —
 * only for coarse rate limiting.
 */
export function getClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) {
      // Strip IPv6 brackets / zone ids for stable keys.
      return first.replace(/^\[|\]$/g, '').split('%')[0].slice(0, 128);
    }
  }

  const realIp = request.headers.get('x-real-ip')?.trim();
  if (realIp) {
    return realIp.replace(/^\[|\]$/g, '').split('%')[0].slice(0, 128);
  }

  return 'unknown';
}
