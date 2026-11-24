import { describe, expect, it } from 'vitest';

import {
  buildDirectoryCategoryStats,
  categoryChipMatches,
  dishMatchesDirectoryCategory,
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

  it('does not treat comida rápida as hamburguesas', () => {
    expect(categoryChipMatches('Comida rápida', 'hamburguesas')).toBe(false);
  });

  it('matches arepas and pollo dishes without inventing empty chips', () => {
    expect(categoryChipMatches('El Parche del Gato — Arepas', 'arepas')).toBe(true);
    expect(categoryChipMatches('Pollo Broaster', 'pollo')).toBe(true);
    expect(categoryChipMatches('Pastelitos Pabellón', 'arepas')).toBe(false);
  });
});

describe('dishMatchesDirectoryCategory', () => {
  it('matches by product name or by menu category label', () => {
    expect(
      dishMatchesDirectoryCategory(
        { name: 'Classic', categoryName: 'Hamburguesas' },
        'hamburguesas',
      ),
    ).toBe(true);
    expect(
      dishMatchesDirectoryCategory(
        { name: 'Smash burger doble', categoryName: 'Combos' },
        'hamburguesas',
      ),
    ).toBe(true);
    expect(
      dishMatchesDirectoryCategory(
        { name: 'Alitas', categoryName: 'Acompañantes' },
        'hamburguesas',
      ),
    ).toBe(false);
    expect(
      dishMatchesDirectoryCategory(
        { name: 'Reina pepeada', categoryName: 'Arepas' },
        'arepas',
      ),
    ).toBe(true);
  });
});

describe('buildDirectoryCategoryStats', () => {
  it('keeps only real supply and ranks important categories first', () => {
    const stats = buildDirectoryCategoryStats([
      {
        id: '1',
        nombre: 'Edw Burguer SC',
        slug: 'edw-burguer',
        categoria: 'Restaurante',
        productNames: ['Classic', 'Oklahoma'],
        coverUrl: 'https://cdn/burger.png',
      },
      {
        id: '2',
        nombre: 'Auto Pizzas Nápoles',
        slug: 'auto-pizzas-napoles',
        categoria: 'Restaurante',
        productNames: ['Pepperoni', 'Margarita'],
        coverUrl: 'https://cdn/pizza.png',
      },
      {
        id: '3',
        nombre: 'El Parche del Gato — Arepas',
        slug: 'parche-arepas',
        categoria: 'Comida rápida',
        productNames: ['Arepa reina', 'Jugo'],
        coverUrl: 'https://cdn/arepa.png',
      },
      {
        id: '4',
        nombre: 'Sushi Delivery Coro',
        slug: 'sushi-delivery-coro',
        categoria: 'Restaurante',
        productNames: ['ALASKA', 'BERLIN ROLL'],
        coverUrl: 'https://cdn/sushi.png',
      },
    ]);

    expect(stats.every((s) => s.count > 0)).toBe(true);
    expect(stats.find((s) => s.id === 'tacos')).toBeUndefined();
    expect(stats.find((s) => s.id === 'bares')).toBeUndefined();
    expect(stats.map((s) => s.id)).toEqual(
      expect.arrayContaining(['hamburguesas', 'pizzas', 'arepas', 'sushi']),
    );
    expect(stats[0]?.score).toBeGreaterThanOrEqual(stats[1]?.score || 0);
  });
});

describe('toFiniteCoord', () => {
  it('parses numeric coords and rejects junk', () => {
    expect(toFiniteCoord('10.5')).toBe(10.5);
    expect(toFiniteCoord('nope')).toBeNull();
  });
});
