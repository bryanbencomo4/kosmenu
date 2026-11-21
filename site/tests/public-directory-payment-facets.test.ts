import { describe, expect, it } from 'vitest';

import {
  deriveDirectoryPaymentFacets,
  isBcvExchangeSource,
  normalizePaymentChannelLabel,
} from '../app/api/_lib/public-directory-payment-facets';

describe('isBcvExchangeSource', () => {
  it('accepts bcv variants', () => {
    expect(isBcvExchangeSource('bcv')).toBe(true);
    expect(isBcvExchangeSource('bcv_usd')).toBe(true);
    expect(isBcvExchangeSource('BCV_EUR')).toBe(true);
  });

  it('rejects p2p and empty', () => {
    expect(isBcvExchangeSource('p2p_binance')).toBe(false);
    expect(isBcvExchangeSource('')).toBe(false);
    expect(isBcvExchangeSource(null)).toBe(false);
  });
});

describe('normalizePaymentChannelLabel', () => {
  it('maps common labels', () => {
    expect(normalizePaymentChannelLabel('Efectivo')).toBe('Efectivo');
    expect(normalizePaymentChannelLabel('Pago Móvil')).toBe('Pago Móvil');
    expect(normalizePaymentChannelLabel('Pago digital: Zelle')).toBe('Zelle');
    expect(normalizePaymentChannelLabel('Pago digital: Binance')).toBe('Binance');
    expect(normalizePaymentChannelLabel('Pago digital: Nequi')).toBe('Nequi');
    expect(normalizePaymentChannelLabel('Transferencia')).toBe('Transferencia');
  });
});

describe('deriveDirectoryPaymentFacets', () => {
  it('derives currencies, channels and VES@BCV', () => {
    const facets = deriveDirectoryPaymentFacets({
      brandingIa: {
        config_negocio: {
          checkout_currencies: ['USD', 'VES', 'COP'],
          exchange_rate_sources: { VES: 'bcv_usd' },
        },
      },
      moneda: 'COP',
      metodosPagoColumn: ['Efectivo', 'Transferencia'],
      metodosPagoRows: [
        { tipo: 'efectivo__ves', nombre: 'Efectivo' },
        { tipo: 'transferencia__usd__1', nombre: 'Pago digital: Zelle' },
        { tipo: 'transferencia__ves__1', nombre: 'Pago digital: Pago Móvil' },
      ],
    });

    expect(facets.currencies).toEqual(['COP', 'USD', 'VES']);
    expect(facets.paymentChannels).toEqual(
      expect.arrayContaining(['Efectivo', 'Transferencia', 'Zelle', 'Pago Móvil']),
    );
    expect(facets.acceptsVesBcv).toBe(true);
  });

  it('does not mark P2P VES as BCV', () => {
    const facets = deriveDirectoryPaymentFacets({
      brandingIa: {
        config_negocio: {
          checkout_currencies: ['VES', 'USD'],
          exchange_rate_sources: { VES: 'p2p_binance' },
        },
      },
      moneda: 'USD',
      metodosPagoColumn: ['Transferencia'],
    });
    expect(facets.acceptsVesBcv).toBe(false);
  });

  it('falls back to commerce exchange_rate_source for VES BCV', () => {
    const facets = deriveDirectoryPaymentFacets({
      brandingIa: {
        config_negocio: {
          checkout_currencies: ['VES'],
        },
      },
      moneda: 'VES',
      exchangeRateSource: 'bcv_eur',
    });
    expect(facets.acceptsVesBcv).toBe(true);
  });
});
