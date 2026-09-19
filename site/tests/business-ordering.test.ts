import { describe, expect, it } from 'vitest';

import {
  BUSINESS_CLOSED_ERROR,
  BUSINESS_CLOSED_MESSAGE,
  evaluateBusinessOrdering,
} from '../app/api/_lib/business-hours';

const mondaySplit = {
  timezone: 'America/Caracas',
  days: {
    monday: {
      open: true,
      ranges: [
        { start: '08:00', end: '12:00' },
        { start: '18:00', end: '23:00' },
      ],
    },
  },
};

describe('checkout API business ordering', () => {
  it('allows a real order while the venue is inside a configured range', () => {
    const decision = evaluateBusinessOrdering({
      enLinea: true,
      horarios: mondaySplit,
      now: new Date('2026-09-14T13:30:00Z'),
    });
    expect(decision).toEqual({ allowed: true });
  });

  it('rejects when the configured schedule is closed', () => {
    const decision = evaluateBusinessOrdering({
      enLinea: true,
      horarios: mondaySplit,
      now: new Date('2026-09-14T18:00:00Z'),
    });
    expect(decision.allowed).toBe(false);
    if (decision.allowed === false) {
      expect(decision.error).toBe(BUSINESS_CLOSED_ERROR);
      expect(decision.message).toBe(BUSINESS_CLOSED_MESSAGE);
    }
  });

  it('rejects API bypass when the business is paused even if hours are open', () => {
    const decision = evaluateBusinessOrdering({
      enLinea: false,
      horarios: mondaySplit,
      now: new Date('2026-09-14T13:30:00Z'),
    });
    expect(decision.allowed).toBe(false);
    if (decision.allowed === false) {
      expect(decision.error).toBe('BUSINESS_CLOSED');
    }
  });

  it('does not invent a closed state when hours were never configured', () => {
    const decision = evaluateBusinessOrdering({
      enLinea: true,
      horarios: {},
      now: new Date('2026-09-14T18:00:00Z'),
    });
    expect(decision).toEqual({ allowed: true });
  });
});
