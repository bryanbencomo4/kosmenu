import { describe, expect, it } from 'vitest';

import {
  buildFairDiscoveryProducts,
  formatDiscoveryPrice,
} from '../app/asistente/discovery-products';

describe('formatDiscoveryPrice', () => {
  it('formats USD and VES amounts', () => {
    expect(formatDiscoveryPrice(3.5, ['USD'])).toMatch(/\$3\.50/);
    expect(formatDiscoveryPrice(16000, ['VES'])).toMatch(/Bs/);
  });
});

describe('buildFairDiscoveryProducts', () => {
  it('round-robins so every restaurant appears before repeats', () => {
    const products = buildFairDiscoveryProducts(
      [
        {
          id: 'a',
          slug: 'a',
          nombre: 'Alegría',
          logoUrl: '/a.png',
          menuUrl: '/v/a',
          isOpen: true,
          currencies: ['USD'],
          showcaseDishes: [
            { name: 'Arepa 1', imageUrl: '/1.png', price: 2, compareAtPrice: null },
            { name: 'Arepa 2', imageUrl: '/2.png', price: 3, compareAtPrice: null },
          ],
        },
        {
          id: 'b',
          slug: 'b',
          nombre: 'Parche',
          logoUrl: '/b.png',
          menuUrl: '/v/b',
          isOpen: true,
          currencies: ['USD'],
          showcaseDishes: [
            { name: 'Arepa X', imageUrl: '/x.png', price: 4, compareAtPrice: 5 },
          ],
        },
        {
          id: 'c',
          slug: 'c',
          nombre: 'Tribu',
          logoUrl: '/c.png',
          menuUrl: '/v/c',
          isOpen: false,
          currencies: ['USD'],
          showcaseDishes: [
            { name: 'Arepa Y', imageUrl: '/y.png', price: 3.2, compareAtPrice: null },
          ],
        },
      ],
      { categoryId: 'arepas', limit: 3, nowMs: 1_700_000_000_000 },
    );

    expect(products).toHaveLength(3);
    const restaurants = products.map((p) => p.restaurantId);
    expect(new Set(restaurants).size).toBe(3);
    expect(products.every((p) => p.priceLabel && p.restaurantLogoUrl)).toBe(true);
  });

  it('never fills hamburguesas with unrelated plates from burger restaurants', () => {
    const products = buildFairDiscoveryProducts(
      [
        {
          id: 'tribu',
          slug: 'la-tribu',
          nombre: 'LA TRIBU CAFÉ',
          logoUrl: '/t.png',
          menuUrl: '/v/tribu',
          isOpen: true,
          currencies: ['USD'],
          showcaseDishes: [
            {
              name: 'PM - Hamburguesa SUPER TRIBU',
              imageUrl: '/h.png',
              price: 17,
              compareAtPrice: null,
            },
            {
              name: 'AM - Pastelitos Pabellón',
              imageUrl: '/p.png',
              price: 3,
              compareAtPrice: null,
            },
          ],
        },
        {
          id: 'edw',
          slug: 'edw-burguer',
          nombre: 'Edw Burguer SC',
          logoUrl: '/e.png',
          menuUrl: '/v/edw',
          isOpen: true,
          currencies: ['USD'],
          showcaseDishes: [
            {
              name: 'Alitas a la Broster',
              imageUrl: '/a.png',
              price: 8,
              compareAtPrice: null,
            },
            {
              name: 'Classic Burger',
              imageUrl: '/c.png',
              price: 6,
              compareAtPrice: null,
            },
          ],
        },
        {
          id: 'toro',
          slug: 'toro-bravo',
          nombre: 'TORO BRAVO',
          logoUrl: '/tb.png',
          menuUrl: '/v/toro',
          isOpen: true,
          currencies: ['USD'],
          showcaseDishes: [
            {
              name: 'Plato Navideño',
              imageUrl: '/n.png',
              price: 20,
              compareAtPrice: null,
            },
          ],
        },
      ],
      { categoryId: 'hamburguesas', limit: 12, nowMs: 1_700_000_000_000 },
    );

    expect(products.map((p) => p.name)).toEqual([
      'PM - Hamburguesa SUPER TRIBU',
      'Classic Burger',
    ]);
    expect(products.some((p) => /alitas|navideño|pastelito/i.test(p.name))).toBe(
      false,
    );
  });

  it('includes dishes whose menu category is hamburguesas even if the SKU name is generic', () => {
    const products = buildFairDiscoveryProducts(
      [
        {
          id: 'bladi',
          slug: 'bladi',
          nombre: 'Hamburgueseria Bladi',
          logoUrl: '/b.png',
          menuUrl: '/v/bladi',
          isOpen: true,
          currencies: ['COP'],
          showcaseDishes: [
            {
              name: 'VILLA',
              imageUrl: '/v.png',
              price: 12000,
              compareAtPrice: null,
              categoryName: 'Hamburguesas',
            },
            {
              name: 'Papas francesas',
              imageUrl: '/f.png',
              price: 3000,
              compareAtPrice: null,
              categoryName: 'Acompañantes',
            },
          ],
        },
      ],
      { categoryId: 'hamburguesas', limit: 8, nowMs: 1_700_000_000_000 },
    );

    expect(products.map((p) => p.name)).toEqual(['VILLA']);
  });
});
