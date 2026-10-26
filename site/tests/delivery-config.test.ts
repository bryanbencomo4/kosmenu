import { describe, expect, it } from 'vitest';

import {
  DEFAULT_DELIVERY_CONFIG,
  extractDeliveryConfigSource,
  parseDeliveryConfig,
  quoteDeliveryFee,
  toPublicDeliveryConfig,
  validateDeliveryConfig,
} from '../app/_lib/delivery-config';

describe('delivery config', () => {
  it('defaults to disabled so existing shops do not change', () => {
    expect(parseDeliveryConfig(null)).toEqual(DEFAULT_DELIVERY_CONFIG);
    expect(parseDeliveryConfig({})).toMatchObject({ enabled: false });
    expect(toPublicDeliveryConfig(null)).toEqual({ enabled: false });
    expect(toPublicDeliveryConfig({ enabled: false, fixed_price: 9, secret: 'no' })).toEqual({
      enabled: false,
    });
  });

  it('keeps fallback fee when the engine is off', () => {
    const quote = quoteDeliveryFee({
      config: { enabled: false },
      isDelivery: true,
      subtotal: 10,
      fallbackFee: 1.5,
    });
    expect(quote.applied).toBe(false);
    expect(quote.fee).toBe(1.5);
    expect(quote.snapshot).toBeNull();
  });

  it('quotes a fixed fee and can make it free over a minimum', () => {
    const config = {
      enabled: true,
      pricing_type: 'fixed',
      fixed_price: 3,
      free_delivery: { enabled: true, minimum_order: 20 },
    };
    expect(quoteDeliveryFee({ config, isDelivery: true, subtotal: 10 }).fee).toBe(3);
    const free = quoteDeliveryFee({ config, isDelivery: true, subtotal: 20 });
    expect(free.fee).toBe(0);
    expect(free.free).toBe(true);
    expect(free.snapshot).toMatchObject({ enabled: true, pricing_type: 'fixed' });
  });

  it('quotes distance with included kilometers', () => {
    const quote = quoteDeliveryFee({
      config: {
        enabled: true,
        pricing_type: 'distance',
        distance_config: { base_price: 2, included_km: 3, extra_price_per_km: 0.5 },
      },
      isDelivery: true,
      subtotal: 8,
      origin: { lat: 10.48, lng: -66.9 },
      destination: { lat: 10.52, lng: -66.9 },
    });
    expect(quote.applied).toBe(true);
    expect(quote.distanceKm).toBeGreaterThan(3);
    expect(quote.fee).toBeGreaterThan(2);
  });

  it('quotes matching zones and blocks out of range', () => {
    const config = {
      enabled: true,
      pricing_type: 'zones',
      zones: [
        { name: 'Centro', min_distance: 0, max_distance: 3, price: 2 },
        { name: 'Media', min_distance: 3, max_distance: 8, price: 4 },
      ],
    };
    const inside = quoteDeliveryFee({
      config,
      isDelivery: true,
      subtotal: 8,
      origin: { lat: 0, lng: 0 },
      destination: { lat: 0.02, lng: 0 },
    });
    expect(inside.blocked).toBe(false);
    expect(inside.fee).toBeGreaterThan(0);

    const far = quoteDeliveryFee({
      config,
      isDelivery: true,
      subtotal: 8,
      origin: { lat: 0, lng: 0 },
      destination: { lat: 1, lng: 1 },
    });
    expect(far.blocked).toBe(true);
  });

  it('blocks delivery below the minimum order', () => {
    const quote = quoteDeliveryFee({
      config: { enabled: true, pricing_type: 'fixed', fixed_price: 2, min_order: 5 },
      isDelivery: true,
      subtotal: 4,
    });
    expect(quote.blocked).toBe(true);
  });

  it('rejects invalid zones', () => {
    const errors = validateDeliveryConfig(
      parseDeliveryConfig({
        enabled: true,
        pricing_type: 'zones',
        zones: [{ name: 'Bad', min_distance: 8, max_distance: 3, price: 4 }],
      }),
    );
    expect(errors.join(' ')).toMatch(/rango inválido/i);
  });

  it('reads nested delivery_config and ignores the rest of config_negocio', () => {
    expect(
      extractDeliveryConfigSource({
        branding_ia: {
          config_negocio: {
            inicio_menu: { delivery: true },
            enabled: true,
            delivery_config: { enabled: false, fixed_price: 4 },
          },
        },
      }),
    ).toEqual({ enabled: false, fixed_price: 4 });
    expect(
      extractDeliveryConfigSource({
        branding_ia: { config_negocio: { inicio_menu: { delivery: true }, enabled: true } },
      }),
    ).toBeNull();
  });

  it('does not treat kiosk home config as an enabled tariff', () => {
    const quote = quoteDeliveryFee({
      config: extractDeliveryConfigSource({
        config_negocio: { inicio_menu: { delivery: true }, enabled: true },
      }),
      isDelivery: true,
      subtotal: 20,
      fallbackFee: 0,
    });
    expect(quote.applied).toBe(false);
    expect(quote.blocked).toBe(false);
    expect(quote.fee).toBe(0);
  });

  it('parses tariff currency and keeps it on the public snapshot', () => {
    const config = parseDeliveryConfig({
      enabled: true,
      pricing_type: 'fixed',
      fixed_price: 5000,
      currency: 'cop',
    });
    expect(config.currency).toBe('COP');
    expect(toPublicDeliveryConfig(config)).toMatchObject({
      enabled: true,
      currency: 'COP',
      fixed_price: 5000,
    });
  });

  it('converts tariff amounts into shop base currency when quoting', () => {
    const config = {
      enabled: true,
      pricing_type: 'fixed',
      fixed_price: 2,
      currency: 'USD',
      min_order: 5,
    };
    const blocked = quoteDeliveryFee({
      config,
      isDelivery: true,
      subtotal: 10_000,
      convertToBase: (amount) => amount * 4000,
    });
    expect(blocked.blocked).toBe(true);

    const quoted = quoteDeliveryFee({
      config,
      isDelivery: true,
      subtotal: 25_000,
      convertToBase: (amount) => amount * 4000,
    });
    expect(quoted.blocked).toBe(false);
    expect(quoted.fee).toBe(8000);
  });

  it('never throws when quoting garbage config', () => {
    expect(() =>
      quoteDeliveryFee({
        config: Object.create(null),
        isDelivery: true,
        subtotal: Number.NaN,
        origin: { lat: Number.POSITIVE_INFINITY, lng: 0 },
        destination: { lat: 0, lng: 0 },
        fallbackFee: 1.25,
      }),
    ).not.toThrow();
  });

  it('quotes area_zones by point-in-polygon and blocks outside by default', () => {
    const square: Array<[number, number]> = [
      [0, 0],
      [0, 1],
      [1, 1],
      [1, 0],
    ];
    const config = {
      enabled: true,
      pricing_type: 'area_zones',
      area_zones: [{ id: 'a1', name: 'Centro', price: 3.5, polygon: square }],
      area_zones_fallback: { enabled: false, price: 9 },
    };

    const inside = quoteDeliveryFee({
      config,
      isDelivery: true,
      subtotal: 10,
      destination: { lat: 0.5, lng: 0.5 },
    });
    expect(inside.blocked).toBe(false);
    expect(inside.fee).toBe(3.5);
    expect(inside.method).toBe('area_zones');

    const outside = quoteDeliveryFee({
      config,
      isDelivery: true,
      subtotal: 10,
      destination: { lat: 2, lng: 2 },
    });
    expect(outside.blocked).toBe(true);
    expect(outside.blockReason).toMatch(/fuera de la zona/i);
  });

  it('does not block area_zones before a destination pin is chosen', () => {
    const quote = quoteDeliveryFee({
      config: {
        enabled: true,
        pricing_type: 'area_zones',
        area_zones: [
          {
            id: 'a1',
            name: 'Centro',
            price: 3,
            polygon: [
              [0, 0],
              [0, 1],
              [1, 1],
              [1, 0],
            ],
          },
        ],
      },
      isDelivery: true,
      subtotal: 10,
      destination: null,
    });
    expect(quote.blocked).toBe(false);
    expect(quote.method).toBe('area_zones');
  });

  it('allows area_zones outside pin with fee pending when outside orders are enabled', () => {
    const config = {
      enabled: true,
      pricing_type: 'area_zones',
      area_zones: [
        {
          id: 'a1',
          name: 'Centro',
          price: 3,
          polygon: [
            [0, 0],
            [0, 1],
            [1, 1],
            [1, 0],
          ],
        },
      ],
      area_zones_fallback: { enabled: true, price: 7 },
    };
    const quote = quoteDeliveryFee({
      config,
      isDelivery: true,
      subtotal: 10,
      destination: { lat: 5, lng: 5 },
    });
    expect(quote.blocked).toBe(false);
    expect(quote.outOfZone).toBe(true);
    expect(quote.fee).toBe(0);
  });

  it('keeps area_zones data inert when pricing_type is intervals', () => {
    const parsed = parseDeliveryConfig({
      enabled: true,
      pricing_type: 'zones',
      zones: [{ name: 'Cerca', min_distance: 0, max_distance: 5, price: 2 }],
      area_zones: [
        {
          id: 'ignored',
          name: 'Mapa',
          price: 99,
          polygon: [
            [0, 0],
            [0, 1],
            [1, 1],
          ],
        },
      ],
    });
    expect(parsed.pricingType).toBe('zones');
    expect(parsed.areaZones).toHaveLength(1);
    const quote = quoteDeliveryFee({
      config: parsed,
      isDelivery: true,
      subtotal: 10,
      origin: { lat: 0, lng: 0 },
      destination: { lat: 0.01, lng: 0 },
    });
    expect(quote.method).toBe('zones');
    expect(quote.fee).toBe(2);
  });
});
