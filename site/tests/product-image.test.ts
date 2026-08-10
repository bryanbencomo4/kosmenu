import { describe, expect, it } from 'vitest';

import { displayProductImage, productImageUrl, resolveHeroCover } from '../app/v/[id]/_lib/product-image';

describe('product image resolution', () => {
  it('ignores commerce logo urls as product images but allows logo display fallback', () => {
    const logo = 'https://x/logos-comercios/a.png';
    expect(productImageUrl(logo, logo)).toBeNull();
    expect(productImageUrl('', logo)).toBeNull();
    expect(productImageUrl('https://x/products/pizza.png', logo)).toBe('https://x/products/pizza.png');
    expect(displayProductImage('', logo)).toBe(logo);
    expect(displayProductImage(logo, logo)).toBe(logo);
    expect(resolveHeroCover([{ imagen_url: null }], logo)).toBe(logo);
  });

  it('picks the first real product photo for the hero cover', () => {
    const logo = 'https://x/logos-comercios/a.png';
    const cover = resolveHeroCover(
      [{ imagen_url: null }, { imagen_url: 'https://cdn/pizza.png' }],
      logo,
    );
    expect(cover).toBe('https://cdn/pizza.png');
  });
});
