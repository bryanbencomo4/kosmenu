import { describe, expect, it, vi } from 'vitest';

import { buildOrderItemSnapshots, type SnapshotProductRow } from '../app/api/_lib/order-item-snapshots';
import type { CartLineSelection } from '../app/_lib/menu-product-options';
import { toPublicOrderTrackingResponse } from '../app/api/_lib/public-order';

const hamburguesaRow: SnapshotProductRow = {
  id: 'p1',
  categoria_id: 'c1',
  nombre: 'Hamburguesa Clásica',
  imagen_url: 'https://cdn.example.test/hamburguesa.jpg',
  precio: 5,
  opciones_menu: {
    activadas: true,
    grupos: [
      {
        id: 'g_tamano',
        nombre: 'Tamaño',
        tipo: 'unica',
        obligatorio: true,
        min: 1,
        max: 1,
        opciones: [
          { id: 'o_med', nombre: 'Mediana', precio: 1 },
          { id: 'o_gra', nombre: 'Grande', precio: 2 },
        ],
      },
      {
        id: 'g_extras',
        nombre: 'Extras',
        tipo: 'multiple',
        obligatorio: false,
        max: 5,
        opciones: [
          { id: 'o_queso', nombre: 'Extra queso', precio: 0.8 },
          { id: 'o_tocineta', nombre: 'Tocineta', precio: 1.5 },
        ],
      },
    ],
  },
};

function loaders(
  rows: SnapshotProductRow[] = [hamburguesaRow],
  categories = [{ id: 'c1', nombre: 'Hamburguesas' }],
) {
  return {
    loadProducts: vi.fn(async (ids: string[]) => rows.filter((row) => ids.includes(row.id))),
    loadCategories: vi.fn(async (ids: string[]) => categories.filter((row) => ids.includes(row.id))),
  };
}

describe('buildOrderItemSnapshots', () => {
  const customRows = (priceA = 30000, priceB = 40000): SnapshotProductRow[] => [
    { id: 'a', comercio_id: 'tenant', disponible: true, nombre: 'Producto A', precio: priceA,
      opciones_menu: { personalizacion: { version: 1,
        combinacion: { activada: true, titulo: 'Combina con', productos_compatibles: ['b'], regla_precio: 'max' },
        exclusiones: { activadas: true, titulo: '¿Quieres quitar algo?', ingredientes: [{ id: 'remove_a', nombre: 'Ingrediente A' }, { id: 'remove_c', nombre: 'Ingrediente C' }] },
      } } },
    { id: 'b', comercio_id: 'tenant', disponible: true, nombre: 'Producto B', precio: priceB,
      opciones_menu: { personalizacion: { version: 1, exclusiones: { activadas: true, titulo: '¿Quieres quitar algo?', ingredientes: [{ id: 'remove_b', nombre: 'Ingrediente B' }] } } } },
  ];
  const customize = (rows = customRows(), selection: CartLineSelection = { combinacion: { productId: 'b', seleccion: {} } }, quantity = 1) => buildOrderItemSnapshots({
    comercioId: 'tenant', items: [{ product_id: 'a', nombre: 'FORGED NAME', cantidad: quantity, precio: 1 }],
    selections: [selection], ...loaders(rows),
  });
  it.each([[30000, 40000, 40000], [50000, 35000, 50000]])('recalculates MAX %i/%i despite a forged frontend price', async (a, b, expected) => {
    const result = await customize(customRows(a, b));
    expect(result.ok && result.items[0].precio).toBe(expected);
    expect(result.ok && result.items[0].personalizacion?.regla_precio).toBe('max');
  });
  it('quantity applies after MAX and snapshots independent exclusions', async () => {
    const selection = { exclusionesIds: ['remove_a', 'remove_c'], combinacion: { productId: 'b', seleccion: { exclusionesIds: ['remove_b'] } } };
    const rows = customRows();
    const result = await customize(rows, selection, 2);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.items[0].precio * result.items[0].cantidad).toBe(80000);
    expect(result.items[0].personalizacion?.componentes.map((entry) => entry.exclusiones.map((ingredient) => ingredient.nombre)))
      .toEqual([['Ingrediente A', 'Ingrediente C'], ['Ingrediente B']]);
    rows[1].nombre = 'Renamed'; rows[1].precio = 90000;
    expect(result.items[0].personalizacion?.componentes[1].nombre).toBe('Producto B');
    expect(result.items[0].precio).toBe(40000);
    const publicOrder = toPublicOrderTrackingResponse({ id: 'qa', comercio_id: 'tenant', estado: 'pendiente', created_at: '2026-10-04T00:00:00Z', detalles: { items: result.items, moneda_base: 'COP', total: 80000 } }, 'QA', null);
    expect(publicOrder.items[0].name).toBe('(Combinación) Producto A + Producto B · Sin: Ingrediente A, Ingrediente C (Producto A), Ingrediente B (Producto B)');
    expect(publicOrder.items[0].name).not.toContain('remove_a');
    expect(publicOrder.items[0].name).not.toContain('Renamed');
  });
  it.each(['foreign', 'unavailable', 'missing', 'unauthorized', 'unpriced'])('rejects partner %s', async (kind) => {
    const rows = customRows();
    if (kind === 'foreign') rows[1].comercio_id = 'other';
    if (kind === 'unavailable') rows[1].disponible = false;
    if (kind === 'unpriced') rows[1].precio = 0;
    if (kind === 'missing') rows.pop();
    const result = await customize(rows, { combinacion: { productId: kind === 'unauthorized' ? 'c' : 'b', seleccion: {} } });
    expect(result.ok).toBe(false);
  });
  it('validates each product with its own required group ids', async () => {
    const rows = customRows();
    for (const [index, row] of rows.entries()) row.opciones_menu = { ...(row.opciones_menu as object), activadas: true, grupos: [{ id: `g${index}`, nombre: 'Formato', tipo: 'unica', obligatorio: true, opciones: [{ id: `o${index}`, nombre: 'Opción', precio: index ? 40000 : 20000 }] }] };
    const valid = { grupos: { g0: ['o0'] }, combinacion: { productId: 'b', seleccion: { grupos: { g1: ['o1'] } } } };
    const result = await customize(rows, valid);
    expect(result.ok && result.items[0].precio).toBe(80000);
    expect((await customize(rows, { ...valid, combinacion: { productId: 'b', seleccion: { grupos: { g0: ['o0'] } } } })).ok).toBe(false);
  });
  it('exclusions alone do not change price and cannot be forged', async () => {
    const rows = customRows();
    expect((await customize(rows, { exclusionesIds: ['remove_a'] })).ok).toBe(true);
    const result = await customize(rows, { exclusionesIds: ['remove_a'] });
    expect(result.ok && result.items[0].precio).toBe(30000);
    expect((await customize(rows, { exclusionesIds: ['forged'] })).ok).toBe(false);
  });
  it('stores image/category snapshots for simple lines without options', async () => {
    const deps = loaders();
    const result = await buildOrderItemSnapshots({
      items: [{ product_id: 'p1', nombre: 'Hamburguesa Clásica', cantidad: 2, precio: 5 }],
      selections: [null],
      ...deps,
    });
    expect(result).toEqual({
      ok: true,
      items: [{
        product_id: 'p1',
        nombre: 'Hamburguesa Clásica',
        cantidad: 2,
        precio: 5,
        imagen_url: 'https://cdn.example.test/hamburguesa.jpg',
        categoria_nombre: 'Hamburguesas',
      }],
    });
    expect(deps.loadProducts).toHaveBeenCalledWith(['p1']);
    expect(deps.loadCategories).toHaveBeenCalledWith(['c1']);
  });

  it('keeps legacy item payloads when the catalog product is unavailable', async () => {
    const result = await buildOrderItemSnapshots({
      items: [{ product_id: 'old-product', nombre: 'Pizza Pepperoni', cantidad: 2, precio: 6 }],
      selections: [null],
      ...loaders([]),
    });
    expect(result).toEqual({
      ok: true,
      items: [{ product_id: 'old-product', nombre: 'Pizza Pepperoni', cantidad: 2, precio: 6 }],
    });
  });

  it('freezes the options snapshot with DB names and prices', async () => {
    const result = await buildOrderItemSnapshots({
      items: [
        { product_id: 'p1', nombre: 'Hamburguesa Clásica · Grande · Tocineta', cantidad: 1, precio: 8.5 },
      ],
      selections: [{ grupos: { g_tamano: ['o_gra'], g_extras: ['o_tocineta'] } }],
      ...loaders(),
    });
    expect(result).toEqual({
      ok: true,
      items: [
        {
          product_id: 'p1',
          nombre: 'Hamburguesa Clásica · Grande · Tocineta',
          cantidad: 1,
          precio: 8.5,
          imagen_url: 'https://cdn.example.test/hamburguesa.jpg',
          categoria_nombre: 'Hamburguesas',
          producto: 'Hamburguesa Clásica',
          precio_base: 5,
          selecciones: [
            { grupo: 'Tamaño', opcion: 'Grande', precio: 2 },
            { grupo: 'Extras', opcion: 'Tocineta', precio: 1.5 },
          ],
          precio_final: 8.5,
          seleccion: { grupos: { g_tamano: ['o_gra'], g_extras: ['o_tocineta'] } },
        },
      ],
    });
  });

  it('stores switched-off products like simple ones (no group validation)', async () => {
    const off: SnapshotProductRow = {
      ...hamburguesaRow,
      opciones_menu: { ...(hamburguesaRow.opciones_menu as object), activadas: false },
    };
    const result = await buildOrderItemSnapshots({
      items: [{ product_id: 'p1', nombre: 'Hamburguesa Clásica', cantidad: 1, precio: 5 }],
      selections: [{}],
      ...loaders([off]),
    });
    expect(result).toEqual({
      ok: true,
      items: [{
        product_id: 'p1',
        nombre: 'Hamburguesa Clásica',
        cantidad: 1,
        precio: 5,
        imagen_url: 'https://cdn.example.test/hamburguesa.jpg',
        categoria_nombre: 'Hamburguesas',
      }],
    });
  });

  it('rejects a tampered or stale unit price', async () => {
    const result = await buildOrderItemSnapshots({
      items: [{ product_id: 'p1', nombre: 'Hamburguesa', cantidad: 1, precio: 5 }],
      selections: [{ grupos: { g_tamano: ['o_gra'] } }],
      ...loaders(),
    });
    expect(result).toMatchObject({ ok: false, status: 409, code: 'PRICE_CHANGED' });
  });

  it('rejects a missing required group', async () => {
    const result = await buildOrderItemSnapshots({
      items: [{ product_id: 'p1', nombre: 'Hamburguesa', cantidad: 1, precio: 5 }],
      selections: [{}],
      ...loaders(),
    });
    expect(result).toMatchObject({
      ok: false,
      status: 400,
      code: 'INVALID_OPTIONS',
      message: 'Hamburguesa Clásica: Elige una opción de Tamaño.',
    });
  });

  it('rejects group selections for a product from another comercio (not returned by the scoped loader)', async () => {
    const result = await buildOrderItemSnapshots({
      items: [{ product_id: 'p1', nombre: 'Hamburguesa', cantidad: 1, precio: 7 }],
      selections: [{ grupos: { g_tamano: ['o_gra'] } }],
      ...loaders([]),
    });
    expect(result).toMatchObject({ ok: false, status: 409, code: 'PRODUCT_UNAVAILABLE' });
  });

  it('keeps legacy size lines at the price the customer saw', async () => {
    const legacy: SnapshotProductRow = {
      id: 'p3',
      categoria_id: null,
      nombre: 'Campesina',
      precio: 4.8,
      opciones_menu: { tamanos: [{ id: 'g', label: 'Grande (G)', precio: 12 }] },
    };
    const result = await buildOrderItemSnapshots({
      items: [{ product_id: 'p3', nombre: 'Campesina · Grande (G)', cantidad: 1, precio: 12 }],
      selections: [{ tamanoId: 'g', tamanoLabel: 'Grande (G)' }],
      ...loaders([legacy]),
    });
    expect(result.ok && result.items[0]).toMatchObject({
      producto: 'Campesina',
      precio_base: 12,
      selecciones: [{ grupo: 'Tamaño', opcion: 'Grande (G)', precio: 0 }],
      precio_final: 12,
    });
  });

  it('freezes the resolved dependent extra, not the rule definition', async () => {
    const row: SnapshotProductRow = {
      id: 'p_dep',
      categoria_id: null,
      nombre: 'Campesina',
      precio: 0,
      opciones_menu: {
        activadas: true,
        grupos: [
          {
            id: 'tamano',
            nombre: 'Tamaño',
            tipo: 'unica',
            obligatorio: true,
            opciones: [
              { id: 'normal', nombre: 'Normal', precio: 16161 },
              { id: 'grande', nombre: 'Grande', precio: 21500 },
            ],
          },
          {
            id: 'extras',
            nombre: 'Extras',
            tipo: 'multiple',
            opciones: [
              {
                id: 'queso_extra',
                nombre: 'Extra queso',
                precio_base: 0,
                reglas_precio: [
                  { cuando: { grupo: 'tamano', opcion: 'grande' }, precio: 5000 },
                ],
              },
            ],
          },
        ],
      },
    };
    const result = await buildOrderItemSnapshots({
      items: [{ product_id: 'p_dep', nombre: 'Campesina · Grande · Extra queso', cantidad: 1, precio: 26500 }],
      selections: [{ grupos: { tamano: ['grande'], extras: ['queso_extra'] } }],
      ...loaders([row]),
    });
    expect(result.ok && result.items[0]).toMatchObject({
      producto: 'Campesina',
      precio_base: 0,
      selecciones: [
        { grupo: 'Tamaño', opcion: 'Grande', precio: 21500 },
        { grupo: 'Extras', opcion: 'Extra queso', precio: 5000 },
      ],
      precio_final: 26500,
    });
  });
});
