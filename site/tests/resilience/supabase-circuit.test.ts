import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  CircuitOpenError,
  SupabaseCircuitBreaker,
  isTransientSupabaseFailure,
} from '../../app/api/_lib/supabase-circuit';
import { nextPollDelayMs } from '../../app/_lib/poll-backoff';

describe('SupabaseCircuitBreaker', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('opens after five consecutive failures and blocks calls', () => {
    const breaker = new SupabaseCircuitBreaker(5, 45_000);
    for (let index = 0; index < 5; index += 1) breaker.recordFailure();
    expect(breaker.snapshot().state).toBe('open');
    expect(breaker.allow()).toBe(false);
  });

  it('half-opens after cooldown and closes on success', () => {
    vi.useFakeTimers();
    const breaker = new SupabaseCircuitBreaker(2, 1_000);
    breaker.recordFailure();
    breaker.recordFailure();
    expect(breaker.allow()).toBe(false);
    vi.advanceTimersByTime(1_001);
    expect(breaker.allow()).toBe(true);
    expect(breaker.snapshot().state).toBe('half_open');
    breaker.recordSuccess();
    expect(breaker.snapshot().state).toBe('closed');
    expect(breaker.allow()).toBe(true);
  });

  it('reopens immediately if the probe fails', () => {
    vi.useFakeTimers();
    const breaker = new SupabaseCircuitBreaker(1, 1_000);
    breaker.recordFailure();
    vi.advanceTimersByTime(1_001);
    expect(breaker.allow()).toBe(true);
    breaker.recordFailure();
    expect(breaker.allow()).toBe(false);
  });
});

describe('isTransientSupabaseFailure', () => {
  it('treats timeouts and circuit errors as transient', () => {
    expect(isTransientSupabaseFailure(new Error('timeout'))).toBe(true);
    expect(isTransientSupabaseFailure(new CircuitOpenError())).toBe(true);
    expect(isTransientSupabaseFailure(new Error('invalid slug'))).toBe(false);
  });
});

describe('nextPollDelayMs', () => {
  it('backs off 10s → 30s → 60s → 120s after failures', () => {
    expect(nextPollDelayMs(0, 20_000)).toBe(20_000);
    expect(nextPollDelayMs(1)).toBe(10_000);
    expect(nextPollDelayMs(2)).toBe(30_000);
    expect(nextPollDelayMs(3)).toBe(60_000);
    expect(nextPollDelayMs(8)).toBe(120_000);
  });
});
