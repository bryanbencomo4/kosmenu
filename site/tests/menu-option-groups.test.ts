import { describe, expect, it } from 'vitest';

import {
  buildCartLineKey,
  buildOrderLineLabel,
  buildOrderLineSnapshot,
  calculateProductPrice,
  describeDependentPriceReason,
  formatProductPriceLabel,
  getProductOptionsSummary,
  parseCartLineKey,
  productHasDependentPrices,
  productHasOptionGroups,
  slimPublicProductOptions,
  defaultGroupSelections,
  nextGroupSelection,
  parseProductMenuOptions,
  productRequiresConfiguration,
  resolveCartLineUnitPrice,
  resolveOptionPrice,
  sanitizeCartLineSelection,
  validateOptionGroupSelection,
} from '../app/_lib/menu-product-options';

const money = (value: number) => `$${value.toFixed(2)}`;

const hamburguesa = {
  id: 'p1',
  nombre: 'Hamburguesa Clásica',
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
          { id: 'o_peq', nombre: 'Pequeña', precio: 0, activo: true },
          { id: 'o_med', nombre: 'Mediana', precio: 1, activo: true },
          { id: 'o_gra', nombre: 'Grande', precio: 2, activo: true },
        ],
      },
      {
        id: 'g_extras',
        nombre: 'Adicionales',
        tipo: 'multiple',
        obligatorio: false,
        min: 0,
        max: 5,
        opciones: [
          { id: 'o_queso', nombre: 'Extra queso', precio: 0.8, activo: true },
          { id: 'o_tocineta', nombre: 'Tocineta', precio: 1.5, activo: true },
          { id: 'o_huevo', nombre: 'Huevo', precio: 0.5, activo: true },
          { id: 'o_off', nombre: 'Aguacate', precio: 1, activo: false },
        ],
      },
    ],
  },
};

const campesina = {
  id: 'p_campesina',
  nombre: 'Campesina',
  precio: 0,
  opciones_menu: {
    activadas: true,
    grupos: [
      {
        id: 'g_tamano',
        nombre: 'Tamaño',
        tipo: 'unica',
        obligatorio: true,
        opciones: [
          { id: 'o_peq', nombre: 'Pequeña', precio: 12000 },
          { id: 'o_nor', nombre: 'Normal', precio: 16000 },
          { id: 'o_gra', nombre: 'Grande', precio: 22000 },
        ],
      },
      {
        id: 'g_extras',
        nombre: 'Extras',
        tipo: 'multiple',
        max: 3,
        opciones: [
          { id: 'o_queso', nombre: 'Extra queso', precio: 1000 },
          { id: 'o_tocineta', nombre: 'Tocineta', precio: 2000 },
          { id: 'o_champi', nombre: 'Champiñones', precio: 800 },
        ],
      },
    ],
  },
};
const cop = (value: number) => `$${value.toLocaleString('es-CO')}`;

describe('option groups are opt-in per product', () => {
  it('ignores groups unless activadas is true', () => {
    const off = { ...campesina, precio: 5000, opciones_menu: { ...campesina.opciones_menu, activadas: false } };
    const missingFlag = { ...off, opciones_menu: { grupos: campesina.opciones_menu.grupos } };
    for (const product of [off, missingFlag]) {
      expect(productHasOptionGroups(product)).toBe(false);
      expect(productRequiresConfiguration(product, null)).toBe(false);
      expect(getProductOptionsSummary(product)).toBeNull();
      expect(formatProductPriceLabel(product, money)).toBe('$5000.00');
      expect(resolveCartLineUnitPrice(product, null, {})).toBe(5000);
    }
  });

  it('strips unpublished groups from the public menu payload', () => {
    expect(slimPublicProductOptions(null)).toBeNull();
    expect(slimPublicProductOptions({ activadas: false, grupos: campesina.opciones_menu.grupos })).toBeNull();
    expect(
      slimPublicProductOptions({
        tamanos: [{ id: 'g', label: 'G', precio: 9 }],
        activadas: false,
        grupos: campesina.opciones_menu.grupos,
      }),
    ).toEqual({ tamanos: [{ id: 'g', label: 'G', precio: 9 }] });
    expect(slimPublicProductOptions(campesina.opciones_menu)).toEqual(campesina.opciones_menu);
  });

  it('keeps legacy tamanos working while groups stay off', () => {
    const legacy = { id: 'p3', nombre: 'Legacy', precio: 4, opciones_menu: { tamanos: [{ id: 'g', label: 'G', precio: 9 }] } };
    expect(productRequiresConfiguration(legacy, null)).toBe(true);
    expect(productHasOptionGroups(legacy)).toBe(false);
  });
});

describe('Campesina: base 0 + sizes + extras', () => {
  it('shows "Desde $12.000 · 3 tamaños disponibles" on the card', () => {
    expect(formatProductPriceLabel(campesina, cop)).toBe('Desde $12.000');
    expect(getProductOptionsSummary(campesina)).toBe('3 tamaños disponibles');
  });

  it('prices the chosen size and adds extras', () => {
    expect(resolveCartLineUnitPrice(campesina, null, { grupos: { g_tamano: ['o_gra'] } })).toBe(22000);
    expect(
      resolveCartLineUnitPrice(campesina, null, {
        grupos: { g_tamano: ['o_nor'], g_extras: ['o_queso', 'o_tocineta', 'o_champi'] },
      }),
    ).toBe(19800);
  });

  it('snapshot matches the requested shape', () => {
    expect(buildOrderLineSnapshot(campesina, null, { grupos: { g_tamano: ['o_gra'] } })).toEqual({
      producto: 'Campesina',
      precioBase: 0,
      selecciones: [{ grupo: 'Tamaño', opcion: 'Grande', precio: 22000 }],
      precioFinal: 22000,
    });
  });

  it('summarizes optional-only products as "Personalizable"', () => {
    const extrasOnly = {
      ...campesina,
      opciones_menu: { activadas: true, grupos: [campesina.opciones_menu.grupos[1]] },
    };
    expect(getProductOptionsSummary(extrasOnly)).toBe('Personalizable');
  });
});

describe('single-choice tap replaces the previous pick', () => {
  const unica = {
    id: 'g_tamano',
    nombre: 'Tamaño',
    tipo: 'unica' as const,
    obligatorio: false,
    min: 0,
    max: 1,
    opciones: [
      { id: 'o_nor', nombre: 'Normal', precio: 16 },
      { id: 'o_gra', nombre: 'Grande', precio: 33 },
    ],
  };

  it('does not pre-select a radio option unless the merchant marked one', () => {
    expect(defaultGroupSelections([unica])).toEqual({});
    expect(nextGroupSelection(unica, [], 'o_nor')).toEqual(['o_nor']);
    expect(nextGroupSelection(unica, [], 'o_gra')).toEqual(['o_gra']);
  });

  it('selects the other option in one tap', () => {
    expect(nextGroupSelection(unica, ['o_nor'], 'o_gra')).toEqual(['o_gra']);
  });

  it('treats a multiple group with max 1 as a radio', () => {
    const asMultiple = { ...unica, tipo: 'multiple' as const, max: 1 };
    expect(nextGroupSelection(asMultiple, ['o_nor'], 'o_gra')).toEqual(['o_gra']);
    const parsed = parseProductMenuOptions({
      activadas: true,
      grupos: [{ ...asMultiple, opciones: asMultiple.opciones }],
    });
    expect(parsed?.grupos?.[0]?.tipo).toBe('unica');
  });
});

describe('option groups: product without options (case 1)', () => {
  const pizza = { id: 'p2', nombre: 'Pizza Pepperoni', precio: 6, opciones_menu: null };

  it('behaves exactly as before', () => {
    expect(getProductOptionsSummary(pizza)).toBeNull();
    expect(productHasOptionGroups(pizza)).toBe(false);
    expect(productRequiresConfiguration(pizza, null)).toBe(false);
    expect(formatProductPriceLabel(pizza, money)).toBe('$6.00');
    expect(resolveCartLineUnitPrice(pizza, null, {})).toBe(6);
    expect(buildCartLineKey('p2', {})).toBe('p2::::0::');
    expect(validateOptionGroupSelection(pizza, {})).toEqual([]);
  });

  it('keeps legacy 4-segment cart keys parseable', () => {
    expect(parseCartLineKey('p2::n::1::a,b')).toEqual({
      productId: 'p2',
      selection: { tamanoId: 'n', tamanoLabel: 'n', servicioAdicional: true, ajusteIds: ['a', 'b'] },
    });
  });
});

describe('option groups: single choice changes the price (case 2)', () => {
  it('requires the size and adds its modifier', () => {
    expect(productRequiresConfiguration(hamburguesa, null)).toBe(true);
    expect(validateOptionGroupSelection(hamburguesa, {})[0]?.message).toBe('Elige una opción de Tamaño.');
    expect(resolveCartLineUnitPrice(hamburguesa, null, { grupos: { g_tamano: ['o_med'] } })).toBe(6);
    expect(resolveCartLineUnitPrice(hamburguesa, null, { grupos: { g_tamano: ['o_gra'] } })).toBe(7);
  });

  it('rejects two picks in a single-choice group', () => {
    const issues = validateOptionGroupSelection(hamburguesa, { grupos: { g_tamano: ['o_med', 'o_gra'] } });
    expect(issues[0]?.message).toBe('Puedes elegir hasta 1 en Tamaño.');
  });

  it('labels the list price as "Desde" the cheapest valid combo', () => {
    expect(formatProductPriceLabel(hamburguesa, money)).toBe('Desde $5.00');
  });
});

describe('option groups: multiple extras add up (case 3)', () => {
  it('matches the spec example ($5 + Mediana $1 + queso $0.80 + tocineta $1.50 = $8.30)', () => {
    const selection = { grupos: { g_tamano: ['o_med'], g_extras: ['o_queso', 'o_tocineta'] } };
    expect(validateOptionGroupSelection(hamburguesa, selection)).toEqual([]);
    expect(resolveCartLineUnitPrice(hamburguesa, null, selection)).toBe(8.3);
  });

  it('ignores inactive options and rejects them when selected', () => {
    const groups = parseProductMenuOptions(hamburguesa.opciones_menu)?.grupos ?? [];
    expect(groups[1].opciones.map((option) => option.id)).not.toContain('o_off');
    const issues = validateOptionGroupSelection(hamburguesa, {
      grupos: { g_tamano: ['o_peq'], g_extras: ['o_off'] },
    });
    expect(issues).toHaveLength(1);
  });

  it('enforces the group maximum', () => {
    const product = {
      ...hamburguesa,
      opciones_menu: {
        activadas: true,
        grupos: [{ ...hamburguesa.opciones_menu.grupos[1], max: 2 }],
      },
    };
    const issues = validateOptionGroupSelection(product, {
      grupos: { g_extras: ['o_queso', 'o_tocineta', 'o_huevo'] },
    });
    expect(issues[0]?.message).toBe('Puedes elegir hasta 2 en Adicionales.');
  });
});

describe('option groups: cart line + snapshot (case 4)', () => {
  const selection = { grupos: { g_tamano: ['o_gra'], g_extras: ['o_tocineta'] } };

  it('round-trips the selection through the cart key, order independent', () => {
    const key = buildCartLineKey('p1', { grupos: { g_extras: ['o_tocineta', 'o_queso'], g_tamano: ['o_gra'] } });
    expect(key).toBe('p1::::0::::g_extras=o_queso|o_tocineta;g_tamano=o_gra');
    expect(parseCartLineKey(key).selection.grupos).toEqual({
      g_extras: ['o_queso', 'o_tocineta'],
      g_tamano: ['o_gra'],
    });
  });

  it('builds the frozen snapshot from the spec ($5 + Grande $2 + Tocineta $1.50 = $8.50)', () => {
    expect(buildOrderLineSnapshot(hamburguesa, null, selection)).toEqual({
      producto: 'Hamburguesa Clásica',
      precioBase: 5,
      selecciones: [
        { grupo: 'Tamaño', opcion: 'Grande', precio: 2 },
        { grupo: 'Adicionales', opcion: 'Tocineta', precio: 1.5 },
      ],
      precioFinal: 8.5,
    });
    expect(buildOrderLineLabel(hamburguesa, selection)).toBe('Hamburguesa Clásica · Grande · Tocineta');
  });

  it('sanitizes untrusted selections', () => {
    expect(
      sanitizeCartLineSelection({
        grupos: { g_tamano: ['o_gra', 'bad id!'], 'x;y': ['o_1'] },
        ajusteIds: 'nope',
      }),
    ).toEqual({ grupos: { g_tamano: ['o_gra'] } });
    expect(sanitizeCartLineSelection([1, 2])).toEqual({});
  });
});

const campesinaDependiente = {
  id: 'p_dep',
  nombre: 'Campesina',
  precio: 0,
  opciones_menu: {
    activadas: true,
    grupos: [
      {
        id: 'tamano',
        nombre: 'Tamaño',
        tipo: 'single',
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
              { cuando: { grupo: 'tamano', opcion: 'normal' }, precio: 2000 },
              { cuando: { grupo: 'tamano', opcion: 'grande' }, precio: 5000 },
            ],
          },
          { id: 'tocineta', nombre: 'Tocineta', precio: 2000 },
        ],
      },
    ],
  },
};

describe('dependent prices: generic rules, not pizza-specific', () => {
  it('case 1: product without options stays the same', () => {
    const plain = { id: 'p_plain', nombre: 'Jugo', precio: 4000, opciones_menu: null };
    expect(productHasDependentPrices(plain)).toBe(false);
    expect(calculateProductPrice(plain, {}).precioFinal).toBe(4000);
    expect(resolveCartLineUnitPrice(plain, null, {})).toBe(4000);
  });

  it('case 2: size only still adds the selected size', () => {
    const sizeOnly = {
      ...campesinaDependiente,
      opciones_menu: {
        activadas: true,
        grupos: [campesinaDependiente.opciones_menu.grupos[0]],
      },
    };
    expect(productHasDependentPrices(sizeOnly)).toBe(false);
    expect(calculateProductPrice(sizeOnly, { grupos: { tamano: ['grande'] } })).toEqual({
      precioBase: 0,
      selecciones: [{ grupo: 'Tamaño', opcion: 'Grande', precio: 21500 }],
      precioFinal: 21500,
    });
  });

  it('case 3: extra with a fixed price still adds that price', () => {
    const priced = calculateProductPrice(campesinaDependiente, {
      grupos: { tamano: ['normal'], extras: ['tocineta'] },
    });
    expect(priced.precioFinal).toBe(18161);
    expect(priced.selecciones).toEqual([
      { grupo: 'Tamaño', opcion: 'Normal', precio: 16161 },
      { grupo: 'Extras', opcion: 'Tocineta', precio: 2000 },
    ]);
  });

  it('case 4: extra price follows the selected parent option', () => {
    const groups = parseProductMenuOptions(campesinaDependiente.opciones_menu)?.grupos ?? [];
    const extra = groups[1].opciones[0];
    expect(extra.precio).toBe(0);
    expect(extra.reglasPrecio).toHaveLength(2);
    expect(resolveOptionPrice(extra, { grupos: { tamano: ['normal'] } })).toBe(2000);
    expect(resolveOptionPrice(extra, { grupos: { tamano: ['grande'] } })).toBe(5000);

    const priced = calculateProductPrice(campesinaDependiente, {
      grupos: { tamano: ['grande'], extras: ['queso_extra'] },
    });
    expect(priced).toEqual({
      precioBase: 0,
      selecciones: [
        { grupo: 'Tamaño', opcion: 'Grande', precio: 21500 },
        { grupo: 'Extras', opcion: 'Extra queso', precio: 5000 },
      ],
      precioFinal: 26500,
    });
    expect(describeDependentPriceReason(extra, groups, { grupos: { tamano: ['grande'] } })).toBe(
      'según Grande',
    );
  });

  it('case 5: changing the parent after picking the extra recalculates', () => {
    const extraSelected = { grupos: { tamano: ['normal'], extras: ['queso_extra'] } };
    expect(calculateProductPrice(campesinaDependiente, extraSelected).precioFinal).toBe(18161);

    const afterSizeChange = { grupos: { tamano: ['grande'], extras: ['queso_extra'] } };
    expect(calculateProductPrice(campesinaDependiente, afterSizeChange)).toEqual({
      precioBase: 0,
      selecciones: [
        { grupo: 'Tamaño', opcion: 'Grande', precio: 21500 },
        { grupo: 'Extras', opcion: 'Extra queso', precio: 5000 },
      ],
      precioFinal: 26500,
    });
  });

  it('does not show the hint when no option has rules', () => {
    expect(productHasDependentPrices(campesina)).toBe(false);
    expect(productHasDependentPrices(campesinaDependiente)).toBe(true);
  });
});

describe('optional default option and free-text extra', () => {
  const product = {
    id: 'p_custom',
    nombre: 'Pizza',
    precio: 10000,
    opciones_menu: {
      activadas: true,
      grupos: [
        {
          id: 'tamano',
          nombre: 'Tamaño',
          tipo: 'unica',
          obligatorio: true,
          opciones: [
            { id: 'normal', nombre: 'Normal', precio: 0, predeterminada: true },
            { id: 'grande', nombre: 'Grande', precio: 4000 },
          ],
        },
        {
          id: 'extras',
          nombre: 'Extras',
          tipo: 'multiple',
          opciones: [
            { id: 'queso', nombre: 'Extra queso', precio: 2000 },
            { id: 'otro', nombre: 'Otro', precio: 0, texto_libre: true },
          ],
        },
      ],
    },
  };

  it('pre-selects only the option the merchant marked as default', () => {
    const groups = parseProductMenuOptions(product.opciones_menu)?.grupos ?? [];
    expect(defaultGroupSelections(groups)).toEqual({ tamano: ['normal'] });
    expect(groups[0].opciones[0].predeterminada).toBe(true);
    expect(groups[1].opciones[1].textoLibre).toBe(true);
  });

  it('rejects a selected free-text extra without written text', () => {
    const issues = validateOptionGroupSelection(product, {
      grupos: { tamano: ['normal'], extras: ['otro'] },
    });
    expect(issues[0]?.message).toBe('Escribe qué quieres agregar en Extras.');
  });

  it('freezes the written text in the snapshot, not just the option id', () => {
    const selection = {
      grupos: { tamano: ['normal'], extras: ['otro'] },
      textos: { extras: { otro: '  Extra de piña  ' } },
    };
    expect(validateOptionGroupSelection(product, selection)).toEqual([]);
    expect(calculateProductPrice(product, selection)).toEqual({
      precioBase: 10000,
      selecciones: [
        { grupo: 'Tamaño', opcion: 'Normal', precio: 0 },
        { grupo: 'Extras', opcion: 'Extra de piña', precio: 0 },
      ],
      precioFinal: 10000,
    });
    expect(buildOrderLineLabel(product, selection)).toBe('Pizza · Normal · Extra de piña');
  });

  it('keeps two custom texts as different cart lines', () => {
    const a = buildCartLineKey('p_custom', {
      grupos: { extras: ['otro'] },
      textos: { extras: { otro: 'Piña' } },
    });
    const b = buildCartLineKey('p_custom', {
      grupos: { extras: ['otro'] },
      textos: { extras: { otro: 'Jamón' } },
    });
    expect(a).not.toBe(b);
    expect(parseCartLineKey(a).selection.textos).toEqual({ extras: { otro: 'Piña' } });
    expect(sanitizeCartLineSelection({
      grupos: { extras: ['otro'] },
      textos: { extras: { otro: 'Piña' }, bad: { x: 'nope' } },
    })).toEqual({
      grupos: { extras: ['otro'] },
      textos: { extras: { otro: 'Piña' } },
    });
  });
});

describe('upsell configurable products stay generic', () => {
  const agua = { id: 'agua', nombre: 'Agua 600ml', precio: 3500, opciones_menu: null };
  const cola = {
    id: 'cola',
    nombre: 'Coca Cola',
    precio: 0,
    opciones_menu: {
      activadas: true,
      grupos: [
        {
          nombre: 'Tamaño',
          tipo: 'single',
          obligatorio: true,
          opciones: [
            { nombre: '400 ml', precio: 3500 },
            { nombre: '600 ml', precio: 6734 },
            { nombre: '1.5 litros', precio: 10101 },
          ],
        },
        {
          nombre: 'Sabor',
          tipo: 'single',
          opciones: [
            { nombre: 'Original', precio_extra: 0 },
            { nombre: 'Zero', precio_extra: 0 },
          ],
        },
      ],
    },
  };

  it('case 1: simple product adds with its catalog price and no configurator', () => {
    expect(productRequiresConfiguration(agua, null)).toBe(false);
    expect(calculateProductPrice(agua, {}).precioFinal).toBe(3500);
    expect(formatProductPriceLabel(agua, money)).toBe('$3500.00');
  });

  it('case 2: a drink with groups requires configuration', () => {
    expect(productRequiresConfiguration(cola, null)).toBe(true);
    expect(formatProductPriceLabel(cola, money)).toBe('Desde $3500.00');
  });

  it('case 3: changing size recalculates with calculateProductPrice', () => {
    const small = calculateProductPrice(cola, { grupos: { tamano: ['400_ml'], sabor: ['original'] } });
    const mid = calculateProductPrice(cola, { grupos: { tamano: ['600_ml'], sabor: ['original'] } });
    expect(small.precioFinal).toBe(3500);
    expect(mid.precioFinal).toBe(6734);
    expect(mid.selecciones).toEqual([
      { grupo: 'Tamaño', opcion: '600 ml', precio: 6734 },
      { grupo: 'Sabor', opcion: 'Original', precio: 0 },
    ]);
  });

  it('case 4: same snapshot key stacks quantity instead of a new line', () => {
    const selection = { grupos: { tamano: ['600_ml'], sabor: ['original'] } };
    const key = buildCartLineKey('cola', selection);
    expect(buildCartLineKey('cola', selection)).toBe(key);
    const unit = calculateProductPrice(cola, selection).precioFinal;
    expect(unit * 3).toBe(20202);
  });

  it('case 5: a legacy product without opciones_menu stays simple', () => {
    const legacy = { id: 'p5', nombre: 'Hamburguesa', precio: 15000, opciones_menu: null };
    expect(productRequiresConfiguration(legacy, null)).toBe(false);
    expect(slimPublicProductOptions(legacy.opciones_menu)).toBeNull();
    expect(calculateProductPrice(legacy, {}).precioFinal).toBe(15000);
  });
});
