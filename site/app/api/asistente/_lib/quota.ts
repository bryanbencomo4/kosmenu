/**
 * Discovery assistant quota — pluggable backends.
 *
 * - filesystem: local/dev/test only under .data/discovery-assistant-usage/
 * - postgres: reserved for a future atomic RPC backend (not implemented yet)
 * - none: no live Gemini; directory fallback still works
 *
 * assertFilesystemAllowed throws in production so filesystem can never
 * back live Gemini there (mirrors chatbot production → postgres requirement).
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

import type { SupabaseClient } from '@supabase/supabase-js';

import {
  estimateDiscoveryCostUsd,
  type DiscoveryAssistantConfig,
} from './config';

/** In-process idempotency for token posts (same requestId must not double-count). */
const recordedTokenRequestIds = new Map<string, number>();
const TOKEN_IDEMPOTENCY_TTL_MS = 15 * 60_000;

function rememberTokenRecord(requestId: string) {
  const now = Date.now();
  for (const [id, at] of recordedTokenRequestIds) {
    if (now - at > TOKEN_IDEMPOTENCY_TTL_MS) recordedTokenRequestIds.delete(id);
  }
  recordedTokenRequestIds.set(requestId, now);
}

function alreadyRecordedTokens(requestId: string): boolean {
  const at = recordedTokenRequestIds.get(requestId);
  if (at == null) return false;
  if (Date.now() - at > TOKEN_IDEMPOTENCY_TTL_MS) {
    recordedTokenRequestIds.delete(requestId);
    return false;
  }
  return true;
}

export type DiscoveryUsagePeriod = {
  agent: 'discovery';
  periodMonth: string;
  requests: number;
  tokensInput?: number;
  tokensOutput?: number;
  estimatedCost?: number | null;
  updatedAt: string;
};

export type DiscoverySessionUsage = {
  sessionId: string;
  requests: number;
  updatedAt: string;
};

export class DiscoveryQuotaError extends Error {
  status: number;
  code: string;

  constructor(message: string, status: number, code: string) {
    super(message);
    this.name = 'DiscoveryQuotaError';
    this.status = status;
    this.code = code;
  }
}

export function currentPeriodMonth(now = new Date()): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

/** Hard guard — filesystem quota must never run in production. */
export function assertFilesystemAllowed(
  env: NodeJS.ProcessEnv = process.env,
): void {
  const nodeEnv = (env.NODE_ENV ?? '').trim().toLowerCase();
  if (nodeEnv === 'production') {
    throw new DiscoveryQuotaError(
      'Filesystem discovery quota is forbidden in production',
      503,
      'filesystem_forbidden_in_production',
    );
  }
}

function ensureDir(dir: string) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function periodPath(dir: string, period: string) {
  return join(dir, `period_${period}.json`);
}

function sessionPath(dir: string, sessionId: string) {
  return join(
    dir,
    `session_${sessionId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64)}.json`,
  );
}

function lockPath(dir: string, key: string) {
  return join(dir, `lock_${key.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80)}.lock`);
}

function readJson<T>(path: string, fallback: T): T {
  try {
    if (!existsSync(path)) return fallback;
    return JSON.parse(readFileSync(path, 'utf8')) as T;
  } catch {
    return fallback;
  }
}

function writeJsonAtomic(path: string, value: unknown) {
  const tmp = `${path}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmp, JSON.stringify(value, null, 2), 'utf8');
  renameSync(tmp, path);
}

function withFileLock<T>(dir: string, key: string, fn: () => T): T {
  ensureDir(dir);
  const lock = lockPath(dir, key);
  const started = Date.now();
  while (existsSync(lock)) {
    if (Date.now() - started > 3000) {
      throw new DiscoveryQuotaError('Quota lock timeout', 503, 'quota_lock_timeout');
    }
    const waitUntil = Date.now() + 15;
    while (Date.now() < waitUntil) {
      /* spin */
    }
  }
  writeFileSync(lock, String(process.pid), 'utf8');
  try {
    return fn();
  } finally {
    try {
      if (existsSync(lock)) unlinkSync(lock);
    } catch {
      /* ignore */
    }
  }
}

function loadPeriodUsage(
  config: DiscoveryAssistantConfig,
  period = currentPeriodMonth(),
): DiscoveryUsagePeriod {
  ensureDir(config.usageDir);
  return readJson<DiscoveryUsagePeriod>(periodPath(config.usageDir, period), {
    agent: 'discovery',
    periodMonth: period,
    requests: 0,
    updatedAt: new Date().toISOString(),
  });
}

function loadSessionUsage(
  config: DiscoveryAssistantConfig,
  sessionId: string,
): DiscoverySessionUsage {
  ensureDir(config.usageDir);
  return readJson<DiscoverySessionUsage>(sessionPath(config.usageDir, sessionId), {
    sessionId,
    requests: 0,
    updatedAt: new Date().toISOString(),
  });
}

function reserveFilesystem(params: {
  config: DiscoveryAssistantConfig;
  sessionId: string;
}): { period: DiscoveryUsagePeriod; session: DiscoverySessionUsage } {
  assertFilesystemAllowed();
  const { config, sessionId } = params;
  return withFileLock(config.usageDir, `discovery_${sessionId}`, () => {
    const period = loadPeriodUsage(config);
    if (period.requests >= config.maxMonthlyRequests) {
      throw new DiscoveryQuotaError(
        'Monthly discovery request limit reached',
        429,
        'monthly_request_limit',
      );
    }
    const session = loadSessionUsage(config, sessionId);
    if (session.requests >= config.maxRequestsPerSession) {
      throw new DiscoveryQuotaError(
        'Session message limit reached',
        429,
        'session_request_limit',
      );
    }
    period.requests += 1;
    period.updatedAt = new Date().toISOString();
    writeJsonAtomic(periodPath(config.usageDir, period.periodMonth), period);

    session.requests += 1;
    session.updatedAt = new Date().toISOString();
    writeJsonAtomic(sessionPath(config.usageDir, sessionId), session);

    return { period, session };
  });
}

async function reservePostgres(params: {
  config: DiscoveryAssistantConfig;
  sessionId: string;
  supabase: SupabaseClient;
}): Promise<{ period: DiscoveryUsagePeriod; session: DiscoverySessionUsage }> {
  const periodMonth = currentPeriodMonth();
  const { data, error } = await params.supabase.rpc('reserve_ai_discovery_quota', {
    p_session_id: params.sessionId,
    p_max_session_requests: params.config.maxRequestsPerSession,
    p_period_month: periodMonth,
    p_max_monthly_requests: params.config.maxMonthlyRequests,
    p_max_monthly_tokens: params.config.maxMonthlyTokens,
    p_model: params.config.model,
  });

  if (error) {
    const msg = error.message || 'discovery quota rpc failed';
    if (/session request limit/i.test(msg)) {
      throw new DiscoveryQuotaError(msg, 429, 'session_request_limit');
    }
    if (/monthly request limit/i.test(msg)) {
      throw new DiscoveryQuotaError(msg, 429, 'monthly_request_limit');
    }
    if (/monthly token limit/i.test(msg)) {
      throw new DiscoveryQuotaError(msg, 429, 'monthly_token_limit');
    }
    if (/killed/i.test(msg)) {
      throw new DiscoveryQuotaError(msg, 503, 'discovery_killed');
    }
    if (/Could not find the function|schema cache|does not exist/i.test(msg)) {
      throw new DiscoveryQuotaError(
        'Discovery postgres quota RPC missing — apply migration first',
        503,
        'postgres_quota_not_ready',
      );
    }
    throw new DiscoveryQuotaError(msg, 503, 'quota_unavailable');
  }

  const payload = (data ?? {}) as {
    session?: Record<string, unknown>;
    period?: Record<string, unknown>;
  };
  const session = payload.session ?? {};
  const period = payload.period ?? {};
  return {
    session: {
      sessionId: String(session.session_id ?? params.sessionId),
      requests: Number(session.requests ?? 0),
      updatedAt: String(session.updated_at ?? new Date().toISOString()),
    },
    period: {
      agent: 'discovery',
      periodMonth: String(period.period_month ?? periodMonth),
      requests: Number(period.requests ?? 0),
      tokensInput: Number(period.tokens_input ?? 0),
      tokensOutput: Number(period.tokens_output ?? 0),
      updatedAt: String(period.updated_at ?? new Date().toISOString()),
    },
  };
}

/**
 * Reserve one request against the configured backend.
 * Postgres uses reserve_ai_discovery_quota (isolated from restaurant chatbot tables).
 */
export async function reserveDiscoveryRequest(params: {
  config: DiscoveryAssistantConfig;
  sessionId: string;
  supabase?: SupabaseClient | null;
}): Promise<{ period: DiscoveryUsagePeriod; session: DiscoverySessionUsage }> {
  const { config, sessionId } = params;
  if (config.quotaBackend === 'none') {
    throw new DiscoveryQuotaError(
      'Discovery quota backend is none',
      503,
      'quota_backend_none',
    );
  }
  if (config.quotaBackend === 'filesystem') {
    return reserveFilesystem({ config, sessionId });
  }
  if (!params.supabase) {
    throw new DiscoveryQuotaError(
      'Discovery postgres quota requires Supabase client',
      503,
      'quota_unavailable',
    );
  }
  return reservePostgres({
    config,
    sessionId,
    supabase: params.supabase,
  });
}

function recordFilesystemTokens(params: {
  config: DiscoveryAssistantConfig;
  tokensInput: number;
  tokensOutput: number;
  estimatedCost: number | null;
  model: string;
}): DiscoveryUsagePeriod {
  assertFilesystemAllowed();
  const periodMonth = currentPeriodMonth();
  return withFileLock(params.config.usageDir, `discovery_tokens_${periodMonth}`, () => {
    const period = loadPeriodUsage(params.config, periodMonth);
    period.tokensInput = (period.tokensInput ?? 0) + Math.max(0, params.tokensInput);
    period.tokensOutput = (period.tokensOutput ?? 0) + Math.max(0, params.tokensOutput);
    period.updatedAt = new Date().toISOString();
    writeJsonAtomic(periodPath(params.config.usageDir, periodMonth), period);
    return {
      ...period,
      estimatedCost: params.estimatedCost,
    };
  });
}

async function recordPostgresTokens(params: {
  config: DiscoveryAssistantConfig;
  supabase: SupabaseClient;
  tokensInput: number;
  tokensOutput: number;
  estimatedCost: number | null;
  model: string;
}): Promise<DiscoveryUsagePeriod> {
  const periodMonth = currentPeriodMonth();
  const { data, error } = await params.supabase.rpc('increment_ai_discovery_tokens', {
    p_period_month: periodMonth,
    p_tokens_input: Math.max(0, Math.floor(params.tokensInput)),
    p_tokens_output: Math.max(0, Math.floor(params.tokensOutput)),
    p_estimated_cost: params.estimatedCost,
    p_model: params.model,
  });
  if (error) {
    throw new DiscoveryQuotaError(
      error.message || 'discovery token rpc failed',
      503,
      'quota_unavailable',
    );
  }
  const period = (data ?? {}) as Record<string, unknown>;
  return {
    agent: 'discovery',
    periodMonth: String(period.period_month ?? periodMonth),
    requests: Number(period.requests ?? 0),
    tokensInput: Number(period.tokens_input ?? 0),
    tokensOutput: Number(period.tokens_output ?? 0),
    estimatedCost:
      period.estimated_cost == null ? null : Number(period.estimated_cost),
    updatedAt: String(period.updated_at ?? new Date().toISOString()),
  };
}

/**
 * Post-turn token accounting. Call once per HTTP requestId after live Gemini.
 * Does not authorize Gemini by itself; reserve must have succeeded first.
 * Token posting is best-effort for cost visibility — request caps remain the hard stop.
 */
export async function recordDiscoveryTokens(params: {
  config: DiscoveryAssistantConfig;
  requestId: string;
  model: string;
  tokensInput: number;
  tokensOutput: number;
  supabase?: SupabaseClient | null;
}): Promise<DiscoveryUsagePeriod | null> {
  const tin = Math.max(0, Math.floor(params.tokensInput || 0));
  const tout = Math.max(0, Math.floor(params.tokensOutput || 0));
  if (tin === 0 && tout === 0) return null;

  const requestId = (params.requestId || '').trim();
  if (requestId.length >= 8 && alreadyRecordedTokens(requestId)) {
    return null;
  }

  const cost = estimateDiscoveryCostUsd(tin, tout);
  const { config } = params;

  let period: DiscoveryUsagePeriod;
  if (config.quotaBackend === 'filesystem') {
    period = recordFilesystemTokens({
      config,
      tokensInput: tin,
      tokensOutput: tout,
      estimatedCost: cost,
      model: params.model,
    });
  } else if (config.quotaBackend === 'postgres') {
    if (!params.supabase) {
      throw new DiscoveryQuotaError(
        'Discovery postgres token record requires Supabase client',
        503,
        'quota_unavailable',
      );
    }
    period = await recordPostgresTokens({
      config,
      supabase: params.supabase,
      tokensInput: tin,
      tokensOutput: tout,
      estimatedCost: cost,
      model: params.model,
    });
  } else {
    return null;
  }

  if (requestId.length >= 8) rememberTokenRecord(requestId);
  return period;
}

/**
 * Consume one Gemini HTTP slot from the optional durable budget.
 * Uses a synthetic period (`2099-12`) so real calendar months are untouched.
 * Fail-closed when budget env is set and the slot cannot be reserved.
 */
export async function consumeDiscoveryGeminiHttpSlot(params: {
  config: DiscoveryAssistantConfig;
  supabase?: SupabaseClient | null;
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  const budget = params.config.geminiHttpBudget;
  if (!budget || budget <= 0) return { ok: true };

  const BUDGET_SESSION = 'discovery-gemini-http-budget-v1';
  const BUDGET_PERIOD = '2099-12';

  if (params.config.quotaBackend === 'postgres') {
    if (!params.supabase) {
      return { ok: false, reason: 'http_budget_unavailable' };
    }
    const { error } = await params.supabase.rpc('reserve_ai_discovery_quota', {
      p_session_id: BUDGET_SESSION,
      p_max_session_requests: budget,
      p_period_month: BUDGET_PERIOD,
      p_max_monthly_requests: budget,
      p_max_monthly_tokens: null,
      p_model: 'http-budget',
    });
    if (error) {
      const msg = error.message || '';
      if (/session request limit|monthly request limit/i.test(msg)) {
        return { ok: false, reason: 'http_budget_exhausted' };
      }
      return { ok: false, reason: 'http_budget_unavailable' };
    }
    return { ok: true };
  }

  if (params.config.quotaBackend === 'filesystem') {
    assertFilesystemAllowed();
    try {
      withFileLock(params.config.usageDir, 'discovery_http_budget', () => {
        const path = join(params.config.usageDir, 'gemini-http-budget.json');
        let used = 0;
        if (existsSync(path)) {
          try {
            const raw = JSON.parse(readFileSync(path, 'utf8')) as { used?: number };
            used = Number(raw.used ?? 0) || 0;
          } catch {
            used = 0;
          }
        }
        if (used >= budget) {
          throw new DiscoveryQuotaError('http budget exhausted', 429, 'http_budget_exhausted');
        }
        writeJsonAtomic(path, { used: used + 1, budget, updatedAt: new Date().toISOString() });
      });
      return { ok: true };
    } catch (err) {
      if (err instanceof DiscoveryQuotaError) {
        return { ok: false, reason: err.code };
      }
      return { ok: false, reason: 'http_budget_unavailable' };
    }
  }

  return { ok: false, reason: 'http_budget_unavailable' };
}

/** Test helper — clears in-process token idempotency map. */
export function __resetDiscoveryTokenIdempotencyForTests() {
  recordedTokenRequestIds.clear();
}
