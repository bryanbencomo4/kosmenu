import { describe, expect, it } from 'vitest';

import {
  buildWhatsAppDeepLink,
  buildWhatsAppHref,
  digitsOnlyPhone,
  isValidWhatsAppHttpsUrl,
} from '../app/_lib/whatsapp-href';

describe('whatsapp-href', () => {
  it('builds api.whatsapp.com links with digits-only phone', () => {
    expect(digitsOnlyPhone('+58 412-1234567')).toBe('584121234567');
    expect(buildWhatsAppHref('584121234567')).toBe(
      'https://api.whatsapp.com/send?phone=584121234567',
    );
    const withText = buildWhatsAppHref('584121234567', 'Hola 👋');
    expect(withText.startsWith('https://api.whatsapp.com/send?')).toBe(true);
    expect(new URL(withText).searchParams.get('phone')).toBe('584121234567');
    expect(new URL(withText).searchParams.get('text')).toBe('Hola 👋');
  });

  it('builds native deep links for mobile handoff', () => {
    const deep = buildWhatsAppDeepLink('584121234567', 'Pago');
    expect(deep.startsWith('whatsapp://send?')).toBe(true);
    expect(new URL(deep).searchParams.get('phone')).toBe('584121234567');
    expect(new URL(deep).searchParams.get('text')).toBe('Pago');
  });

  it('accepts api.whatsapp.com and legacy wa.me fallbacks', () => {
    expect(isValidWhatsAppHttpsUrl('https://api.whatsapp.com/send?phone=584121234567')).toBe(true);
    expect(isValidWhatsAppHttpsUrl('https://wa.me/584121234567')).toBe(true);
    expect(isValidWhatsAppHttpsUrl('https://evil.com/send?phone=584121234567')).toBe(false);
  });
});
