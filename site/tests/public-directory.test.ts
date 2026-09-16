import { describe, expect, it } from 'vitest';

import {
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
});

describe('rankDirectorySearchResults', () => {
  it('ranks pizzas el trueno for trueno query', () => {
    const ranked = rankDirectorySearchResults(sampleBusinesses, 'trueno');
    expect(ranked[0]?.slug).toBe('pizzas-el-trueno');
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
