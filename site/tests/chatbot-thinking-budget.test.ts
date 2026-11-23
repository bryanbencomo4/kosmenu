import { describe, expect, it } from 'vitest';

import { buildThinkingConfigForModel } from '../app/api/chat/_lib/thinking';
import {
  canGuaranteeCostCap,
  configureLiveBudget,
  getLiveBudgetSnapshot,
  assertLiveBudgetAllowsNextCall,
  recordLiveBudgetGeminiHttpCall,
  LiveBudgetExceededError,
} from '../app/api/chat/_lib/live-budget';

describe('gemini thinking config', () => {
  it('uses thinkingLevel MINIMAL for Gemini 3.1 Flash-Lite (not thinkingBudget)', () => {
    expect(buildThinkingConfigForModel('gemini-3.1-flash-lite')).toEqual({
      thinkingLevel: 'MINIMAL',
    });
    expect(buildThinkingConfigForModel('gemini-3.5-flash-lite')).toEqual({
      thinkingLevel: 'MINIMAL',
    });
  });

  it('uses thinkingBudget for Gemini 2.5 Flash-Lite fallback', () => {
    expect(buildThinkingConfigForModel('gemini-2.5-flash-lite')).toEqual({
      thinkingBudget: 0,
    });
  });
});

describe('live hard budget', () => {
  it('stops at absolute Gemini HTTP call cap including fallbacks/tools', () => {
    configureLiveBudget({
      enabled: true,
      maxGeminiHttpCalls: 6,
      maxEstimatedCostUsd: 0.02,
      resetCounters: true,
      persistPath: null,
    });
    for (let i = 0; i < 6; i += 1) {
      assertLiveBudgetAllowsNextCall();
      recordLiveBudgetGeminiHttpCall();
    }
    expect(getLiveBudgetSnapshot().geminiHttpCalls).toBe(6);
    expect(() => assertLiveBudgetAllowsNextCall()).toThrow(LiveBudgetExceededError);
  });

  it('can guarantee USD 0.02 with 6 calls × 7k in × 256 out at 3.1 Flash-Lite prices', () => {
    const check = canGuaranteeCostCap({
      maxGeminiHttpCalls: 6,
      maxOutputTokensPerCall: 256,
      assumedMaxInputTokensPerCall: 7000,
      priceInputPer1M: 0.25,
      priceOutputPer1M: 1.5,
      maxEstimatedCostUsd: 0.02,
    });
    expect(check.ok).toBe(true);
    expect(check.worstCaseUsd).toBeLessThanOrEqual(0.02);
  });

  it('refuses to claim guarantee when worst-case exceeds USD 0.02', () => {
    const check = canGuaranteeCostCap({
      maxGeminiHttpCalls: 6,
      maxOutputTokensPerCall: 512,
      assumedMaxInputTokensPerCall: 12_000,
      priceInputPer1M: 0.25,
      priceOutputPer1M: 1.5,
      maxEstimatedCostUsd: 0.02,
    });
    expect(check.ok).toBe(false);
  });
});
