import { describe, expect, it } from 'vitest';
import { formatRelativeOrderTime } from '../app/_lib/relative-order-time';

describe('restored relative order times', () => {
  const now = new Date('2026-10-01T12:00:00Z');
  it('formats recent orders', () => {
    expect(formatRelativeOrderTime('2026-10-01T12:00:00Z', now)).toBe('ahora');
    expect(formatRelativeOrderTime('2026-10-01T11:59:00Z', now)).toBe('hace 1 min');
    expect(formatRelativeOrderTime('2026-10-01T11:00:00Z', now)).toBe('hace 1h');
  });
  it('formats older orders', () => {
    expect(formatRelativeOrderTime('2026-09-29T12:00:00Z', now)).toBe('hace 2 días');
    expect(formatRelativeOrderTime('2026-09-23T12:00:00Z', now)).toBe('desde el miércoles');
  });
  it('handles absent and invalid dates', () => {
    expect(formatRelativeOrderTime(null, now)).toBe('');
    expect(formatRelativeOrderTime('invalid', now)).toBe('');
  });
});