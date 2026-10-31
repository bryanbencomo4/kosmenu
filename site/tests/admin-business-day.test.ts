import { describe, expect, it } from 'vitest';

import {
  adminBusinessDayEndExclusive,
  adminBusinessDayLabelDate,
  adminBusinessDayStart,
  adminBusinessDayStartForLabel,
  adminBusinessDayEndForLabel,
} from '../app/admin/_lib/admin-business-day';

describe('admin business day (20:00 Caracas)', () => {
  it('before 20:00 Caracas stays on same calendar label day', () => {
    // 15:00 Caracas = 19:00 UTC
    const instant = new Date('2026-10-31T19:00:00.000Z');
    expect(adminBusinessDayLabelDate(instant).toISOString().slice(0, 10)).toBe(
      '2026-10-31',
    );
    expect(adminBusinessDayStart(instant).toISOString()).toBe(
      '2026-10-31T00:00:00.000Z',
    );
    expect(adminBusinessDayEndExclusive(instant).toISOString()).toBe(
      '2026-11-01T00:00:00.000Z',
    );
  });

  it('at/after 20:00 Caracas rolls into next business day', () => {
    const instant = new Date('2026-11-01T00:30:00.000Z'); // 20:30 Caracas Oct 31
    expect(adminBusinessDayLabelDate(instant).toISOString().slice(0, 10)).toBe(
      '2026-11-01',
    );
    expect(adminBusinessDayStart(instant).toISOString()).toBe(
      '2026-11-01T00:00:00.000Z',
    );
  });

  it('label helpers align with 20:00 Caracas close', () => {
    const label = new Date(Date.UTC(2026, 9, 31));
    expect(adminBusinessDayStartForLabel(label).toISOString()).toBe(
      '2026-10-31T00:00:00.000Z',
    );
    expect(adminBusinessDayEndForLabel(label).toISOString()).toBe(
      '2026-11-01T00:00:00.000Z',
    );
  });
});
