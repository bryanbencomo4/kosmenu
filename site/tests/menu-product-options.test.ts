import { afterEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ProductOptionsSheet } from '../app/v/[id]/_components/ProductOptionsSheet';

import {
  parseProductMenuOptions,
  buildCartLineKey,
  formatProductPriceLabel,
  parseCartLineKey,
  productRequiresConfiguration,
  resolveCartLineUnitPrice,
  parseProductPersonalization,
  resolveCombinedUnitPrice,
  validateCustomizationSelection,
  autoPartnerSelection,
  buildOrderLineLabel,
  summarizeCartLineSelection,
} from '../app/_lib/menu-product-options';

describe('combined second product is never configured by the shopper', () => {
  const pizza = (id: string, grande: number, extra = true) => ({
    id, nombre: id, precio: 16000, comercio_id: 'c',
    opciones_menu: { activadas: true, grupos: [
      { id: `${id}_t`, nombre: 'Tamaños', tipo: 'unica', min: 1, max: 1, obligatorio: true, opciones: [
        { id: `${id}_n`, nombre: 'Normal', precio: 0, activo: true },
        { id: `${id}_g`, nombre: 'Grande', precio: grande, activo: true, predeterminada: true },
      ] },
      ...(extra ? [{ id: `${id}_e`, nombre: 'Extras', tipo: 'unica', min: 0, max: 1, opciones: [
        { id: `${id}_x`, nombre: 'Añadir extra', precio: 2000, activo: true, texto_libre: true },
      ] }] : []),
    ], personalizacion: { version: 1,
      combinacion: { activada: true, titulo: 'Combina con', productos_compatibles: ['b'], regla_precio: 'max' },
      exclusiones: { activadas: true, titulo: 'Quitar', ingredientes: [{ id: 'r_1', nombre: 'Queso' }] } } },
  });

  it('mirrors the size picked for the first product and adds nothing else', () => {
    const a = pizza('a', 24000);
    const b = pizza('b', 28000);
    expect(autoPartnerSelection(a, { grupos: { a_t: ['a_n'], a_e: ['a_x'] }, exclusionesIds: ['r_1'] }, b))
      .toEqual({ grupos: { b_t: ['b_n'] } });
    const grande = autoPartnerSelection(a, { grupos: { a_t: ['a_g'] } }, b);
    expect(grande).toEqual({ grupos: { b_t: ['b_g'] } });
    expect(validateCustomizationSelection(b, grande)).toEqual([]);
    const line = { grupos: { a_t: ['a_g'] }, combinacion: { productId: 'b', seleccion: grande } };
    expect(resolveCombinedUnitPrice(a, null, line, b)).toBe(16000 + 28000);
    expect(buildOrderLineLabel({ ...a, nombre: 'Especial Nápoles' }, line, null, { ...b, nombre: 'Margarita' }))
      .toBe('(Combinación) Especial Nápoles + Margarita');
    expect(summarizeCartLineSelection(a, line, null, b)).toBe('Tamaños: Grande');
  });

  it('falls back to the default, then the first listed option, and handles simple products', () => {
    const a = pizza('a', 24000);
    const b = pizza('b', 28000);
    (b.opciones_menu.grupos[0].opciones[0] as { nombre: string }).nombre = 'Personal';
    (b.opciones_menu.grupos[0].opciones[1] as { nombre: string }).nombre = 'Familiar';
    expect(autoPartnerSelection(a, { grupos: { a_t: ['a_n'] } }, b)).toEqual({ grupos: { b_t: ['b_g'] } });
    delete (b.opciones_menu.grupos[0].opciones[1] as { predeterminada?: boolean }).predeterminada;
    expect(autoPartnerSelection(a, { grupos: { a_t: ['a_n'] } }, b)).toEqual({ grupos: { b_t: ['b_n'] } });
    expect(autoPartnerSelection(a, {}, { id: 'plain', nombre: 'Plain', precio: 10000 })).toEqual({});
  });
});

describe('menu-product-options', () => {
  afterEach(() => vi.unstubAllGlobals());
  const renderSheet = (options?: unknown, partnerCommerce = 'tenant') => {
    vi.stubGlobal('React', React);
    return renderToStaticMarkup(React.createElement(ProductOptionsSheet, {
      open: true, canAdd: true,
      product: { id: 'a', comercio_id: 'tenant', nombre: 'Producto A', precio: 30000, opciones_menu: options },
      compatibleProducts: [{ id: 'b', comercio_id: partnerCommerce, nombre: 'Producto B', precio: 40000 }],
      imageUrl: null, category: null, formatPrice: String,
      onClose: () => {}, onConfirm: () => {},
    }));
  };
  it('normal and disabled product modals are byte-for-byte identical', () => {
    expect(renderSheet({ personalizacion: { version: 1, combinacion: { activada: false }, exclusiones: { activadas: false } } })).toBe(renderSheet());
  });
  it('only valid enabled capabilities show controls, never a foreign compatible product', () => {
    const config = { personalizacion: { version: 1,
      combinacion: { activada: true, titulo: 'Combina tu unidad', productos_compatibles: ['b'], regla_precio: 'max' },
      exclusiones: { activadas: true, titulo: 'Quitar ingredientes', ingredientes: [{ id: 'r', nombre: 'Ingrediente A' }] },
    } };
    expect(renderSheet(config)).toContain('Combina tu unidad');
    expect(renderSheet(config)).toContain('Quitar ingredientes');
    expect(renderSheet(config)).toContain('Ingrediente A');
    expect(renderSheet(config)).toContain('Producto B');
    expect(renderSheet(config)).toContain('Opcional · elige 1');
    expect(renderSheet(config)).not.toContain('40000');
    expect(renderSheet(config, 'other')).not.toContain('Combina tu unidad');
  });
  it('long combination lists start collapsed with search and keep every option reachable', () => {
    vi.stubGlobal('React', React);
    const partners = Array.from({ length: 10 }, (_, index) => ({
      id: `p${index}`, comercio_id: 'tenant', nombre: `Pizza ${index}`, precio: 40000,
    }));
    const html = renderToStaticMarkup(React.createElement(ProductOptionsSheet, {
      open: true, canAdd: true,
      product: { id: 'a', comercio_id: 'tenant', nombre: 'Producto A', precio: 30000, opciones_menu: { personalizacion: { version: 1,
        combinacion: { activada: true, titulo: 'Combina con', productos_compatibles: partners.map((entry) => entry.id), regla_precio: 'max' },
      } } },
      compatibleProducts: partners,
      imageUrl: null, category: null, formatPrice: String,
      onClose: () => {}, onConfirm: () => {},
    }));
    expect(html).toContain('Pizza 5');
    expect(html).not.toContain('Pizza 6');
    expect(html).toContain('Ver 4 más');
    expect(html).toContain('Buscar en Combina con');
    expect(html).toContain('elige 1 de 10');
  });
  it('question-gated groups hide options until checked and never apply to required or legacy groups', () => {
    vi.stubGlobal('React', React);
    const opciones = [{ id: 'q1', nombre: 'Extra de Queso', precio: 3309 }, { id: 'q2', nombre: 'Extra de Maíz', precio: 2000 }];
    const grupos = [
      { id: 'g_extra', nombre: 'Extras', tipo: 'multiple', max: 2, opciones, pregunta_activada: true, pregunta: '¿Quieres agregar un extra?' },
      { id: 'g_size', nombre: 'Tamaño', tipo: 'unica', obligatorio: true, min: 1, opciones: [{ id: 's1', nombre: 'Grande', precio: 5000 }], pregunta_activada: true },
      { id: 'g_plain', nombre: 'Bebida', tipo: 'unica', opciones: [{ id: 'b1', nombre: 'Cola', precio: 0 }] },
    ];
    const parsed = parseProductMenuOptions({ activadas: true, grupos });
    expect(parsed?.grupos?.[0].pregunta).toBe('¿Quieres agregar un extra?');
    expect(parsed?.grupos?.[1].pregunta).toBeUndefined();
    expect(parsed?.grupos?.[2]).not.toHaveProperty('pregunta');
    expect(parseProductMenuOptions({ activadas: true, grupos: [{ ...grupos[0], pregunta: '  ' }] })?.grupos?.[0].pregunta)
      .toBe('¿Quieres agregar extras?');

    const html = renderToStaticMarkup(React.createElement(ProductOptionsSheet, {
      open: true, canAdd: true,
      product: { id: 'a', comercio_id: 'tenant', nombre: 'Pizza', precio: 10000, opciones_menu: { activadas: true, grupos } },
      imageUrl: null, category: null, formatPrice: String,
      onClose: () => {}, onConfirm: () => {},
    }));
    expect(html).toContain('¿Quieres agregar un extra?');
    expect(html).toContain('2 opciones · desde +2000');
    expect(html).not.toContain('Extra de Queso');
    expect(html).toContain('Grande');
    expect(html).toContain('Cola');
  });
  it('direct question mode is opt-in and only applies to single-option question groups', () => {
    const extra = { id: 'g_extra', nombre: 'Ingrediente Extra', tipo: 'unica', pregunta_activada: true, pregunta_directa: true,
      opciones: [{ id: 'x1', nombre: 'Añadir extra', precio: 2000, texto_libre: true }] };
    const parse = (group: Record<string, unknown>) => parseProductMenuOptions({ activadas: true, grupos: [group] })?.grupos?.[0];
    expect(parse(extra)?.preguntaDirecta).toBe(true);
    expect(parse({ ...extra, pregunta_directa: undefined })).not.toHaveProperty('preguntaDirecta');
    expect(parse({ ...extra, pregunta_activada: false })).not.toHaveProperty('preguntaDirecta');
    expect(parse({ ...extra, opciones: [...extra.opciones, { id: 'x2', nombre: 'Otro', precio: 0 }] })).not.toHaveProperty('preguntaDirecta');
    expect(parse({ ...extra, opciones: [{ ...extra.opciones[0], texto_libre: false }] })).not.toHaveProperty('preguntaDirecta');

    vi.stubGlobal('React', React);
    const html = renderToStaticMarkup(React.createElement(ProductOptionsSheet, {
      open: true, canAdd: true,
      product: { id: 'a', comercio_id: 'tenant', nombre: 'Pizza', precio: 10000, opciones_menu: { activadas: true, grupos: [extra] } },
      imageUrl: null, category: null, formatPrice: String,
      onClose: () => {}, onConfirm: () => {},
    }));
    expect(html).toContain('¿Quieres agregar ingrediente extra?');
    expect(html).toContain('+2000');
    expect(html).not.toContain('Añadir extra');
  });
  it('combination and removals can hide behind a checkbox question, opt-in only', () => {
    vi.stubGlobal('React', React);
    const personalizacion = { version: 1,
      combinacion: { activada: true, titulo: 'Combina con', productos_compatibles: ['b'], regla_precio: 'max', pregunta_activada: true },
      exclusiones: { activadas: true, titulo: 'Quitar', ingredientes: [{ id: 'r', nombre: 'Cebolla' }], pregunta_activada: true, pregunta: '¿Le quitamos algo?' },
    };
    const parsed = parseProductMenuOptions({ personalizacion })?.personalizacion;
    expect(parsed?.combinacion?.pregunta).toBe('¿Quieres combinar con otro producto?');
    expect(parsed?.exclusiones?.pregunta).toBe('¿Le quitamos algo?');
    const legacy = parseProductMenuOptions({ personalizacion: { ...personalizacion,
      combinacion: { ...personalizacion.combinacion, pregunta_activada: undefined },
      exclusiones: { ...personalizacion.exclusiones, pregunta_activada: false },
    } })?.personalizacion;
    expect(legacy?.combinacion).not.toHaveProperty('pregunta');
    expect(legacy?.exclusiones).not.toHaveProperty('pregunta');

    const html = renderSheet({ personalizacion });
    expect(html).toContain('¿Quieres combinar con otro producto?');
    expect(html).toContain('1 producto');
    expect(html).toContain('¿Le quitamos algo?');
    expect(html).toContain('1 ingrediente');
    expect(html).not.toContain('Producto B');
    expect(html).not.toContain('Cebolla');
  });
  it('long option groups fold too while short groups stay intact', () => {
    vi.stubGlobal('React', React);
    const opciones = Array.from({ length: 12 }, (_, index) => ({
      id: `o${index}`, nombre: `Extra ${index}`, precio: 1000,
    }));
    const html = renderToStaticMarkup(React.createElement(ProductOptionsSheet, {
      open: true, canAdd: true,
      product: { id: 'a', comercio_id: 'tenant', nombre: 'Producto A', precio: 30000, opciones_menu: { activadas: true, grupos: [
        { id: 'g1', nombre: 'Extras', tipo: 'multiple', obligatorio: false, min: 0, max: 5, opciones },
        { id: 'g2', nombre: 'Salsa', tipo: 'unica', obligatorio: true, opciones: [{ id: 's1', nombre: 'Rosada', precio: 0 }, { id: 's2', nombre: 'Ajo', precio: 0 }] },
      ] } },
      imageUrl: null, category: null, formatPrice: String,
      onClose: () => {}, onConfirm: () => {},
    }));
    expect(html).toContain('Extra 5');
    expect(html).not.toContain('Extra 6');
    expect(html).toContain('Ver 6 más');
    expect(html).toContain('+1000');
    expect(html).toContain('Buscar en Extras');
    expect(html).toContain('Rosada');
    expect(html).toContain('Ajo');
    expect(html).not.toContain('Buscar en Salsa');
  });
  it('customization is strictly opt-in and preserves legacy cart keys', () => {
    for (const raw of [null, {}, { personalizacion: { combinacion: { activada: true } } }, { personalizacion: { version: 1, combinacion: { activada: false } } }]) {
      expect(parseProductPersonalization(raw)).toBeNull();
    }
    expect(buildCartLineKey('old', {})).toBe('old::::0::');
    const combinationOnly = { opciones_menu: { personalizacion: { version: 1, combinacion: { activada: true, titulo: 'Combina con', productos_compatibles: ['b'], regla_precio: 'max' } } } };
    expect(productRequiresConfiguration(combinationOnly)).toBe(true);
    expect(productRequiresConfiguration(combinationOnly, null, false)).toBe(false);
  });
  it('roundtrips independent partner selections and zero-price exclusions', () => {
    const selection = { exclusionesIds: ['remove_a'], combinacion: { productId: 'b', seleccion: { grupos: { group_b: ['option_b'] }, exclusionesIds: ['remove_b'] } } };
    expect(parseCartLineKey(buildCartLineKey('a', selection)).selection.combinacion).toEqual(selection.combinacion);
    expect(parseCartLineKey(buildCartLineKey('a', selection)).selection.exclusionesIds).toEqual(['remove_a']);
    expect(resolveCombinedUnitPrice({ precio: 30000 }, null, selection, { precio: 40000 })).toBe(40000);
    expect(resolveCombinedUnitPrice({ precio: 50000 }, null, selection, { precio: 35000 })).toBe(50000);
    expect(validateCustomizationSelection({ precio: 30000 }, { exclusionesIds: ['forged'] })).not.toHaveLength(0);
  });
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
