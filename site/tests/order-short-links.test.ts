import { describe, expect, it } from 'vitest';

import {
  extractOrderShortCodeFromUrl,
  publicOrderShortUrl,
} from '../app/api/_lib/order-short-links';

describe('order short link helpers', () => {
  it('builds a public /o/{code} url without tokens', () => {
    expect(publicOrderShortUrl('AbCdEfGh12', 'https://elmenuxfa.com')).toBe(
      'https://elmenuxfa.com/o/AbCdEfGh12',
    );
  });

  it('extracts short codes from stored tracking urls', () => {
    expect(extractOrderShortCodeFromUrl('https://elmenuxfa.com/o/AbCdEfGh12')).toBe('AbCdEfGh12');
    expect(
      extractOrderShortCodeFromUrl(
        'https://elmenuxfa.com/v/omg/orders/EMXFA-1?t=secret-token',
      ),
    ).toBe('');
  });
});
