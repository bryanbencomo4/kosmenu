import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  allowsLocalOfflineChatbotCommerce,
  assertChatbotCommerceAccess,
  assertCommerceAllowlist,
  CommerceAccessError,
  isCommerceOnAllowlist,
  LOCAL_OFFLINE_CHATBOT_COMMERCE_ID,
  parseAllowedCommerceIds,
} from '../app/api/chat/_lib/commerce-auth';
import {
  getChatbotConfig,
  isChatbotRuntimeAllowed,
} from '../app/api/chat/_lib/config';

const ALLOWED = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';

describe('CHATBOT_ALLOWED_COMMERCE_IDS parsing', () => {
  it('accepts only valid UUIDs (comma/space/semicolon)', () => {
    const set = parseAllowedCommerceIds(
      `${ALLOWED}, not-a-uuid; ${OTHER.toUpperCase()}  meal4fit`,
    );
    expect(set.has(ALLOWED)).toBe(true);
    expect(set.has(OTHER)).toBe(true);
    expect(set.size).toBe(2);
  });

  it('isCommerceOnAllowlist is case-insensitive and rejects non-uuid', () => {
    const set = parseAllowedCommerceIds(ALLOWED);
    expect(isCommerceOnAllowlist(set, ALLOWED.toUpperCase())).toBe(true);
    expect(isCommerceOnAllowlist(set, 'meal4fit')).toBe(false);
    expect(isCommerceOnAllowlist(set, OTHER)).toBe(false);
  });
});

describe('allowlist enforcement', () => {
  it('denies empty allowlist in production', () => {
    expect(() =>
      assertCommerceAllowlist({
        allowedIds: new Set(),
        commerceId: ALLOWED,
        nodeEnv: 'production',
      }),
    ).toThrow(CommerceAccessError);
    try {
      assertCommerceAllowlist({
        allowedIds: new Set(),
        commerceId: ALLOWED,
        nodeEnv: 'production',
      });
    } catch (e) {
      expect((e as CommerceAccessError).code).toBe('commerce_allowlist_empty');
    }
  });

  it('allows empty allowlist in development (local smoke)', () => {
    expect(() =>
      assertCommerceAllowlist({
        allowedIds: new Set(),
        commerceId: ALLOWED,
        nodeEnv: 'development',
      }),
    ).not.toThrow();
  });

  it('denies commerce not on allowlist', () => {
    expect(() =>
      assertCommerceAllowlist({
        allowedIds: new Set([ALLOWED]),
        commerceId: OTHER,
        nodeEnv: 'production',
      }),
    ).toThrowError(/allowlist/i);
  });

  it('slug cannot satisfy allowlist (UUID only)', () => {
    expect(
      isCommerceOnAllowlist(new Set([ALLOWED]), 'meal4fit'),
    ).toBe(false);
  });
});

describe('production runtime gate + allowlist', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('blocks production when allowlist empty even with all other gates', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('CHATBOT_ENABLED', '1');
    vi.stubEnv('CHATBOT_ALLOW_PRODUCTION', '1');
    vi.stubEnv('CHATBOT_QUOTA_BACKEND', 'postgres');
    vi.stubEnv('GEMINI_API_KEY', 'fake-key-for-gate-test');
    vi.stubEnv('CHATBOT_ALLOWED_COMMERCE_IDS', '');
    const cfg = getChatbotConfig();
    expect(cfg.requireCommerceFlag).toBe(true);
    expect(isChatbotRuntimeAllowed(cfg).reason).toBe('commerce_allowlist_empty');
  });

  it('passes global production gate when allowlist + key set', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('CHATBOT_ENABLED', '1');
    vi.stubEnv('CHATBOT_ALLOW_PRODUCTION', '1');
    vi.stubEnv('CHATBOT_QUOTA_BACKEND', 'postgres');
    vi.stubEnv('GEMINI_API_KEY', 'fake-key-for-gate-test');
    vi.stubEnv('CHATBOT_ALLOWED_COMMERCE_IDS', ALLOWED);
    const cfg = getChatbotConfig();
    expect(cfg.allowedCommerceIds.has(ALLOWED)).toBe(true);
    expect(isChatbotRuntimeAllowed(cfg).ok).toBe(true);
  });

  it('blocks when GEMINI_API_KEY missing', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('CHATBOT_ENABLED', '1');
    vi.stubEnv('CHATBOT_ALLOW_PRODUCTION', '1');
    vi.stubEnv('CHATBOT_QUOTA_BACKEND', 'postgres');
    vi.stubEnv('GEMINI_API_KEY', '');
    vi.stubEnv('CHATBOT_ALLOWED_COMMERCE_IDS', ALLOWED);
    expect(isChatbotRuntimeAllowed(getChatbotConfig()).reason).toBe(
      'gemini_unconfigured',
    );
  });
});

describe('local offline exception (Pizzas El Trueno only)', () => {
  it('never allows offline exception in production', () => {
    expect(
      allowsLocalOfflineChatbotCommerce({
        commerceId: LOCAL_OFFLINE_CHATBOT_COMMERCE_ID,
        nodeEnv: 'production',
        allowOfflineLocalFlag: '1',
      }),
    ).toBe(false);
  });

  it('allows only Trueno UUID when local flag set', () => {
    expect(
      allowsLocalOfflineChatbotCommerce({
        commerceId: LOCAL_OFFLINE_CHATBOT_COMMERCE_ID,
        nodeEnv: 'development',
        allowOfflineLocalFlag: '1',
      }),
    ).toBe(true);
    expect(
      allowsLocalOfflineChatbotCommerce({
        commerceId: OTHER,
        nodeEnv: 'development',
        allowOfflineLocalFlag: '1',
      }),
    ).toBe(false);
    expect(
      allowsLocalOfflineChatbotCommerce({
        commerceId: LOCAL_OFFLINE_CHATBOT_COMMERCE_ID,
        nodeEnv: 'development',
        allowOfflineLocalFlag: '0',
      }),
    ).toBe(false);
  });
});

describe('chatbot_enabled kill switch (no cache)', () => {
  it('denies when DB returns chatbot_enabled=false', async () => {
    const supabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: { chatbot_enabled: false },
              error: null,
            }),
          }),
        }),
      }),
    } as any;

    await expect(
      assertChatbotCommerceAccess({
        config: {
          ...getChatbotConfig({
            NODE_ENV: 'test',
            CHATBOT_ENABLED: '1',
            CHATBOT_REQUIRE_COMMERCE_FLAG: '1',
            CHATBOT_ALLOWED_COMMERCE_IDS: ALLOWED,
            GEMINI_API_KEY: 'x',
          } as NodeJS.ProcessEnv),
          requireCommerceFlag: true,
          allowedCommerceIds: new Set([ALLOWED]),
        },
        commerceId: ALLOWED,
        supabase,
        nodeEnv: 'test',
      }),
    ).rejects.toMatchObject({ code: 'commerce_chatbot_disabled', status: 403 });
  });

  it('allows when allowlisted and chatbot_enabled=true', async () => {
    const supabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: { chatbot_enabled: true },
              error: null,
            }),
          }),
        }),
      }),
    } as any;

    await expect(
      assertChatbotCommerceAccess({
        config: {
          ...getChatbotConfig({
            NODE_ENV: 'test',
            CHATBOT_ENABLED: '1',
            CHATBOT_REQUIRE_COMMERCE_FLAG: '1',
            CHATBOT_ALLOWED_COMMERCE_IDS: ALLOWED,
            GEMINI_API_KEY: 'x',
          } as NodeJS.ProcessEnv),
          requireCommerceFlag: true,
          allowedCommerceIds: new Set([ALLOWED]),
        },
        commerceId: ALLOWED,
        supabase,
        nodeEnv: 'test',
      }),
    ).resolves.toBeUndefined();
  });
});
