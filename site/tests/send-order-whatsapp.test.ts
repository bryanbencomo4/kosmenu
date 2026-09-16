import { describe, expect, it } from 'vitest';

import { normalizePhoneToE164 } from '../app/api/_lib/send-order-whatsapp';

describe('normalizePhoneToE164', () => {
  it('keeps a Venezuelan mobile in E.164 with plus', () => {
    expect(normalizePhoneToE164('+584121234567')).toBe('+584121234567');
  });

  it('normalizes local 04xx numbers to Venezuela E.164', () => {
    expect(normalizePhoneToE164('04121234567')).toBe('+584121234567');
  });

  it('normalizes 58xxxxxxxxxx without plus', () => {
    expect(normalizePhoneToE164('584121234567')).toBe('+584121234567');
  });
});
