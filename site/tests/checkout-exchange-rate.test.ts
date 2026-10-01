import { describe, expect, it } from 'vitest';

import { extractPublicCheckoutExchange } from '../app/api/_lib/checkout-exchange-config';
import {
  computeAdjustmentFactor,
  convertAmountBetweenCurrencies,
  derivedExchangeRateForCurrency,
  parseExchangeRateAdjustment,
  resolveCheckoutCurrencyRate,
  resolveCheckoutCurrencySource,
  resolveEffectiveExchangeRate,
} from '../app/_lib/checkout-exchange-rate';

describe('resolveEffectiveExchangeRate (automatic with adjustment)', () => {
  const adjustment = (factor: number | null, enabled = true) => ({
    enabled,
    factor,
    referenceValue: 3,
    referenceInverted: true,
  });

  it('keeps legacy automatic configs untouched (0.29 stays 0.29)', () => {
    expect(resolveEffectiveExchangeRate({ mode: 'auto' }, 0.29)).toBe(0.29);
    expect(resolveEffectiveExchangeRate(null, 0.29)).toBe(0.29);
  });

  it('keeps manual mode untouched even when an adjustment is stored', () => {
    expect(resolveEffectiveExchangeRate({ mode: 'manual', adjustment: adjustment(1.15) }, 0.31)).toBe(0.31);
  });

  it('derives the factor from 1 VES = 3 COP and previews 50.000 COP as 16.666,67 VES', () => {
    const factor = computeAdjustmentFactor(1 / 3, 0.29);
    expect(factor).toBeCloseTo(1.149425287, 8);
    const effective = resolveEffectiveExchangeRate({ mode: 'auto', adjustment: adjustment(factor) }, 0.29);
    expect(effective).toBeCloseTo(0.333333333, 8);
    expect(50000 * effective).toBeCloseTo(16666.67, 2);
  });

  it('keeps following the source when it changes (0.30 -> 0.344827586)', () => {
    const factor = computeAdjustmentFactor(1 / 3, 0.29);
    const effective = resolveEffectiveExchangeRate({ mode: 'auto', adjustment: adjustment(factor) }, 0.3);
    expect(effective).toBeCloseTo(0.344827586, 8);
  });

  it('ignores the stored factor when the adjustment is switched off', () => {
    const factor = computeAdjustmentFactor(1 / 3, 0.29);
    expect(resolveEffectiveExchangeRate({ mode: 'auto', adjustment: adjustment(factor, false) }, 0.3)).toBe(0.3);
  });

  it('refuses a factor from a zero reference', () => {
    expect(computeAdjustmentFactor(0, 0.29)).toBeNull();
    expect(computeAdjustmentFactor(1 / 3, 0)).toBeNull();
  });

  it('does not throw with an empty reference and falls back to the source rate', () => {
    const parsed = parseExchangeRateAdjustment({ enabled: true });
    expect(parsed).toEqual({ enabled: true, factor: null, referenceValue: null, referenceInverted: false });
    expect(resolveEffectiveExchangeRate({ mode: 'auto', adjustment: parsed }, 0.29)).toBe(0.29);
    expect(parseExchangeRateAdjustment(undefined)).toBeNull();
  });

  it('auto update: factor set at 0.29 keeps following the source to 0.30', () => {
    const initialSource = 0.29;
    const commercialRate = 1 / 3;
    const factor = computeAdjustmentFactor(commercialRate, initialSource) as number;
    expect(factor).toBeCloseTo(1.149425287, 8);

    const config = {
      mode: 'auto',
      adjustment: { enabled: true, factor, referenceValue: 3, referenceInverted: true },
    };
    expect(50000 * resolveEffectiveExchangeRate(config, initialSource)).toBeCloseTo(16666.67, 2);
    const newEffective = resolveEffectiveExchangeRate(config, 0.3);
    expect(newEffective).toBeCloseTo(0.344827586, 8);
    expect(50000 * newEffective).toBeCloseTo(17241.38, 2);
  });

  it('public web resolves the same rate as the admin formula for 0.29 and 0.30', () => {
    // BCV USD / USD-COP gives the COP->VES source rate: 870/3000 = 0.29, 900/3000 = 0.30.
    const web = (bcv: number) =>
      resolveCheckoutCurrencyRate('VES', {
        baseCurrency: 'COP',
        marketRates: { bcv_rate: bcv, p2p_binance_rate: null, payload: { google_rates: { 'USD/COP': 3000 } } },
        checkoutExchange: {
          exchangeRates: {},
          exchangeRateModes: { VES: 'auto' },
          exchangeRateSources: { VES: 'bcv_usd' },
          exchangeRateAdjustments: {
            VES: {
              enabled: true,
              factor: (1 / 3) / 0.29,
              referenceValue: 3,
              referenceInverted: true,
            },
          },
        },
      });

    expect(50000 * web(870)).toBeCloseTo(16666.67, 2);
    expect(50000 * web(900)).toBeCloseTo(17241.38, 2);
  });

  it('applies the adjustment on top of the live source in resolveCheckoutCurrencyRate', () => {
    const marketRates = {
      bcv_rate: 976.9,
      p2p_binance_rate: 1100,
      payload: { google_rates: { 'USD/COP': 3257.79 } },
    };
    const source = (1100 * 1.006) / 3257.79;
    const factor = computeAdjustmentFactor(1 / 3, source) as number;
    const base = {
      baseCurrency: 'COP',
      marketRates,
    };
    const adjusted = resolveCheckoutCurrencyRate('VES', {
      ...base,
      checkoutExchange: {
        exchangeRates: { VES: 0.3 },
        exchangeRateModes: { VES: 'auto' },
        exchangeRateSources: { VES: 'p2p_binance' },
        exchangeRateAdjustments: {
          VES: { enabled: true, factor, referenceValue: 3, referenceInverted: true },
        },
      },
    });
    expect(adjusted).toBeCloseTo(1 / 3, 9);

    const legacy = resolveCheckoutCurrencyRate('VES', {
      ...base,
      checkoutExchange: {
        exchangeRates: { VES: 0.3 },
        exchangeRateModes: { VES: 'auto' },
        exchangeRateSources: { VES: 'p2p_binance' },
      },
    });
    expect(legacy).toBeCloseTo(source, 9);
  });

  it('reads persisted adjustments from branding config and ignores legacy configs', () => {
    const withAdjustment = extractPublicCheckoutExchange({
      config_negocio: {
        exchange_rate_modes: { VES: 'auto' },
        exchange_rate_adjustments: {
          ves: { enabled: true, factor: 1.149425287, reference_value: 3, reference_inverted: true },
        },
      },
    });
    expect(withAdjustment.exchangeRateAdjustments.VES).toEqual({
      enabled: true,
      factor: 1.149425287,
      referenceValue: 3,
      referenceInverted: true,
    });

    const legacy = extractPublicCheckoutExchange({
      config_negocio: { exchange_rate_modes: { VES: 'auto' }, exchange_rate_sources: { VES: 'bcv_usd' } },
    });
    expect(legacy.exchangeRateAdjustments).toEqual({});
  });
});

describe('extractPublicCheckoutExchange', () => {
  it('reads per-currency sources from branding config', () => {
    const config = extractPublicCheckoutExchange({
      config_negocio: {
        checkout_currencies: ['USD', 'VES', 'COP'],
        exchange_rates: { VES: 634.2, COP: 4100 },
        exchange_rate_modes: { VES: 'auto', COP: 'manual' },
        exchange_rate_sources: { VES: 'p2p_binance', COP: 'google' },
      },
    });

    expect(config.exchangeRateSources.VES).toBe('p2p_binance');
    expect(config.exchangeRateModes.VES).toBe('auto');
  });
});

describe('resolveCheckoutCurrencyRate', () => {
  const marketRates = {
    bcv_rate: 477.15,
    p2p_binance_rate: 630,
    payload: {
      google_rates: {
        'USD/COP': 4100,
        'VES/USD': 0.00158,
      },
    },
  };

  it('uses Binance P2P live rate for VES when source is p2p_binance', () => {
    const rate = resolveCheckoutCurrencyRate('VES', {
      baseCurrency: 'USD',
      checkoutExchange: {
        exchangeRates: { VES: 477.15 },
        exchangeRateModes: { VES: 'auto' },
        exchangeRateSources: { VES: 'p2p_binance' },
      },
      marketRates,
    });

    expect(rate).toBeCloseTo(630 * 1.006, 2);
    expect(rate).not.toBeCloseTo(477.15, 1);
  });

  it('uses BCV live rate when source is bcv', () => {
    const rate = resolveCheckoutCurrencyRate('VES', {
      baseCurrency: 'USD',
      checkoutExchange: {
        exchangeRates: { VES: 630 },
        exchangeRateModes: { VES: 'auto' },
        exchangeRateSources: { VES: 'bcv' },
      },
      marketRates,
    });

    expect(rate).toBeCloseTo(477.15, 2);
  });

  it('uses manual snapshot when mode is manual', () => {
    const rate = resolveCheckoutCurrencyRate('VES', {
      baseCurrency: 'USD',
      checkoutExchange: {
        exchangeRates: { VES: 655.5 },
        exchangeRateModes: { VES: 'manual' },
        exchangeRateSources: { VES: 'p2p_binance' },
      },
      marketRates,
    });

    expect(rate).toBe(655.5);
  });
});

describe('derivedExchangeRateForCurrency', () => {
  it('does not short-circuit auto rates with legacy comercio snapshot', () => {
    const rate = derivedExchangeRateForCurrency(
      'USD',
      'VES',
      'p2p_binance',
      { bcv_rate: 477, p2p_binance_rate: 630, payload: null },
      477,
      'VES',
    );

    expect(rate).toBeCloseTo(477, 2);
  });

  it('derives COP to VES through USD with the BCV rate', () => {
    const rate = derivedExchangeRateForCurrency('COP', 'VES', 'bcv_usd', {
      bcv_rate: 976.9,
      p2p_binance_rate: null,
      payload: { google_rates: { 'USD/COP': 3257.79 } },
    });

    expect(rate).toBeCloseTo(976.9 / 3257.79, 5);
    expect(23000 * rate).toBeCloseTo(6896.91, 1);
  });

  it('derives COP to VES through USD with the Binance P2P rate', () => {
    const rate = derivedExchangeRateForCurrency('COP', 'VES', 'p2p_binance', {
      bcv_rate: 976.9,
      p2p_binance_rate: 1100,
      payload: { google_rates: { 'USD/COP': 3257.79 } },
    });

    expect(rate).toBeCloseTo((1100 * 1.006) / 3257.79, 5);
  });
});

describe('resolveCheckoutCurrencySource', () => {
  it('returns per-currency source', () => {
    expect(
      resolveCheckoutCurrencySource('VES', {
        checkoutExchange: {
          exchangeRates: {},
          exchangeRateModes: {},
          exchangeRateSources: { VES: 'p2p_binance' },
        },
      }),
    ).toBe('p2p_binance');
  });
});

describe('convertAmountBetweenCurrencies', () => {
  const checkoutExchange = {
    exchangeRates: { USD: 1 / 4100, VES: 976.9 / 3257.79 },
    exchangeRateModes: { USD: 'manual', VES: 'manual' },
    exchangeRateSources: { USD: 'google', VES: 'bcv' },
  };

  it('keeps the same amount when currencies match', () => {
    expect(
      convertAmountBetweenCurrencies(5000, 'COP', 'COP', {
        baseCurrency: 'COP',
        checkoutExchange,
      }),
    ).toBe(5000);
  });

  it('converts a USD tariff into COP base using quote units per base', () => {
    expect(
      convertAmountBetweenCurrencies(2, 'USD', 'COP', {
        baseCurrency: 'COP',
        checkoutExchange,
      }),
    ).toBeCloseTo(8200, 4);
  });

  it('converts a COP tariff into VES for checkout display', () => {
    expect(
      convertAmountBetweenCurrencies(5000, 'COP', 'VES', {
        baseCurrency: 'COP',
        checkoutExchange,
      }),
    ).toBeCloseTo(5000 * (976.9 / 3257.79), 4);
  });
});
