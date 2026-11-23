import { afterEach, describe, expect, it, vi } from 'vitest';

import { getChatbotConfig } from '../app/api/chat/_lib/config';
import {
  CHATBOT_FALLBACK_MODEL,
  CHATBOT_MODEL_CATALOG,
  CHATBOT_PRIMARY_MODEL,
  CHATBOT_RETIRED_MODELS,
  resolveChatbotModelPair,
} from '../app/api/chat/_lib/models';

describe('chatbot model catalog (Phase 2.2)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('defaults to gemini-3.1-flash-lite with a cheaper Flash-Lite fallback', () => {
    const resolved = resolveChatbotModelPair({});
    expect(resolved.model).toBe(CHATBOT_PRIMARY_MODEL);
    expect(resolved.modelFallback).toBe(CHATBOT_FALLBACK_MODEL);
    expect(CHATBOT_MODEL_CATALOG[resolved.model].functionCalling).toBe(true);
    expect(CHATBOT_MODEL_CATALOG[resolved.modelFallback].functionCalling).toBe(
      true,
    );

    const primary =
      CHATBOT_MODEL_CATALOG[resolved.model].priceInputPer1M +
      CHATBOT_MODEL_CATALOG[resolved.model].priceOutputPer1M;
    const fallback =
      CHATBOT_MODEL_CATALOG[resolved.modelFallback].priceInputPer1M +
      CHATBOT_MODEL_CATALOG[resolved.modelFallback].priceOutputPer1M;
    expect(fallback).toBeLessThanOrEqual(primary);
  });

  it('rewrites retired primary/fallback ids', () => {
    const resolved = resolveChatbotModelPair({
      primaryRaw: 'gemini-2.0-flash-lite',
      fallbackRaw: 'gemini-2.5-flash',
    });
    expect(resolved.model).toBe(CHATBOT_PRIMARY_MODEL);
    expect(resolved.modelFallback).toBe(CHATBOT_FALLBACK_MODEL);
    expect(resolved.warnings.some((w) => w.startsWith('primary_retired'))).toBe(
      true,
    );
    expect(resolved.warnings.some((w) => w.startsWith('fallback_retired'))).toBe(
      true,
    );
    expect(CHATBOT_RETIRED_MODELS).toContain('gemini-2.0-flash-lite');
  });

  it('does not keep a more expensive known model as fallback', () => {
    const resolved = resolveChatbotModelPair({
      primaryRaw: 'gemini-3.1-flash-lite',
      fallbackRaw: 'gemini-3.5-flash-lite',
    });
    expect(resolved.model).toBe('gemini-3.1-flash-lite');
    expect(resolved.modelFallback).toBe(CHATBOT_FALLBACK_MODEL);
    expect(resolved.warnings).toContain(
      'fallback_more_expensive_than_primary',
    );
  });

  it('wires defaults through getChatbotConfig with pricing for 3.1 Flash-Lite', () => {
    vi.stubEnv('CHATBOT_GEMINI_MODEL', '');
    vi.stubEnv('CHATBOT_GEMINI_MODEL_FALLBACK', '');
    vi.stubEnv('CHATBOT_PRICE_INPUT_PER_1M', '');
    vi.stubEnv('CHATBOT_PRICE_OUTPUT_PER_1M', '');
    const config = getChatbotConfig();
    expect(config.model).toBe('gemini-3.1-flash-lite');
    expect(config.modelFallback).toBe('gemini-2.5-flash-lite');
    expect(config.priceInputPer1M).toBe(0.25);
    expect(config.priceOutputPer1M).toBe(1.5);
  });

  it('honors CHATBOT_GEMINI_MODEL env override when not retired', () => {
    vi.stubEnv('CHATBOT_GEMINI_MODEL', 'gemini-3.1-flash-lite');
    vi.stubEnv('CHATBOT_GEMINI_MODEL_FALLBACK', 'gemini-2.5-flash-lite');
    const config = getChatbotConfig();
    expect(config.model).toBe('gemini-3.1-flash-lite');
    expect(config.modelFallback).toBe('gemini-2.5-flash-lite');
  });
});
