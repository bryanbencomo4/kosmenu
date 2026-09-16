import { describe, expect, it } from 'vitest';

import {
  buildCartLineKey,
  formatProductPriceLabel,
  parseCartLineKey,
  productRequiresConfiguration,
  resolveCartLineUnitPrice,
} from '../app/_lib/menu-product-options';

describe('menu-product-options', () => {
  it('detects configurable products with sizes', () => {
    const product = {
      id: '1',
      nombre: 'Campesina',
      precio: 4.8,
      opciones_menu: {
        tamanos: [
          { id: 'n', label: 'Normal (N)', precio: 4.8 },
          { id: 'g', label: 'Grande (G)', precio: 12 },
        ],
      },
    };

    expect(productRequiresConfiguration(product, null)).toBe(true);
    expect(formatProductPriceLabel(product, (value) => `$${value.toFixed(2)}`)).toBe('Desde $4.80');
  });

  it('resolves unit price with size and servicio adicional', () => {
    const product = {
      id: '1',
      nombre: 'Campesina',
      precio: 4.8,
      opciones_menu: {
        tamanos: [
          { id: 'n', label: 'Normal (N)', precio: 4.8 },
          { id: 'g', label: 'Grande (G)', precio: 12 },
        ],
      },
    };
    const category = {
      opciones_menu: {
        servicio_adicional: {
          precios_por_tamano: { n: 0.4, g: 1.1 },
        },
      },
    };

    const selection = { tamanoId: 'g', tamanoLabel: 'Grande (G)', servicioAdicional: true };
    expect(resolveCartLineUnitPrice(product, category, selection)).toBe(13.1);
  });

  it('roundtrips cart line keys', () => {
    const key = buildCartLineKey('abc', {
      tamanoId: 'n',
      tamanoLabel: 'Normal (N)',
      servicioAdicional: true,
      ajusteIds: ['sin-cebolla'],
    });

    expect(parseCartLineKey(key).productId).toBe('abc');
    expect(parseCartLineKey(key).selection.tamanoId).toBe('n');
    expect(parseCartLineKey(key).selection.servicioAdicional).toBe(true);
  });
});
