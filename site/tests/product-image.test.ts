import { describe, expect, it } from 'vitest';

import {
  coldVariantUrl,
  resolveMenuImageSources,
  resolveMenuImageUrl,
} from '../app/_lib/optimize-storage-image';
import {
  displayProductImage,
  optimizeMenuImageUrl,
  productImageUrl,
  resolveCategoryCover,
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

  it('uses category image, else first product photo, never commerce logo', () => {
    const logo = 'https://x/logos-comercios/a.png';
    expect(
      resolveCategoryCover(null, [{ imagen_url: null }, { imagen_url: 'https://cdn/pizza.png' }], logo),
    ).toBe('https://cdn/pizza.png');
    expect(
      resolveCategoryCover('https://cdn/category.png', [{ imagen_url: 'https://cdn/pizza.png' }], logo),
    ).toBe('https://cdn/category.png');
    expect(resolveCategoryCover(null, [{ imagen_url: null }, { imagen_url: logo }], logo)).toBeNull();
    expect(resolveCategoryCover(logo, [{ imagen_url: 'https://cdn/pizza.png' }], logo)).toBe(
      'https://cdn/pizza.png',
    );
  });

  it('prefers cold WebP variant paths for public Supabase Storage images', () => {
    const original =
      'https://project.supabase.co/storage/v1/object/public/product-images/shop/pizza.png?download=0';
    const optimized = optimizeMenuImageUrl(original, 320, 70);
    expect(optimized).toBe(
      'https://project.supabase.co/storage/v1/object/public/product-images/shop/.variants/pizza/card.webp',
    );
    expect(coldVariantUrl(original, 'thumb', 'avif')).toBe(
      'https://project.supabase.co/storage/v1/object/public/product-images/shop/.variants/pizza/thumb.avif',
    );
  });

  it('exposes hot transform as fallback source', () => {
    const original =
      'https://project.supabase.co/storage/v1/object/public/product-images/shop/pizza.png';
    const sources = resolveMenuImageSources(original, 360)!;
    expect(sources.coldWebp).toContain('/.variants/pizza/card.webp');
    expect(sources.hot).toContain('/storage/v1/render/image/public/product-images/shop/pizza.png');
    expect(sources.hot).toContain('width=360');
    expect(resolveMenuImageUrl(original, 160)).toContain('/thumb.webp');
  });

  it('leaves external image URLs unchanged', () => {
    const external = 'https://cdn.example.com/menu/pizza.jpg';
    expect(optimizeMenuImageUrl(external, 320)).toBe(external);
    expect(optimizeMenuImageUrl(null)).toBeNull();
  });

  it('defaults tile width and caps logo fallback width', () => {
    const product =
      'https://project.supabase.co/storage/v1/object/public/product-images/shop/pizza.png';
    const logo =
      'https://project.supabase.co/storage/v1/object/public/logos-comercios/shop/logo.png';
    const tile = displayProductImage(product, logo)!;
    expect(tile).toContain('/.variants/pizza/card.webp');
    const logoOnly = displayProductImage('', logo)!;
    expect(logoOnly).toContain('/.variants/logo/card.webp');
  });
});
