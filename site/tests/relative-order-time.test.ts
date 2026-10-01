import { describe, expect, it } from 'vitest';

import { formatRelativeOrderTime } from '../app/_lib/relative-order-time';

describe('formatRelativeOrderTime', () => {
  const now = new Date('2026-10-01T12:00:00.000Z');

  it('uses conversational labels for recent orders', () => {
    expect(formatRelativeOrderTime('2026-10-01T12:00:00.000Z', now)).toBe('ahora');
    expect(formatRelativeOrderTime('2026-10-01T11:59:00.000Z', now)).toBe('hace 1 min');
    expect(formatRelativeOrderTime('2026-10-01T11:00:00.000Z', now)).toBe('hace 1h');
  });

  it('uses days, then the weekday for older orders', () => {
    expect(formatRelativeOrderTime('2026-09-29T12:00:00.000Z', now)).toBe('hace 2 días');
    expect(formatRelativeOrderTime('2026-09-23T12:00:00.000Z', now)).toBe('desde el miércoles');
  });

  it('handles missing or invalid timestamps without throwing', () => {
    expect(formatRelativeOrderTime(null, now)).toBe('');
    expect(formatRelativeOrderTime('not-a-date', now)).toBe('');
  });
});
