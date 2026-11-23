import { describe, expect, it } from 'vitest';

import {
  isBeverageShowcaseDish,
  pickRotatedShowcaseDishes,
  showcaseRotationBucket,
} from '../app/api/_lib/public-directory-showcase';

const food = (name: string) => ({
  name,
  imageUrl: `https://img.test/${encodeURIComponent(name)}.jpg`,
  price: 10,
  compareAtPrice: null as number | null,
  categoryName: 'Hamburguesas',
  categoryRole: null as string | null,
});

describe('isBeverageShowcaseDish', () => {
  it('excludes categories marked as bebida', () => {
    expect(
      isBeverageShowcaseDish({
        name: 'Pepsi',
        categoryName: 'Extras',
        categoryRole: 'bebida',
      }),
    ).toBe(true);
  });

  it('excludes Bebidas / Refrescos category names', () => {
    expect(
      isBeverageShowcaseDish({
        name: 'Hit',
        categoryName: 'Bebidas',
        categoryRole: null,
      }),
    ).toBe(true);
    expect(
      isBeverageShowcaseDish({
        name: 'Coca Cola',
        categoryName: 'Refrescos',
        categoryRole: null,
      }),
    ).toBe(true);
  });

  it('excludes clear drink product names even in food categories', () => {
    expect(
      isBeverageShowcaseDish({
        name: 'Refresco en botella',
        categoryName: 'Extras',
        categoryRole: null,
      }),
    ).toBe(true);
    expect(
      isBeverageShowcaseDish({
        name: 'Merengada',
        categoryName: 'Promociones',
        categoryRole: null,
      }),
    ).toBe(true);
  });

  it('keeps normal food products', () => {
    expect(
      isBeverageShowcaseDish({
        name: 'Hamburguesa clásica',
        categoryName: 'Hamburguesas',
        categoryRole: null,
      }),
    ).toBe(false);
    expect(
      isBeverageShowcaseDish({
        name: 'Pizza Pepperoni',
        categoryName: 'Pizzas',
        categoryRole: 'normal',
      }),
    ).toBe(false);
  });
});

describe('pickRotatedShowcaseDishes', () => {
  it('drops beverages and keeps food', () => {
    const picked = pickRotatedShowcaseDishes(
      [
        {
          ...food('Refresco'),
          categoryName: 'Bebidas',
          categoryRole: 'bebida',
        },
        food('Hamburguesa'),
        food('Papas'),
        {
          ...food('Jugo natural'),
          categoryName: 'Jugos',
        },
      ],
      'biz-1',
      4,
      0,
    );
    expect(picked.map((item) => item.name).sort()).toEqual(['Hamburguesa', 'Papas']);
  });

  it('changes selection across rotation buckets', () => {
    const candidates = Array.from({ length: 12 }, (_, i) => food(`Plato ${i + 1}`));
    const first = pickRotatedShowcaseDishes(candidates, 'biz-rot', 4, 0).map((item) => item.name);
    const laterBucketMs = 3 * 60 * 60 * 1000;
    expect(showcaseRotationBucket(laterBucketMs)).not.toBe(showcaseRotationBucket(0));
    const second = pickRotatedShowcaseDishes(candidates, 'biz-rot', 4, laterBucketMs).map(
      (item) => item.name,
    );
    expect(second).not.toEqual(first);
  });
});
