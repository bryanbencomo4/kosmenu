import { describe, expect, it } from 'vitest';
import {
  isChatbotOrdersBlocked,
  isChatbotStagingMode,
} from '../app/api/_lib/staging-guards';
import { asReadOnlySupabaseClient } from '../app/api/_lib/supabase-readonly';
import {
  assertLiveBudgetPreflight,
  configureLiveBudget,
  getLiveBudgetSnapshot,
  LiveBudgetExceededError,
} from '../app/api/chat/_lib/live-budget';

describe('staging guards', () => {
  it('staging mode disabled in production NODE_ENV', () => {
    expect(
      isChatbotStagingMode({
        NODE_ENV: 'production',
        CHATBOT_STAGING_MODE: '1',
      } as NodeJS.ProcessEnv),
    ).toBe(false);
  });

  it('blocks orders when staging or explicit block', () => {
    expect(
      isChatbotOrdersBlocked({
        NODE_ENV: 'development',
        CHATBOT_STAGING_MODE: '1',
      } as NodeJS.ProcessEnv),
    ).toBe(true);
    expect(
      isChatbotOrdersBlocked({
        NODE_ENV: 'development',
        CHATBOT_BLOCK_ORDERS: '1',
      } as NodeJS.ProcessEnv),
    ).toBe(true);
  });

  it('read-only proxy blocks insert', () => {
    const fake = {
      from(_table?: string) {
        return {
          insert(_row?: unknown) {
            return Promise.resolve({ data: null, error: null });
          },
          select() {
            return Promise.resolve({ data: [], error: null });
          },
        };
      },
    };
    const ro = asReadOnlySupabaseClient(
      fake as unknown as import('@supabase/supabase-js').SupabaseClient,
    );
    expect(() =>
      (
        ro as unknown as {
          from: (t: string) => { insert: (row: unknown) => unknown };
        }
      )
        .from('pedidos')
        .insert({ x: 1 }),
    ).toThrow(/staging_readonly|Blocked mutating/i);
  });
});

describe('live budget media preflight', () => {
  it('stops when media preflight would exceed sub-cap', () => {
    configureLiveBudget({
      enabled: true,
      maxGeminiHttpCalls: 28,
      maxEstimatedCostUsd: 0.1,
      maxMediaHttpCalls: 6,
      maxMediaCostUsd: 0.0001,
      priceInputPer1M: 0.25,
      priceAudioInputPer1M: 0.5,
      priceOutputPer1M: 1.5,
      resetCounters: true,
      persistPath: null,
    });
    expect(() =>
      assertLiveBudgetPreflight({
        kind: 'audio',
        audioDurationSec: 60,
        maxOutputTokens: 256,
        isMedia: true,
      }),
    ).toThrow(LiveBudgetExceededError);
    const snap = getLiveBudgetSnapshot();
    expect(snap.hardGuarantee).toBe(false);
  });
});
