import { describe, expect, it } from 'vitest';

import {
  buildClearedMerchantPresenceCookie,
  buildMerchantPresenceCookie,
  merchantInitials,
  merchantPresenceCookieDomain,
  parseMerchantPresenceCookie,
  readMerchantPresenceFromDocumentCookie,
  sanitizeMerchantPresence,
  serializeMerchantPresence,
} from '../app/_lib/merchant-presence';

describe('merchant presence cookie', () => {
  it('round-trips a valid payload', () => {
    const raw = serializeMerchantPresence({
      name: 'Nápoles Pizza',
      logoUrl: 'https://qqhberaayhohxlbbhdyi.supabase.co/storage/v1/object/public/logos/n.png',
      slug: 'napoles-pizza',
    });
    expect(parseMerchantPresenceCookie(raw)).toEqual({
      name: 'Nápoles Pizza',
      logoUrl: 'https://qqhberaayhohxlbbhdyi.supabase.co/storage/v1/object/public/logos/n.png',
      slug: 'napoles-pizza',
    });
  });

  it('rejects javascript logo urls', () => {
    expect(
      sanitizeMerchantPresence({
        name: 'Demo',
        logoUrl: 'javascript:alert(1)',
        slug: 'demo',
      }),
    ).toEqual({
      name: 'Demo',
      logoUrl: null,
      slug: 'demo',
    });
  });

  it('reads the named cookie from a document cookie string', () => {
    const encoded = serializeMerchantPresence({
      name: 'Donde Vladi',
      logoUrl: null,
      slug: 'donde-vladi',
    });
    expect(
      readMerchantPresenceFromDocumentCookie(`other=1; elmenuxfa_merchant=${encoded}; x=2`),
    ).toEqual({
      name: 'Donde Vladi',
      logoUrl: null,
      slug: 'donde-vladi',
    });
  });

  it('sets the parent domain on production hosts', () => {
    expect(merchantPresenceCookieDomain('app.elmenuxfa.com')).toBe('.elmenuxfa.com');
    expect(merchantPresenceCookieDomain('elmenuxfa.com')).toBe('.elmenuxfa.com');
    expect(merchantPresenceCookieDomain('localhost')).toBeUndefined();
    expect(buildMerchantPresenceCookie({ name: 'Demo', logoUrl: null, slug: 'demo' }, 'app.elmenuxfa.com')).toContain(
      'Domain=.elmenuxfa.com',
    );
    expect(buildClearedMerchantPresenceCookie('app.elmenuxfa.com')).toContain('Max-Age=0');
  });

  it('builds initials from the business name', () => {
    expect(merchantInitials('Nápoles Pizza')).toBe('NP');
    expect(merchantInitials('Demo')).toBe('D');
  });
});
