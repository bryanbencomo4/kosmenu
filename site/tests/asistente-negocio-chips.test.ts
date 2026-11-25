import { describe, expect, it } from 'vitest';

import {
  adminCatalogChips,
  suggestBusinessChips,
} from '../app/api/asistente-negocio/_lib/chips';
import { buildMenuView } from '../app/api/asistente-negocio/_lib/menu-view';
import type { BusinessShop } from '../app/api/asistente-negocio/_lib/auth';

const shop: BusinessShop = {
  comercioId: 'c1',
  nombre: 'Pizzería Trueno',
  slug: 'pizzeria-trueno',
  role: 'owner',
  moneda: 'USD',
  tasa: null,
  enLinea: true,
  horarios: null,
};

describe('suggestBusinessChips', () => {
  it('puts Ver menú first on boot', () => {
    const chips = suggestBusinessChips({
      phase: 'boot',
      shop,
      metrics: { ordersToday: 0, salesToday: 0, customersToday: 0 },
    });
    expect(chips[0]?.text).toBe('ver menú');
  });

  it('after menu shows manage actions, not product dump', () => {
    const chips = suggestBusinessChips({
      phase: 'turn',
      shop,
      intent: { kind: 'list_menu' },
      result: {
        text: 'menu',
        productsSample: [
          { id: '1', nombre: 'Margarita', precio: 10, disponible: true },
          { id: '2', nombre: 'Pepperoni', precio: 12, disponible: true },
        ],
      },
    });
    const texts = chips.map((c) => c.text);
    expect(texts).toContain('cambiar precio');
    expect(texts).toContain('agotar');
    expect(texts).toContain('cambiar foto');
    expect(texts.some((t) => /Margarita|Pepperoni/i.test(t))).toBe(false);
    expect(texts).not.toContain('ver menú');
  });

  it('catalog covers daily merchant actions', () => {
    const texts = adminCatalogChips().map((c) => c.text);
    expect(texts[0]).toBe('ver menú');
    expect(texts).toEqual(
      expect.arrayContaining([
        'pedidos',
        'cambiar precio',
        'tasa de cambio',
        'cambiar foto',
        'agotar',
        'activar',
        'ocultar producto',
      ]),
    );
  });
});

describe('buildMenuView', () => {
  it('groups products by category for carousels', () => {
    const view = buildMenuView(
      shop,
      [
        { id: 'cat-p', nombre: 'Pizzas', imagen_url: null },
        { id: 'cat-d', nombre: 'Bebidas', imagen_url: null },
      ],
      [
        {
          id: '1',
          nombre: 'Margarita',
          precio: 10,
          disponible: true,
          categoria_id: 'cat-p',
          imagen_url: null,
        },
        {
          id: '2',
          nombre: 'Agua',
          precio: 1,
          disponible: true,
          categoria_id: 'cat-d',
          imagen_url: null,
        },
        {
          id: '3',
          nombre: 'Extra',
          precio: 2,
          disponible: false,
          categoria_id: null,
          imagen_url: null,
        },
      ],
    );
    expect(view.categories.map((c) => c.name)).toEqual([
      'Pizzas',
      'Bebidas',
      'Sin categoría',
    ]);
    expect(view.categories[0]?.productCount).toBe(1);
    expect(view.products).toHaveLength(3);
  });
});
