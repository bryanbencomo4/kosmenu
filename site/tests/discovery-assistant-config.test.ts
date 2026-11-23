import { afterEach, describe, expect, it } from 'vitest';

import {
  canOfferDiscoveryChatLink,
  isDiscoveryAssistantSimulate,
  isDiscoveryAssistantUiEnabled,
  normalizeDiscoveryRef,
} from '../app/_lib/discovery-assistant';
import {
  getDiscoveryAssistantConfig,
  isDiscoveryGeminiLiveAllowed,
} from '../app/api/asistente/_lib/config';

describe('discovery assistant flags', () => {
  const prev = { ...process.env };

  afterEach(() => {
    process.env = { ...prev };
  });

  it('UI flag defaults off', () => {
    expect(isDiscoveryAssistantUiEnabled({ publicFlag: null })).toBe(false);
    expect(isDiscoveryAssistantUiEnabled({ publicFlag: '1' })).toBe(true);
  });

  it('simulate is forced off in production and defaults on in test', () => {
    expect(
      isDiscoveryAssistantSimulate({
        NODE_ENV: 'production',
        DISCOVERY_ASSISTANT_SIMULATE: '1',
      } as NodeJS.ProcessEnv),
    ).toBe(false);
    expect(
      isDiscoveryAssistantSimulate({
        NODE_ENV: 'test',
        DISCOVERY_ASSISTANT_SIMULATE: '1',
      } as NodeJS.ProcessEnv),
    ).toBe(true);
    expect(
      isDiscoveryAssistantSimulate({
        NODE_ENV: 'test',
      } as NodeJS.ProcessEnv),
    ).toBe(true);
  });

  it('normalizes share refs', () => {
    expect(normalizeDiscoveryRef('wa')).toBe('wa');
    expect(normalizeDiscoveryRef('WA')).toBe('wa');
    expect(normalizeDiscoveryRef('evil<script>')).toBe(null);
  });

  it('chat links require UX slug AND preview-effective env', () => {
    expect(
      canOfferDiscoveryChatLink('pizzas-el-trueno', {
        nodeEnv: 'production',
        publicPreviewFlag: null,
      }),
    ).toBe(false);
    expect(
      canOfferDiscoveryChatLink('pizzas-el-trueno', {
        nodeEnv: 'production',
        publicPreviewFlag: '1',
      }),
    ).toBe(true);
    expect(
      canOfferDiscoveryChatLink('otro-local', {
        nodeEnv: 'development',
        publicPreviewFlag: null,
      }),
    ).toBe(false);
  });

  it('production Gemini stays off without persistent quota ready', () => {
    const config = getDiscoveryAssistantConfig({
      NODE_ENV: 'production',
      DISCOVERY_ASSISTANT_ENABLED: '1',
      DISCOVERY_ASSISTANT_ALLOW_PRODUCTION: '1',
      DISCOVERY_ASSISTANT_ALLOW_GEMINI: '1',
      DISCOVERY_ASSISTANT_QUOTA_BACKEND: 'filesystem',
      GEMINI_API_KEY: 'fake',
    } as NodeJS.ProcessEnv);
    // Explicit filesystem in prod resolves, but live gate must reject it.
    const live = isDiscoveryGeminiLiveAllowed(config, {
      NODE_ENV: 'production',
      DISCOVERY_ASSISTANT_ALLOW_GEMINI: '1',
    } as NodeJS.ProcessEnv);
    expect(live.ok).toBe(false);
    expect(live.reason).toMatch(/filesystem|quota|persistent|postgres/i);
  });

  it('production Gemini stays off without request ledger ready', () => {
    const config = getDiscoveryAssistantConfig({
      NODE_ENV: 'production',
      DISCOVERY_ASSISTANT_ENABLED: '1',
      DISCOVERY_ASSISTANT_ALLOW_PRODUCTION: '1',
      DISCOVERY_ASSISTANT_ALLOW_GEMINI: '1',
      DISCOVERY_ASSISTANT_QUOTA_BACKEND: 'postgres',
      DISCOVERY_ASSISTANT_POSTGRES_QUOTA_READY: '1',
      GEMINI_API_KEY: 'fake',
    } as NodeJS.ProcessEnv);
    const live = isDiscoveryGeminiLiveAllowed(config, {
      NODE_ENV: 'production',
      DISCOVERY_ASSISTANT_ALLOW_GEMINI: '1',
      DISCOVERY_ASSISTANT_POSTGRES_QUOTA_READY: '1',
      DISCOVERY_ASSISTANT_REQUEST_LEDGER_READY: '0',
    } as NodeJS.ProcessEnv);
    expect(live.ok).toBe(false);
    expect(live.reason).toBe('request_ledger_not_ready');
  });

  it('defaults production quota backend to none', () => {
    const config = getDiscoveryAssistantConfig({
      NODE_ENV: 'production',
    } as NodeJS.ProcessEnv);
    expect(config.quotaBackend).toBe('none');
  });
});
