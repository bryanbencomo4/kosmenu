import { describe, expect, it } from 'vitest';

import {
  displayProductImage,
  optimizeMenuImageUrl,
  productImageUrl,
  resolveHeroCover,
} from '../app/v/[id]/_lib/product-image';

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

  it('requests a resized WebP variant for public Supabase Storage images', () => {
    const optimized = optimizeMenuImageUrl(
      'https://project.supabase.co/storage/v1/object/public/product-images/shop/pizza.png?download=0',
      320,
      70,
    );
    const url = new URL(optimized!);

    expect(url.pathname).toBe(
      '/storage/v1/render/image/public/product-images/shop/pizza.png',
    );
    expect(url.searchParams.get('download')).toBe('0');
    expect(url.searchParams.get('width')).toBe('320');
    expect(url.searchParams.get('quality')).toBe('70');
    expect(url.searchParams.get('format')).toBe('webp');
  });

  it('leaves external image URLs unchanged', () => {
    const external = 'https://cdn.example.com/menu/pizza.jpg';
    expect(optimizeMenuImageUrl(external, 320)).toBe(external);
    expect(optimizeMenuImageUrl(null)).toBeNull();
  });
});
