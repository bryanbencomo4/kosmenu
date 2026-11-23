import { describe, expect, it } from 'vitest';

import {
  extractOrderMoney,
  formatMoneyBreakdown,
  sumUsdEstimates,
} from '../app/admin/_lib/admin-money';

describe('admin-money extractOrderMoney', () => {
  it('keeps checkout currencies separate and converts with rate when base is USD', () => {
    const usd = extractOrderMoney({
      total: 10,
      detalles: {
        moneda_base: 'USD',
        total: 10,
        moneda_checkout: 'USD',
        total_moneda_checkout: 10,
        tasa_cambio_snapshot: 1,
      },
    });
    expect(usd.currency).toBe('USD');
    expect(usd.amount).toBe(10);
    expect(usd.usdEstimate).toBe(10);

    const cop = extractOrderMoney({
      total: 8,
      detalles: {
        moneda_base: 'USD',
        total: 8,
        moneda_checkout: 'COP',
        total_moneda_checkout: 34000,
        tasa_cambio_snapshot: 4250,
      },
    });
    expect(cop.currency).toBe('COP');
    expect(cop.amount).toBe(34000);
    expect(cop.usdEstimate).toBeCloseTo(8, 5);
  });

  it('does not treat identity rate (1) as USD FX for native COP/VES checkouts', () => {
    const copNative = extractOrderMoney({
      total: 34000,
      detalles: {
        moneda_base: 'COP',
        total: 34000,
        moneda_checkout: 'COP',
        total_moneda_checkout: 34000,
        tasa_cambio_snapshot: 1,
      },
    });
    expect(copNative.currency).toBe('COP');
    expect(copNative.usdEstimate).toBeNull();

    const vesNative = extractOrderMoney({
      total: 450,
      detalles: {
        moneda_base: 'VES',
        total: 450,
        moneda_checkout: 'VES',
        total_moneda_checkout: 450,
        tasa_cambio_snapshot: 1,
      },
    });
    expect(vesNative.currency).toBe('VES');
    expect(vesNative.usdEstimate).toBeNull();
  });

  it('does not treat polluted baseAmount as USD when it equals checkout amount', () => {
    const money = extractOrderMoney({
      total: 34000,
      detalles: {
        moneda_base: 'USD',
        total: 34000,
        moneda_checkout: 'COP',
        total_moneda_checkout: 34000,
        // missing rate
      },
    });
    expect(money.currency).toBe('COP');
    expect(money.usdEstimate).toBeNull();
  });

  it('infers base=checkout for legacy rows without moneda_base and rate 1', () => {
    const money = extractOrderMoney({
      total: 34000,
      detalles: {
        total: 34000,
        moneda_checkout: 'COP',
        total_moneda_checkout: 34000,
        tasa_cambio_snapshot: 1,
      },
    });
    expect(money.currency).toBe('COP');
    expect(money.baseCurrency).toBe('COP');
    expect(money.usdEstimate).toBeNull();
  });

  it('converts native COP/VES with fallback units-per-USD rates', () => {
    const cop = extractOrderMoney(
      {
        total: 12000,
        detalles: {
          moneda_base: 'COP',
          total: 12000,
          moneda_checkout: 'COP',
          total_moneda_checkout: 12000,
          tasa_cambio_snapshot: 1,
        },
      },
      { unitsPerUsd: { COP: 4000, VES: 40 } },
    );
    const ves = extractOrderMoney(
      {
        total: 16315,
        detalles: {
          moneda_base: 'VES',
          total: 16315,
          moneda_checkout: 'VES',
          total_moneda_checkout: 16315,
          tasa_cambio_snapshot: 1,
        },
      },
      { unitsPerUsd: { COP: 4000, VES: 40 } },
    );
    expect(cop.usdEstimate).toBeCloseTo(3, 5);
    expect(ves.usdEstimate).toBeCloseTo(16315 / 40, 5);
    const usd = sumUsdEstimates([cop, ves]);
    expect(usd.coveredCount).toBe(2);
    expect(usd.total).toBeCloseTo(3 + 16315 / 40, 5);
  });

  it('sums usd estimates without mixing native currencies as dollars', () => {
    const items = [
      extractOrderMoney({
        total: 13.5,
        detalles: {
          moneda_base: 'USD',
          total: 13.5,
          moneda_checkout: 'USD',
          total_moneda_checkout: 13.5,
          tasa_cambio_snapshot: 1,
        },
      }),
      extractOrderMoney({
        total: 34000,
        detalles: {
          moneda_base: 'COP',
          total: 34000,
          moneda_checkout: 'COP',
          total_moneda_checkout: 34000,
          tasa_cambio_snapshot: 1,
        },
      }),
      extractOrderMoney({
        total: 8,
        detalles: {
          moneda_base: 'USD',
          total: 8,
          moneda_checkout: 'VES',
          total_moneda_checkout: 3200,
          tasa_cambio_snapshot: 400,
        },
      }),
    ];
    const breakdown = formatMoneyBreakdown(items);
    expect(breakdown).toContain('US$');
    expect(breakdown).toContain('34.000');
    expect(breakdown).toContain('VES');
    const usd = sumUsdEstimates(items);
    // Native COP must not inflate ≈USD; only USD checkout + VES converted via USD base.
    expect(usd.coveredCount).toBe(2);
    expect(usd.total).toBeCloseTo(13.5 + 8, 5);
    expect(usd.total).not.toBeCloseTo(13.5 + 34000, 0);
  });
});
