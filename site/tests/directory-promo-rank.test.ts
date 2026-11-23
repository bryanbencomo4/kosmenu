import { describe, expect, it } from 'vitest';

import {
  rankPromotedDelivery,
  scorePromoDelivery,
} from '../app/api/_lib/directory-promo-rank';

describe('scorePromoDelivery', () => {
  it('boosts under-delivered restaurants vs over-delivered ones', () => {
    const under = scorePromoDelivery({
      stats: {
        comercioId: 'a',
        impressions: 10,
        uniqueVisitors: 8,
        clicks: 1,
        orders: 0,
      },
      totalImpressions: 200,
      cohortSize: 4,
      isOpen: true,
    });
    const over = scorePromoDelivery({
      stats: {
        comercioId: 'b',
        impressions: 140,
        uniqueVisitors: 90,
        clicks: 8,
        orders: 1,
      },
      totalImpressions: 200,
      cohortSize: 4,
      isOpen: true,
    });
    expect(under).toBeGreaterThan(over * 0.85);
  });

  it('prefers higher CTR when impression share is similar', () => {
    const highCtr = scorePromoDelivery({
      stats: {
        comercioId: 'a',
        impressions: 100,
        uniqueVisitors: 80,
        clicks: 18,
        orders: 3,
      },
      totalImpressions: 200,
      cohortSize: 2,
      isOpen: true,
    });
    const lowCtr = scorePromoDelivery({
      stats: {
        comercioId: 'b',
        impressions: 100,
        uniqueVisitors: 80,
        clicks: 2,
        orders: 0,
      },
      totalImpressions: 200,
      cohortSize: 2,
      isOpen: true,
    });
    expect(highCtr).toBeGreaterThan(lowCtr);
  });
});

describe('rankPromotedDelivery', () => {
  it('surfaces the least-impressed business early when others dominate', () => {
    const candidates = [
      { id: 'dominant', isOpen: true as const },
      { id: 'starved', isOpen: true as const },
      { id: 'mid', isOpen: true as const },
    ];
    const stats = new Map([
      [
        'dominant',
        {
          comercioId: 'dominant',
          impressions: 300,
          uniqueVisitors: 200,
          clicks: 20,
          orders: 2,
        },
      ],
      [
        'mid',
        {
          comercioId: 'mid',
          impressions: 80,
          uniqueVisitors: 50,
          clicks: 6,
          orders: 1,
        },
      ],
      [
        'starved',
        {
          comercioId: 'starved',
          impressions: 5,
          uniqueVisitors: 4,
          clicks: 0,
          orders: 0,
        },
      ],
    ]);

    const ranked = rankPromotedDelivery(candidates, stats, 'test-seed-hour');
    expect(ranked[0]?.id).toBe('starved');
  });
});
