import { describe, expect, it, beforeEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ChatbotConfig } from '../app/api/chat/_lib/config';
import {
  ChatbotQuotaError,
  loadPeriodUsage,
  recordChatbotTokens,
  reserveChatbotRequest,
} from '../app/api/chat/_lib/quota';

function testConfig(dir: string): ChatbotConfig {
  return {
    enabled: true,
    allowProduction: false,
    requireCommerceFlag: false,
    allowedCommerceIds: new Set<string>(),
    quotaBackend: 'filesystem',
    geminiApiKey: 'test',
    model: 'gemini-3.1-flash-lite',
    modelFallback: 'gemini-2.5-flash-lite',
    modelWarnings: [],
    timeoutMs: 1000,
    maxOutputTokens: 128,
    maxToolRounds: 2,
    maxHistoryMessages: 10,
    maxMessageChars: 200,
    maxMessagesPerRequest: 10,
    rateLimitPerIpPerMinute: 5,
    maxRequestsPerSession: 3,
    maxMonthlyRequestsPerCommerce: 5,
    maxMonthlyTokensPerCommerce: 1000,
    priceInputPer1M: 0.1,
    priceOutputPer1M: 0.4,
    usageDir: dir,
  };
}

describe('chatbot independent quota', () => {
  let dir: string;
  let config: ChatbotConfig;
  const commerceId = 'c-test-1';

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'chatbot-quota-'));
    config = testConfig(dir);
  });

  it('reserves requests and blocks at session limit', () => {
    reserveChatbotRequest({
      config,
      commerceId,
      sessionId: 's_abc12345',
      isNewConversation: true,
    });
    reserveChatbotRequest({ config, commerceId, sessionId: 's_abc12345' });
    reserveChatbotRequest({ config, commerceId, sessionId: 's_abc12345' });
    expect(() =>
      reserveChatbotRequest({ config, commerceId, sessionId: 's_abc12345' }),
    ).toThrow(ChatbotQuotaError);

    const period = loadPeriodUsage(config, commerceId);
    expect(period.requests).toBe(3);
    expect(period.conversations).toBe(1);
  });

  it('records tokens separately from photo AI credits fields', () => {
    reserveChatbotRequest({
      config,
      commerceId,
      sessionId: 's_tok123456',
    });
    const period = recordChatbotTokens({
      config,
      commerceId,
      model: 'gemini-3.1-flash-lite',
      tokensInput: 100,
      tokensOutput: 50,
    });
    expect(period.tokensInput).toBe(100);
    expect(period.tokensOutput).toBe(50);
    expect(period.estimatedCost).toBeCloseTo((100 * 0.1 + 50 * 0.4) / 1_000_000);
  });

  it('rejects session reused across commerces', () => {
    reserveChatbotRequest({
      config,
      commerceId: 'c-a',
      sessionId: 's_shared999',
    });
    expect(() =>
      reserveChatbotRequest({
        config,
        commerceId: 'c-b',
        sessionId: 's_shared999',
      }),
    ).toThrow(/another restaurant/i);
  });
});
