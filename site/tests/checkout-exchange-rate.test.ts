import { describe, expect, it } from 'vitest';

import { extractPublicCheckoutExchange } from '../app/api/_lib/checkout-exchange-config';
import {
  derivedExchangeRateForCurrency,
  resolveCheckoutCurrencyRate,
  resolveCheckoutCurrencySource,
} from '../app/_lib/checkout-exchange-rate';

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
