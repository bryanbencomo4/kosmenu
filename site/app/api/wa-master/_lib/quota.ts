/**
 * Exclusive Master Assistant quota — never shares Discovery/chatbot counters.
 * Default backend: memory (tests). Live Gemini refused unless
 * PLATFORM_WA_MASTER_ALLOW_GEMINI=1 and quota allows.
 * Production uses createSupabaseWaMasterQuotaStore (atomic RPC).
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export class WaMasterQuotaError extends Error {
  code: string;
  constructor(message: string, code: string) {
    super(message);
    this.name = 'WaMasterQuotaError';
    this.code = code;
  }
}

export type WaMasterQuotaState = {
  periodMonth: string;
  requests: number;
  tokensInput: number;
  tokensOutput: number;
  updatedAtMs: number;
};

export interface WaMasterQuotaStore {
  reserve(periodMonth: string, maxRequests: number): Promise<void>;
  recordTokens(
    periodMonth: string,
    input: number,
    output: number,
    requestId: string,
  ): Promise<void>;
  snapshot(periodMonth: string): Promise<WaMasterQuotaState>;
}

function monthKey(nowMs = Date.now()): string {
  const d = new Date(nowMs);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function createMemoryWaMasterQuotaStore(): WaMasterQuotaStore {
  const periods = new Map<string, WaMasterQuotaState>();
  const recorded = new Set<string>();

  return {
    async reserve(periodMonth, maxRequests) {
      const cur = periods.get(periodMonth) || {
        periodMonth,
        requests: 0,
        tokensInput: 0,
        tokensOutput: 0,
        updatedAtMs: Date.now(),
      };
      if (cur.requests >= maxRequests) {
        throw new WaMasterQuotaError('Master quota exhausted', 'quota_exhausted');
      }
      cur.requests += 1;
      cur.updatedAtMs = Date.now();
      periods.set(periodMonth, cur);
    },
    async recordTokens(periodMonth, input, output, requestId) {
      if (recorded.has(requestId)) return;
      recorded.add(requestId);
      const cur = periods.get(periodMonth) || {
        periodMonth,
        requests: 0,
        tokensInput: 0,
        tokensOutput: 0,
        updatedAtMs: Date.now(),
      };
      cur.tokensInput += Math.max(0, input);
      cur.tokensOutput += Math.max(0, output);
      cur.updatedAtMs = Date.now();
      periods.set(periodMonth, cur);
    },
    async snapshot(periodMonth) {
      return (
        periods.get(periodMonth) || {
          periodMonth,
          requests: 0,
          tokensInput: 0,
          tokensOutput: 0,
          updatedAtMs: Date.now(),
        }
      );
    },
  };
}

/**
 * Atomic Postgres quota via wa_master_quota_reserve / wa_master_quota_record_tokens.
 * Idempotent token ledger by request_id.
 */
export function createSupabaseWaMasterQuotaStore(client: SupabaseClient): WaMasterQuotaStore {
  return {
    async reserve(periodMonth, maxRequests) {
      const { data, error } = await client.rpc('wa_master_quota_reserve', {
        p_period_month: periodMonth,
        p_max_requests: maxRequests,
      });
      if (error) {
        throw new WaMasterQuotaError(error.message.slice(0, 160), 'quota_rpc_error');
      }
      const ok = data === true || (data && typeof data === 'object' && (data as { ok?: boolean }).ok === true);
      if (!ok) {
        throw new WaMasterQuotaError('Master quota exhausted', 'quota_exhausted');
      }
    },
    async recordTokens(periodMonth, input, output, requestId) {
      const { error } = await client.rpc('wa_master_quota_record_tokens', {
        p_period_month: periodMonth,
        p_tokens_input: Math.max(0, Math.floor(input)),
        p_tokens_output: Math.max(0, Math.floor(output)),
        p_request_id: requestId,
      });
      if (error) {
        // Non-fatal for reply path — tokens may be under-counted once.
        console.error('[wa-master] quota_record_tokens', error.message.slice(0, 120));
      }
    },
    async snapshot(periodMonth) {
      const { data } = await client
        .from('wa_master_quota')
        .select('period_month,requests,tokens_input,tokens_output,updated_at_ms')
        .eq('period_month', periodMonth)
        .maybeSingle();
      if (!data) {
        return {
          periodMonth,
          requests: 0,
          tokensInput: 0,
          tokensOutput: 0,
          updatedAtMs: Date.now(),
        };
      }
      return {
        periodMonth: String(data.period_month),
        requests: Number(data.requests || 0),
        tokensInput: Number(data.tokens_input || 0),
        tokensOutput: Number(data.tokens_output || 0),
        updatedAtMs: Number(data.updated_at_ms || Date.now()),
      };
    },
  };
}

export { monthKey as waMasterQuotaMonth };
