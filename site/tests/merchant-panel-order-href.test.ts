import { describe, expect, it } from 'vitest';

import { merchantOrderShareHref, merchantPanelOrderHref } from '../app/_lib/public-site-config';

describe('merchantPanelOrderHref', () => {
  it('opens the merchant order management screen', () => {
    expect(merchantPanelOrderHref('A1B2')).toBe(
      'https://app.elmenuxfa.com/orders/view/A1B2',
    );
  });

  it('encodes the order id', () => {
    expect(merchantPanelOrderHref('EMXFA-000022')).toBe(
      'https://app.elmenuxfa.com/orders/view/EMXFA-000022',
    );
  });
});

describe('merchantOrderShareHref', () => {
  it('attaches shortCode from a public /o/{code} tracking url', () => {
    expect(
      merchantOrderShareHref('EMXFA-000322', 'https://elmenuxfa.com/o/i7WRWgpqkz'),
    ).toBe('https://app.elmenuxfa.com/orders/view/EMXFA-000322?shortCode=i7WRWgpqkz');
  });

  it('keeps guests able to open the public tracker via shortCode', () => {
    const href = merchantOrderShareHref('EMXFA-000136', 'https://elmenuxfa.com/o/qQ2vtV8HSY');
    expect(href).toContain('shortCode=qQ2vtV8HSY');
    expect(href).not.toContain('/o/');
  });

  it('falls back to the tracking url when there is no short code', () => {
    expect(
      merchantOrderShareHref(
        'EMXFA-000022',
        'https://elmenuxfa.com/orders/EMXFA-000022',
      ),
    ).toBe(
      'https://app.elmenuxfa.com/orders/view/EMXFA-000022?fallback=https%3A%2F%2Felmenuxfa.com%2Forders%2FEMXFA-000022',
    );
  });
});
