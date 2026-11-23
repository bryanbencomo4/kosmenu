import { describe, expect, it } from 'vitest';

import {
  adminBusinessDayEndExclusive,
  adminBusinessDayLabelDate,
  adminBusinessDayStart,
  adminBusinessDayStartForLabel,
  adminBusinessDayEndForLabel,
} from '../app/admin/_lib/admin-business-day';

describe('admin business day (Caracas calendar midnight)', () => {
  it('afternoon Caracas stays on same calendar day', () => {
    // 15:00 Caracas = 19:00 UTC
    const instant = new Date('2026-10-31T19:00:00.000Z');
    expect(adminBusinessDayLabelDate(instant).toISOString().slice(0, 10)).toBe(
      '2026-10-31',
    );
    expect(adminBusinessDayStart(instant).toISOString()).toBe(
      '2026-10-31T04:00:00.000Z',
    );
    expect(adminBusinessDayEndExclusive(instant).toISOString()).toBe(
      '2026-11-01T04:00:00.000Z',
    );
  });

  it('night Caracas order stays on same day (not next morning)', () => {
    // 21:00 Caracas Oct 31 = 01:00 UTC Nov 1
    const instant = new Date('2026-11-01T01:00:00.000Z');
    expect(adminBusinessDayLabelDate(instant).toISOString().slice(0, 10)).toBe(
      '2026-10-31',
    );
    expect(adminBusinessDayStart(instant).toISOString()).toBe(
      '2026-10-31T04:00:00.000Z',
    );
    expect(adminBusinessDayEndExclusive(instant).toISOString()).toBe(
      '2026-11-01T04:00:00.000Z',
    );
  });

  it('next Caracas day only starts at midnight', () => {
    // 00:30 Caracas Nov 1 = 04:30 UTC Nov 1
    const instant = new Date('2026-11-01T04:30:00.000Z');
    expect(adminBusinessDayLabelDate(instant).toISOString().slice(0, 10)).toBe(
      '2026-11-01',
    );
    expect(adminBusinessDayStart(instant).toISOString()).toBe(
      '2026-11-01T04:00:00.000Z',
    );
  });

  it('label helpers align with Caracas midnight', () => {
    const label = new Date(Date.UTC(2026, 9, 31));
    expect(adminBusinessDayStartForLabel(label).toISOString()).toBe(
      '2026-10-31T04:00:00.000Z',
    );
    expect(adminBusinessDayEndForLabel(label).toISOString()).toBe(
      '2026-11-01T04:00:00.000Z',
    );
  });
});
