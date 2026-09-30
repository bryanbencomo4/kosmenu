import { describe, expect, it } from 'vitest';

import {
  parseCategoryUpsellKind,
  parsePreCheckoutUpsell,
  resolvePreCheckoutSuggestions,
  shouldShowPreCheckoutUpsell,
  toPublicPreCheckoutUpsell,
} from '../app/_lib/pre-checkout-upsell';

const PIZZAS = 'cat-pizzas';
const BEBIDAS = 'cat-refrescos';
const POSTRES = 'cat-dulces';
const PAPAS = 'cat-papas';

const categories = [
  { id: PIZZAS, nombre: 'Pizzas', rol: null, orden: 0 },
  { id: BEBIDAS, nombre: 'Refrescos', rol: 'drink', orden: 1 },
  { id: POSTRES, nombre: 'Dulces', rol: 'dessert', orden: 2 },
  { id: PAPAS, nombre: 'Papas', rol: 'side', orden: 3 },
];

const products = [
  { id: 'pizza-1', categoria_id: PIZZAS, nombre: 'Pizza Campesina', precio: 16, orden: 0 },
  { id: 'pizza-2', categoria_id: PIZZAS, nombre: 'Pizza Especial', precio: 18, orden: 1 },
  { id: 'cola', categoria_id: BEBIDAS, nombre: 'Coca Cola', precio: 3, orden: 0 },
  { id: 'sprite', categoria_id: BEBIDAS, nombre: 'Sprite', precio: 3, orden: 1 },
  { id: 'brownie', categoria_id: POSTRES, nombre: 'Brownie', precio: 5, orden: 0 },
  { id: 'fries', categoria_id: PAPAS, nombre: 'Papas', precio: 4, orden: 0 },
  { id: 'sold-out', categoria_id: BEBIDAS, nombre: 'Agotada', precio: 3, disponible: false, orden: 2 },
];

const pizzaCart = [
  { productId: 'pizza-1', categoryId: PIZZAS },
  { productId: 'pizza-2', categoryId: PIZZAS },
];

describe('parseCategoryUpsellKind', () => {
  it('maps stored roles and Spanish types, never display names', () => {
    expect(parseCategoryUpsellKind('drink')).toBe('bebida');
    expect(parseCategoryUpsellKind('bebida')).toBe('bebida');
    expect(parseCategoryUpsellKind('dessert')).toBe('postre');
    expect(parseCategoryUpsellKind('side')).toBe('acompanamiento');
    expect(parseCategoryUpsellKind('acompañamiento')).toBe('acompanamiento');
    expect(parseCategoryUpsellKind('other')).toBe('otro');
    expect(parseCategoryUpsellKind('main')).toBeNull();
    expect(parseCategoryUpsellKind('Bebidas')).toBe('bebida');
  });

  it('does not treat an arbitrary restaurant name as a kind', () => {
    expect(parseCategoryUpsellKind('Combos')).toBeNull();
    expect(parseCategoryUpsellKind('Complementos')).toBe('acompanamiento');
  });
});

describe('parsePreCheckoutUpsell', () => {
  it('keeps current restaurants off when missing or { upselling:false }', () => {
    expect(parsePreCheckoutUpsell(undefined).activo).toBe(false);
    expect(parsePreCheckoutUpsell({ upselling: false }).activo).toBe(false);
    expect(parsePreCheckoutUpsell({ pre_checkout: { activo: false } }).activo).toBe(false);
  });

  it('reads the JSONB pre_checkout payload', () => {
    const config = parsePreCheckoutUpsell({
      pre_checkout: {
        activo: true,
        tipos: ['bebida', 'postre'],
        max_productos: 4,
        reglas: [{ categoria_id: PIZZAS, sugerir_tipos: ['bebida', 'postre'] }],
      },
    });
    expect(config.activo).toBe(true);
    expect(config.tipos).toEqual(['bebida', 'postre']);
    expect(config.reglas[0]?.sugerir_tipos).toEqual(['bebida', 'postre']);
  });
});

describe('toPublicPreCheckoutUpsell', () => {
  it('omits the public payload when inactive so nothing leaks', () => {
    expect(toPublicPreCheckoutUpsell({ upselling: false })).toBeNull();
    expect(toPublicPreCheckoutUpsell({ pre_checkout: { activo: false, secret: true } })).toBeNull();
  });

  it('exposes only the slim active payload', () => {
    const publicConfig = toPublicPreCheckoutUpsell({
      pre_checkout: { activo: true, tipos: ['bebida'], max_productos: 3, reglas: [] },
      owner_notes: 'no',
    });
    expect(publicConfig).toEqual({
      activo: true,
      tipos: ['bebida'],
      max_productos: 3,
      reglas: [],
      categorias: [],
    });
  });
});

describe('resolvePreCheckoutSuggestions', () => {
  it('caso 1: restaurante sin upselling no muestra nada', () => {
    const groups = resolvePreCheckoutSuggestions({
      config: { upselling: false },
      categories,
      products,
      cart: pizzaCart,
    });
    expect(groups).toEqual([]);
    expect(
      shouldShowPreCheckoutUpsell({
        config: { upselling: false },
        categories,
        products,
        cart: pizzaCart,
      }),
    ).toBe(false);
  });

  it('caso 2: pizzería con Refrescos/Dulces muestra esas categorías, no más pizzas', () => {
    const groups = resolvePreCheckoutSuggestions({
      config: {
        activo: true,
        tipos: ['bebida', 'postre'],
        max_productos: 4,
      },
      categories,
      products,
      cart: pizzaCart,
    });
    expect(groups.map((group) => group.categoryName)).toEqual(['Refrescos', 'Dulces']);
    expect(groups[0]?.products.map((product) => product.id)).toEqual(['cola', 'sprite']);
    expect(groups[1]?.products.map((product) => product.id)).toEqual(['brownie']);
    expect(groups.flatMap((group) => group.products.map((product) => product.id))).not.toContain('pizza-1');
    expect(groups.flatMap((group) => group.products.map((product) => product.id))).not.toContain('fries');
  });

  it('hamburguesería puede sugerir bebidas, postres y papas por regla de origen', () => {
    const burgers = 'cat-burgers';
    const groups = resolvePreCheckoutSuggestions({
      config: {
        activo: true,
        tipos: ['bebida'],
        max_productos: 4,
        reglas: [
          {
            categoria_origen: 'Hamburguesas',
            sugerir_tipos: ['bebida', 'postre', 'acompanamiento'],
          },
        ],
      },
      categories: [
        { id: burgers, nombre: 'Hamburguesas', rol: null, orden: 0 },
        ...categories.slice(1),
      ],
      products: [
        { id: 'burger', categoria_id: burgers, nombre: 'Clásica', precio: 15, orden: 0 },
        ...products,
      ],
      cart: [{ productId: 'burger', categoryId: burgers }],
    });
    expect(groups.map((group) => group.categoryName)).toEqual(['Refrescos', 'Dulces', 'Papas']);
  });

  it('caso 3: ignorar sugerencias es posible porque nunca bloquean (hay grupos o no hay sheet)', () => {
    expect(
      shouldShowPreCheckoutUpsell({
        config: { activo: true, tipos: ['bebida'] },
        categories,
        products,
        cart: pizzaCart,
      }),
    ).toBe(true);
    expect(
      shouldShowPreCheckoutUpsell({
        config: { activo: true, tipos: ['bebida'] },
        categories,
        products,
        cart: [],
      }),
    ).toBe(false);
  });

  it('caso 4: un producto ya en el carrito sigue visible para subir cantidad', () => {
    const after = resolvePreCheckoutSuggestions({
      config: { activo: true, tipos: ['bebida'], max_productos: 4 },
      categories,
      products,
      cart: [...pizzaCart, { productId: 'cola', categoryId: BEBIDAS }],
    });
    expect(after.flatMap((group) => group.products.map((product) => product.id))).toEqual([
      'cola',
      'sprite',
    ]);
  });

  it('caso 5: el motor no muta el pedido original', () => {
    const cart = [...pizzaCart];
    const catalog = [...products];
    resolvePreCheckoutSuggestions({
      config: { activo: true, tipos: ['bebida', 'postre'], max_productos: 4 },
      categories,
      products: catalog,
      cart,
    });
    expect(cart).toEqual(pizzaCart);
    expect(catalog.map((product) => product.id)).toEqual(products.map((product) => product.id));
  });

  it('sugiere por id de categoría configurado aunque el nombre no sea Bebidas y rol esté vacío', () => {
    const groups = resolvePreCheckoutSuggestions({
      config: {
        activo: true,
        tipos: ['bebida'],
        categorias: [{ id: BEBIDAS, tipo: 'bebida' }],
      },
      categories: [
        { id: PIZZAS, nombre: 'Pizzas', rol: null },
        { id: BEBIDAS, nombre: 'Refrescos', rol: null },
      ],
      products,
      cart: pizzaCart,
    });
    expect(groups.map((group) => group.categoryName)).toEqual(['Refrescos']);
    expect(groups[0]?.products.map((product) => product.id)).toContain('cola');
  });

  it('skips the sheet when enabled but there are no typed products', () => {
    expect(
      shouldShowPreCheckoutUpsell({
        config: { activo: true, tipos: ['bebida'] },
        categories: [{ id: PIZZAS, nombre: 'Pizzas', rol: null }],
        products: [{ id: 'pizza-1', categoria_id: PIZZAS, nombre: 'Pizza', precio: 16 }],
        cart: pizzaCart,
      }),
    ).toBe(false);
  });
});
