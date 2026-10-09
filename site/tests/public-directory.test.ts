import { describe, expect, it } from 'vitest';

import {
  compositeDiscoveryScore,
  matchDirectoryEntry,
  pickFeaturedDirectoryBusinesses,
  rankDirectorySearchResults,
  scoreDirectoryMatch,
} from '../app/api/_lib/public-directory-featured';
import { normalizeDirectoryQuery } from '../app/api/_lib/public-directory-text';

const sampleBusinesses = [
  {
    id: '1',
    slug: 'pizzas-el-trueno',
    nombre: 'pizzas el trueno',
    categoria: 'Pizzeria',
    direccion: 'Palmira, Tachira',
  },
  {
    id: '2',
    slug: 'donde-vladi',
    nombre: 'donde vladi',
    categoria: 'Restaurante',
    direccion: null,
    productNames: ['Hamburguesa clásica', 'Papas fritas'],
  },
  {
    id: '3',
    slug: 'cafe-centro',
    nombre: 'Cafe Centro',
    categoria: 'Cafe',
    direccion: 'Centro',
  },
  {
    id: '4',
    slug: 'burger-norte',
    nombre: 'Burger Norte',
    categoria: 'Comida rapida',
    direccion: null,
  },
];

describe('normalizeDirectoryQuery', () => {
  it('removes accents and lowercases', () => {
    expect(normalizeDirectoryQuery('  PizZá El Trueno  ')).toBe('pizza el trueno');
  });
});

describe('scoreDirectoryMatch', () => {
  it('matches slug fragments like trueno', () => {
    const score = scoreDirectoryMatch(sampleBusinesses[0], 'trueno');
    expect(score).toBeGreaterThan(0);
  });

  it('matches dish names even when the restaurant name differs', () => {
    const match = matchDirectoryEntry(sampleBusinesses[1], 'hamburguesa');
    expect(match.score).toBeGreaterThan(0);
    expect(match.matchedDish?.toLowerCase()).toContain('hamburguesa');
  });

  it('expands burger aliases to hamburguesa dishes', () => {
    const match = matchDirectoryEntry(sampleBusinesses[1], 'burger');
    expect(match.score).toBeGreaterThan(0);
  });
});

describe('rankDirectorySearchResults', () => {
  it('ranks pizzas el trueno for trueno query', () => {
    const ranked = rankDirectorySearchResults(sampleBusinesses, 'trueno');
    expect(ranked[0]?.slug).toBe('pizzas-el-trueno');
  });
});

describe('compositeDiscoveryScore', () => {
  it('prefers closer and better-rated matches with similar text score', () => {
    const near = compositeDiscoveryScore({
      matchScore: 58,
      distanceKm: 1.2,
      ratingAverage: 4.8,
      ratingCount: 12,
      promovido: false,
      hasOrigin: true,
    });
    const far = compositeDiscoveryScore({
      matchScore: 58,
      distanceKm: 18,
      ratingAverage: 3.2,
      ratingCount: 1,
      promovido: false,
      hasOrigin: true,
    });
    expect(near).toBeGreaterThan(far);
  });

  it('keeps distant name matches below nearby dish matches', () => {
    const localDish = compositeDiscoveryScore({
      matchScore: 58,
      distanceKm: 1.5,
      ratingAverage: 4.2,
      ratingCount: 4,
      promovido: false,
      hasOrigin: true,
    });
    const distantName = compositeDiscoveryScore({
      matchScore: 50,
      distanceKm: 500,
      ratingAverage: 4.5,
      ratingCount: 8,
      promovido: false,
      hasOrigin: true,
    });
    expect(localDish).toBeGreaterThan(distantName);
  });
});

describe('pickFeaturedDirectoryBusinesses', () => {
  it('returns top sellers plus one rotating pick', () => {
    const orderCounts = new Map([
      ['2', 12],
      ['1', 8],
      ['3', 1],
      ['4', 0],
    ]);

    const featured = pickFeaturedDirectoryBusinesses(
      sampleBusinesses,
      orderCounts,
      3,
      0,
    );

    expect(featured.map((entry) => entry.id)).toEqual(['2', '1', '3']);
  });
});
