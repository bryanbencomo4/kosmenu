import { describe, expect, it } from 'vitest';

import {
  categoryChipMatches,
  distanceKm,
  toFiniteCoord,
} from '../app/api/_lib/public-directory-geo';

describe('distanceKm', () => {
  it('returns roughly 0 for the same point', () => {
    expect(distanceKm(10.48, -66.9, 10.48, -66.9)).toBeLessThan(0.01);
  });

  it('measures a short Caracas-area hop in kilometers', () => {
    const km = distanceKm(10.48, -66.9, 10.5, -66.88);
    expect(km).toBeGreaterThan(1);
    expect(km).toBeLessThan(10);
  });
});

describe('categoryChipMatches', () => {
  it('matches burger-like categories', () => {
    expect(categoryChipMatches('Hamburguesas artesanales', 'hamburguesas')).toBe(true);
    expect(categoryChipMatches('Pizzería', 'pizzas')).toBe(true);
    expect(categoryChipMatches('Sushi bar', 'sushi')).toBe(true);
  });
});

describe('toFiniteCoord', () => {
  it('parses numeric coords and rejects junk', () => {
    expect(toFiniteCoord('10.5')).toBe(10.5);
    expect(toFiniteCoord('nope')).toBeNull();
  });
});
