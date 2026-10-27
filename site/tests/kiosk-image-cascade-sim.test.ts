/**
 * Scenario simulations for KioskImage load policy (no DOM / no hot transforms).
 */
import { describe, expect, it } from 'vitest';

import {
  autoRetryDelayMs,
  IMAGE_MAX_AUTO_RETRIES,
  IMAGE_PHASE_TIMEOUT_MS,
  IMAGE_TOTAL_BUDGET_MS,
  initialPhase,
  nextPhase,
  phaseTimeoutMs,
  shouldAdvanceAfterFailure,
  urlForPhase,
  type ImageCascadeUrls,
  type ImageLoadPhase,
} from '../app/v/[id]/_lib/kiosk-image-load';

type SimEvent =
  | { type: 'load'; phase: ImageLoadPhase; at: number }
  | { type: 'error'; phase: ImageLoadPhase; at: number }
  | { type: 'timeout'; phase: ImageLoadPhase; at: number }
  | { type: 'fail'; at: number; autoRetry: number }
  | { type: 'abort'; at: number };

function simulateCascade(opts: {
  urls: ImageCascadeUrls;
  outcomes: Partial<Record<ImageLoadPhase, 'load' | 'error' | 'hang'>>;
  latencyMs?: Partial<Record<ImageLoadPhase, number>>;
  abortAtMs?: number;
  maxAutoRetries?: number;
}): { events: SimEvent[]; final: 'shown' | 'placeholder' | 'aborted'; hotRequests: number; endedAt: number } {
  const events: SimEvent[] = [];
  let hotRequests = 0;
  let autoRetry = 0;
  const maxRetries = opts.maxAutoRetries ?? IMAGE_MAX_AUTO_RETRIES;
  let now = 0;
  const attemptStart = 0;

  function runOnce(): 'shown' | 'placeholder' | 'aborted' {
    let phase = initialPhase(opts.urls);

    while (true) {
      const url = urlForPhase(opts.urls, phase);
      if (!url) {
        events.push({ type: 'fail', at: now, autoRetry });
        return 'placeholder';
      }
      if (phase === 'hot') hotRequests += 1;

      const budgetWait = phaseTimeoutMs(phase, now - attemptStart);
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
        if (!shouldAdvanceAfterFailure('timeout')) {
          events.push({ type: 'fail', at: now, autoRetry });
          return 'placeholder';
        }
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
      if (!shouldAdvanceAfterFailure('error')) {
        events.push({ type: 'fail', at: now, autoRetry });
        return 'placeholder';
      }
      const next = nextPhase(opts.urls, phase);
      if (!next) {
        events.push({ type: 'fail', at: now, autoRetry });
        return 'placeholder';
      }
      if (phaseTimeoutMs(next, now - attemptStart) <= 0) {
        events.push({ type: 'fail', at: now, autoRetry });
        return 'placeholder';
      }
      phase = next;
    }
  }

  let final = runOnce();
  while (final === 'placeholder' && autoRetry < maxRetries) {
    const delay = autoRetryDelayMs(now - attemptStart);
    if (delay == null) break;
    autoRetry += 1;
    now += delay;
    final = runOnce();
  }

  return { events, final, hotRequests, endedAt: now };
}

const full: ImageCascadeUrls = {
  cold: 'https://host/storage/v1/object/public/product-images/a/.variants/p/card.webp',
  hot: 'https://host/storage/v1/render/image/public/product-images/a/p.jpg?width=360',
  original: 'https://host/storage/v1/object/public/product-images/a/p.jpg',
};

describe('KioskImage cascade simulation', () => {
  it('1. WebP cold load succeeds without hot transform', () => {
    const r = simulateCascade({ urls: full, outcomes: { cold: 'load' } });
    expect(r.final).toBe('shown');
    expect(r.hotRequests).toBe(0);
  });

  it('2. 404 on cold advances to hot then can succeed', () => {
    const r = simulateCascade({
      urls: full,
      outcomes: { cold: 'error', hot: 'load' },
    });
    expect(r.final).toBe('shown');
    expect(r.hotRequests).toBe(1);
  });

  it('3. hang without onLoad/onError → placeholder; zero hot /render/', () => {
    const r = simulateCascade({
      urls: full,
      outcomes: { cold: 'hang' },
      maxAutoRetries: 0,
    });
    expect(r.events.some((e) => e.type === 'timeout' && e.phase === 'cold')).toBe(true);
    expect(r.final).toBe('placeholder');
    expect(r.hotRequests).toBe(0);
    expect(r.endedAt).toBe(IMAGE_PHASE_TIMEOUT_MS.cold);
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

  it('5. category change aborts in-flight cascade', () => {
    const r = simulateCascade({
      urls: full,
      outcomes: { cold: 'hang' },
      abortAtMs: 2_000,
    });
    expect(r.final).toBe('aborted');
  });

  it('6. hang + auto-retry stays inside the 22s attempt budget', () => {
    const r = simulateCascade({
      urls: full,
      outcomes: { cold: 'hang' },
      maxAutoRetries: 1,
    });
    expect(r.final).toBe('placeholder');
    expect(r.hotRequests).toBe(0);
    expect(r.endedAt).toBeLessThanOrEqual(IMAGE_TOTAL_BUDGET_MS);
    expect(r.events.filter((e) => e.type === 'timeout').length).toBeGreaterThanOrEqual(2);
  });

  it('7. missing cold WebP starts at hot', () => {
    const noCold: ImageCascadeUrls = { cold: null, hot: full.hot, original: full.original };
    const r = simulateCascade({ urls: noCold, outcomes: { hot: 'load' } });
    expect(r.final).toBe('shown');
    expect(r.hotRequests).toBe(1);
  });

  it('8. Supabase host hang: no stacked same-host fallbacks', () => {
    const r = simulateCascade({
      urls: full,
      outcomes: { cold: 'hang', hot: 'hang', original: 'hang' },
      maxAutoRetries: 0,
    });
    expect(r.final).toBe('placeholder');
    expect(r.hotRequests).toBe(0);
    expect(r.endedAt).toBeLessThanOrEqual(IMAGE_PHASE_TIMEOUT_MS.cold + 50);
  });

  it('9. many simultaneous hangs: N cold only, zero hot transforms', () => {
    const results = Array.from({ length: 12 }, () =>
      simulateCascade({
        urls: full,
        outcomes: { cold: 'hang' },
        maxAutoRetries: 0,
      }),
    );
    expect(results.every((r) => r.final === 'placeholder')).toBe(true);
    expect(results.every((r) => r.hotRequests === 0)).toBe(true);
  });
});
