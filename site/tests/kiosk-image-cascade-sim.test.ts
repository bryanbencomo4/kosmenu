/**
 * Scenario simulations for KioskImage load policy (no DOM / no hot transforms).
 * Models gen races, budgets, and failure → placeholder without infinite loops.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  IMAGE_AUTO_RETRY_DELAY_MS,
  IMAGE_MAX_AUTO_RETRIES,
  IMAGE_PHASE_TIMEOUT_MS,
  IMAGE_TOTAL_BUDGET_MS,
  initialPhase,
  nextPhase,
  phaseTimeoutMs,
  urlForPhase,
  type ImageCascadeUrls,
  type ImageLoadPhase,
} from '../app/v/[id]/_lib/kiosk-image-load';

type Outcome = 'load' | 'error' | 'hang';

type SimEvent =
  | { type: 'load'; phase: ImageLoadPhase; at: number }
  | { type: 'error'; phase: ImageLoadPhase; at: number }
  | { type: 'timeout'; phase: ImageLoadPhase; at: number }
  | { type: 'fail'; at: number; autoRetry: number }
  | { type: 'abort'; at: number };

function simulateCascade(opts: {
  urls: ImageCascadeUrls;
  /** Outcome per phase when that URL is requested. */
  outcomes: Partial<Record<ImageLoadPhase, Outcome>>;
  /** Wall time until outcome fires (hang ignores and waits for phase timeout). */
  latencyMs?: Partial<Record<ImageLoadPhase, number>>;
  /** Abort cascade at this time (category change). */
  abortAtMs?: number;
  maxAutoRetries?: number;
}): { events: SimEvent[]; final: 'shown' | 'placeholder' | 'aborted'; hotRequests: number } {
  const events: SimEvent[] = [];
  let hotRequests = 0;
  let autoRetry = 0;
  const maxRetries = opts.maxAutoRetries ?? IMAGE_MAX_AUTO_RETRIES;
  let now = 0;

  function runOnce(cascadeStart: number): 'shown' | 'placeholder' | 'aborted' {
    let phase = initialPhase(opts.urls);
    const started = cascadeStart;

    while (true) {
      const url = urlForPhase(opts.urls, phase);
      if (!url) {
        events.push({ type: 'fail', at: now, autoRetry });
        return 'placeholder';
      }
      if (phase === 'hot') hotRequests += 1;

      const elapsed = now - started;
      const budgetWait = phaseTimeoutMs(phase, elapsed);
      const outcome = opts.outcomes[phase] ?? 'load';
      const latency = opts.latencyMs?.[phase] ?? (outcome === 'hang' ? budgetWait + 1 : 50);

      if (opts.abortAtMs != null && now + Math.min(latency, budgetWait) >= opts.abortAtMs) {
        now = opts.abortAtMs;
        events.push({ type: 'abort', at: now });
        return 'aborted';
      }

      if (outcome === 'hang' || latency >= budgetWait) {
        now += budgetWait;
        events.push({ type: 'timeout', phase, at: now });
        const next = nextPhase(opts.urls, phase);
        if (!next) {
          events.push({ type: 'fail', at: now, autoRetry });
          return 'placeholder';
        }
        phase = next;
        continue;
      }

      now += latency;
      if (outcome === 'load') {
        events.push({ type: 'load', phase, at: now });
        return 'shown';
      }

      events.push({ type: 'error', phase, at: now });
      const next = nextPhase(opts.urls, phase);
      if (!next) {
        events.push({ type: 'fail', at: now, autoRetry });
        return 'placeholder';
      }
      phase = next;
    }
  }

  let final = runOnce(0);
  while (final === 'placeholder' && autoRetry < maxRetries) {
    autoRetry += 1;
    now += IMAGE_AUTO_RETRY_DELAY_MS;
    final = runOnce(now);
  }

  return { events, final, hotRequests };
}

const full: ImageCascadeUrls = {
  cold: 'https://host/storage/v1/object/public/product-images/a/.variants/p/card.webp',
  hot: 'https://host/storage/v1/render/image/public/product-images/a/p.jpg?width=360',
  original: 'https://host/storage/v1/object/public/product-images/a/p.jpg',
};

describe('KioskImage cascade simulation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('1. WebP cold load succeeds without hot transform', () => {
    const r = simulateCascade({ urls: full, outcomes: { cold: 'load' } });
    expect(r.final).toBe('shown');
    expect(r.hotRequests).toBe(0);
    expect(r.events.some((e) => e.type === 'load' && e.phase === 'cold')).toBe(true);
  });

  it('2. 404 on cold advances to hot then can succeed', () => {
    const r = simulateCascade({
      urls: full,
      outcomes: { cold: 'error', hot: 'load' },
    });
    expect(r.final).toBe('shown');
    expect(r.hotRequests).toBe(1);
  });

  it('3. pending hang without onLoad/onError times out into next phase', () => {
    const r = simulateCascade({
      urls: full,
      outcomes: { cold: 'hang', hot: 'load' },
    });
    expect(r.events.some((e) => e.type === 'timeout' && e.phase === 'cold')).toBe(true);
    expect(r.final).toBe('shown');
    const timeoutAt = r.events.find((e) => e.type === 'timeout')!.at;
    expect(timeoutAt).toBe(IMAGE_PHASE_TIMEOUT_MS.cold);
  });

  it('4. slow but successful download within cold window never times out', () => {
    const r = simulateCascade({
      urls: full,
      outcomes: { cold: 'load' },
      latencyMs: { cold: IMAGE_PHASE_TIMEOUT_MS.cold - 500 },
    });
    expect(r.final).toBe('shown');
    expect(r.events.some((e) => e.type === 'timeout')).toBe(false);
    expect(r.hotRequests).toBe(0);
  });

  it('5. category change aborts in-flight cascade (gen race)', () => {
    const r = simulateCascade({
      urls: full,
      outcomes: { cold: 'hang' },
      abortAtMs: 2_000,
    });
    expect(r.final).toBe('aborted');
    expect(r.events.some((e) => e.type === 'abort')).toBe(true);
  });

  it('6. interrupt then recovery: auto-retry eventually shows', () => {
    let calls = 0;
    // First pass: all hang → placeholder; second pass (retry): cold loads.
    const urls = full;
    const events: SimEvent[] = [];
    let now = 0;
    let phase = initialPhase(urls);
    let pass = 0;
    const maxPasses = 1 + IMAGE_MAX_AUTO_RETRIES;

    outer: while (pass < maxPasses) {
      const cascadeStart = now;
      phase = initialPhase(urls);
      while (true) {
        const elapsed = now - cascadeStart;
        const wait = phaseTimeoutMs(phase, elapsed);
        if (pass === 0) {
          now += wait;
          events.push({ type: 'timeout', phase, at: now });
          const n = nextPhase(urls, phase);
          if (!n) {
            events.push({ type: 'fail', at: now, autoRetry: pass });
            pass += 1;
            now += IMAGE_AUTO_RETRY_DELAY_MS;
            continue outer;
          }
          phase = n;
          continue;
        }
        now += 80;
        events.push({ type: 'load', phase, at: now });
        calls += 1;
        break outer;
      }
    }

    expect(calls).toBe(1);
    expect(events.some((e) => e.type === 'fail')).toBe(true);
    expect(events.some((e) => e.type === 'load')).toBe(true);
    expect(now).toBeLessThan(IMAGE_TOTAL_BUDGET_MS * 2 + IMAGE_AUTO_RETRY_DELAY_MS + 1_000);
  });

  it('7. missing cold WebP starts at hot (no unnecessary cold wait)', () => {
    const noCold: ImageCascadeUrls = { cold: null, hot: full.hot, original: full.original };
    const r = simulateCascade({ urls: noCold, outcomes: { hot: 'load' } });
    expect(r.final).toBe('shown');
    expect(r.hotRequests).toBe(1);
    expect(r.events[0]).toMatchObject({ type: 'load', phase: 'hot' });
  });

  it('8. Supabase host outage: cascade ends with placeholder, bounded budget', () => {
    const r = simulateCascade({
      urls: full,
      outcomes: { cold: 'hang', hot: 'hang', original: 'hang' },
      maxAutoRetries: 0,
    });
    expect(r.final).toBe('placeholder');
    const last = r.events[r.events.length - 1];
    expect(last.type).toBe('fail');
    expect(last.at).toBeLessThanOrEqual(IMAGE_TOTAL_BUDGET_MS + 50);
  });

  it('9. many simultaneous failures stay independent (N placeholders, no shared hang)', () => {
    const results = Array.from({ length: 12 }, () =>
      simulateCascade({
        urls: full,
        outcomes: { cold: 'error', hot: 'error', original: 'error' },
        maxAutoRetries: 0,
      }),
    );
    expect(results.every((r) => r.final === 'placeholder')).toBe(true);
    expect(results.every((r) => r.hotRequests === 1)).toBe(true);
  });
});
