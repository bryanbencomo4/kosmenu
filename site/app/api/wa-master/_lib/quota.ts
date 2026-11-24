/**
 * Exclusive Master Assistant quota — never shares Discovery/chatbot counters.
 * Default backend: memory (tests). Filesystem for local. Live Gemini refused
 * unless PLATFORM_WA_MASTER_ALLOW_GEMINI=1 and quota allows.
 */

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

export { monthKey as waMasterQuotaMonth };
