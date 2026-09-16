import { describe, expect, it } from 'vitest';

import { extractPublicCheckoutExchange } from '../app/api/_lib/checkout-exchange-config';

describe('extractPublicCheckoutExchange', () => {
  it('does not expose branding secrets beyond checkout exchange fields', () => {
    const config = extractPublicCheckoutExchange({
      color_principal: '#000',
      config_negocio: {
        checkout_currencies: ['USD', 'VES'],
        exchange_rate_sources: { VES: 'p2p_binance' },
      },
    });

    expect(config.currencies).toEqual(['USD', 'VES']);
    expect(config.exchangeRateSources.VES).toBe('p2p_binance');
    expect(config).not.toHaveProperty('color_principal');
  });
});
