import { describe, expect, it } from 'vitest';

import { merchantPanelOrderHref } from '../app/_lib/public-site-config';

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
