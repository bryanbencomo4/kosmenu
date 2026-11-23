import { afterEach, describe, expect, it } from 'vitest';

import { canOfferDiscoveryChatLinkServer } from '../app/api/asistente/_lib/chat-links';

const TRUENO = '0aa8c53b-07f1-446e-8b88-66c2b7ae89ea';

describe('discovery chat link effective flags', () => {
  const prev = { ...process.env };

  afterEach(() => {
    process.env = { ...prev };
  });

  it('denies production chat CTA when allowlist is empty (fail-closed)', () => {
    expect(
      canOfferDiscoveryChatLinkServer('pizzas-el-trueno', TRUENO, {
        NODE_ENV: 'production',
        NEXT_PUBLIC_CHATBOT_PREVIEW: '1',
        CHATBOT_ALLOWED_COMMERCE_IDS: '',
      } as NodeJS.ProcessEnv),
    ).toBe(false);
  });

  it('allows production chat CTA only for allowlisted commerce UUID + preview', () => {
    expect(
      canOfferDiscoveryChatLinkServer('pizzas-el-trueno', TRUENO, {
        NODE_ENV: 'production',
        NEXT_PUBLIC_CHATBOT_PREVIEW: '1',
        CHATBOT_ALLOWED_COMMERCE_IDS: TRUENO,
      } as NodeJS.ProcessEnv),
    ).toBe(true);
    expect(
      canOfferDiscoveryChatLinkServer('pizzas-el-trueno', TRUENO, {
        NODE_ENV: 'production',
        NEXT_PUBLIC_CHATBOT_PREVIEW: null,
        CHATBOT_ALLOWED_COMMERCE_IDS: TRUENO,
      } as NodeJS.ProcessEnv),
    ).toBe(false);
  });

  it('denies chat for non-UX slug even when UUID is allowlisted', () => {
    expect(
      canOfferDiscoveryChatLinkServer('otro-local', TRUENO, {
        NODE_ENV: 'development',
        NEXT_PUBLIC_CHATBOT_PREVIEW: '1',
        CHATBOT_ALLOWED_COMMERCE_IDS: TRUENO,
      } as NodeJS.ProcessEnv),
    ).toBe(false);
  });
});
