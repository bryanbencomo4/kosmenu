/**
 * Chatbot quota — independent from ai_usage_control / photo credits.
 *
 * Backends:
 * - filesystem: local/dev only (site/.data/chatbot-usage/)
 * - postgres: atomic RPCs (service_role) — required for production
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
import type { ChatbotConfig } from './config';
import { estimateCostUsd } from './config';

export type ChatbotUsagePeriod = {
  commerceId: string;
  periodMonth: string;
  requests: number;
  conversations: number;
  tokensInput: number;
  tokensOutput: number;
  estimatedCost: number | null;
  errors: number;
  model: string | null;
  updatedAt: string;
};

export type ChatbotSessionUsage = {
  sessionId: string;
  commerceId: string;
  requests: number;
  updatedAt: string;
};

export class ChatbotQuotaError extends Error {
  status: number;
  code: string;

  constructor(message: string, status: number, code: string) {
    super(message);
    this.name = 'ChatbotQuotaError';
    this.status = status;
    this.code = code;
  }
}

export function currentPeriodMonth(now = new Date()): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function ensureDir(dir: string) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function periodPath(dir: string, commerceId: string, period: string) {
  return join(dir, `commerce_${commerceId}_${period}.json`);
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

/** Best-effort exclusive lock for concurrent local requests. */
function withFileLock<T>(dir: string, key: string, fn: () => T): T {
  ensureDir(dir);
  const lock = lockPath(dir, key);
  const started = Date.now();
  while (existsSync(lock)) {
    if (Date.now() - started > 3000) {
      throw new ChatbotQuotaError('Quota lock timeout', 503, 'quota_lock_timeout');
    }
    // Busy-wait briefly (local/dev only). Production uses Postgres row locks.
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

export function loadPeriodUsage(
  config: ChatbotConfig,
  commerceId: string,
  period = currentPeriodMonth(),
): ChatbotUsagePeriod {
  ensureDir(config.usageDir);
  const path = periodPath(config.usageDir, commerceId, period);
  return readJson<ChatbotUsagePeriod>(path, {
    commerceId,
    periodMonth: period,
    requests: 0,
    conversations: 0,
    tokensInput: 0,
    tokensOutput: 0,
    estimatedCost: null,
    errors: 0,
    model: null,
    updatedAt: new Date().toISOString(),
  });
}

export function loadSessionUsage(
  config: ChatbotConfig,
  sessionId: string,
  commerceId: string,
): ChatbotSessionUsage {
  ensureDir(config.usageDir);
  const path = sessionPath(config.usageDir, sessionId);
  return readJson<ChatbotSessionUsage>(path, {
    sessionId,
    commerceId,
    requests: 0,
    updatedAt: new Date().toISOString(),
  });
}

function reserveFilesystem(params: {
  config: ChatbotConfig;
  commerceId: string;
  sessionId: string;
  isNewConversation?: boolean;
}): { period: ChatbotUsagePeriod; session: ChatbotSessionUsage } {
  const { config, commerceId, sessionId } = params;
  return withFileLock(config.usageDir, `${commerceId}_${sessionId}`, () => {
    const period = loadPeriodUsage(config, commerceId);
    if (period.requests >= config.maxMonthlyRequestsPerCommerce) {
      throw new ChatbotQuotaError(
        'Monthly chatbot request limit reached',
        429,
        'monthly_request_limit',
      );
    }
    const tokenTotal = period.tokensInput + period.tokensOutput;
    if (tokenTotal >= config.maxMonthlyTokensPerCommerce) {
      throw new ChatbotQuotaError(
        'Monthly chatbot token limit reached',
        429,
        'monthly_token_limit',
      );
    }

    const session = loadSessionUsage(config, sessionId, commerceId);
    if (session.commerceId && session.commerceId !== commerceId && session.requests > 0) {
      throw new ChatbotQuotaError(
        'Session belongs to another restaurant',
        403,
        'session_tenant_mismatch',
      );
    }
    if (session.requests >= config.maxRequestsPerSession) {
      throw new ChatbotQuotaError(
        'Session message limit reached',
        429,
        'session_request_limit',
      );
    }

    period.requests += 1;
    if (params.isNewConversation) period.conversations += 1;
    period.updatedAt = new Date().toISOString();
    writeJsonAtomic(
      periodPath(config.usageDir, commerceId, period.periodMonth),
      period,
    );

    session.commerceId = commerceId;
    session.requests += 1;
    session.updatedAt = new Date().toISOString();
    writeJsonAtomic(sessionPath(config.usageDir, sessionId), session);

    return { period, session };
  });
}

function recordFilesystem(params: {
  config: ChatbotConfig;
  commerceId: string;
  model: string;
  tokensInput: number;
  tokensOutput: number;
  error?: boolean;
}): ChatbotUsagePeriod {
  const { config, commerceId } = params;
  return withFileLock(config.usageDir, `period_${commerceId}`, () => {
    const period = loadPeriodUsage(config, commerceId);
    period.tokensInput += Math.max(0, Math.floor(params.tokensInput || 0));
    period.tokensOutput += Math.max(0, Math.floor(params.tokensOutput || 0));
    period.model = params.model;
    if (params.error) period.errors += 1;
    const costDelta = estimateCostUsd(
      config,
      params.tokensInput,
      params.tokensOutput,
    );
    if (costDelta != null) {
      period.estimatedCost = (period.estimatedCost ?? 0) + costDelta;
    }
    period.updatedAt = new Date().toISOString();
    writeJsonAtomic(
      periodPath(config.usageDir, commerceId, period.periodMonth),
      period,
    );
    return period;
  });
}

function mapRpcQuotaError(message: string): ChatbotQuotaError {
  const m = message.toLowerCase();
  if (m.includes('monthly request')) {
    return new ChatbotQuotaError(message, 429, 'monthly_request_limit');
  }
  if (m.includes('monthly token')) {
    return new ChatbotQuotaError(message, 429, 'monthly_token_limit');
  }
  if (m.includes('session request')) {
    return new ChatbotQuotaError(message, 429, 'session_request_limit');
  }
  if (m.includes('tenant mismatch')) {
    return new ChatbotQuotaError(message, 403, 'session_tenant_mismatch');
  }
  if (m.includes('commerce disabled') || m.includes('chatbot commerce disabled')) {
    return new ChatbotQuotaError(message, 403, 'commerce_chatbot_disabled');
  }
  return new ChatbotQuotaError(message, 503, 'quota_unavailable');
}

async function reservePostgres(params: {
  config: ChatbotConfig;
  supabase: SupabaseClient;
  commerceId: string;
  sessionId: string;
  isNewConversation?: boolean;
}): Promise<{ period: ChatbotUsagePeriod; session: ChatbotSessionUsage }> {
  const { config, supabase, commerceId, sessionId } = params;

  if (config.requireCommerceFlag) {
    const { data: comercio, error: cErr } = await supabase
      .from('comercios')
      .select('chatbot_enabled')
      .eq('id', commerceId)
      .maybeSingle();
    if (cErr) {
      throw new ChatbotQuotaError(cErr.message, 503, 'quota_db_error');
    }
    if (!comercio || (comercio as { chatbot_enabled?: boolean }).chatbot_enabled !== true) {
      throw new ChatbotQuotaError(
        'Chatbot not enabled for this restaurant',
        403,
        'commerce_chatbot_disabled',
      );
    }
  }

  const periodMonth = currentPeriodMonth();

  // Preferred: single-transaction reserve (Phase 2.2). Falls back if migration not applied.
  const { data: atomicRow, error: atomicErr } = await supabase.rpc(
    'reserve_ai_chatbot_quota',
    {
      p_session_id: sessionId,
      p_commerce_id: commerceId,
      p_max_session_requests: config.maxRequestsPerSession,
      p_period_month: periodMonth,
      p_max_monthly_requests: config.maxMonthlyRequestsPerCommerce,
      p_max_monthly_tokens: config.maxMonthlyTokensPerCommerce,
      p_is_new_conversation: Boolean(params.isNewConversation),
      p_model: config.model,
    },
  );

  if (!atomicErr && atomicRow && typeof atomicRow === 'object') {
    const payload = atomicRow as {
      session?: Record<string, unknown>;
      period?: Record<string, unknown>;
    };
    const period = payload.period ?? {};
    const session = payload.session ?? {};
    return {
      period: {
        commerceId,
        periodMonth: String(period.period_month ?? periodMonth),
        requests: Number(period.requests ?? 0),
        conversations: Number(period.conversations ?? 0),
        tokensInput: Number(period.tokens_input ?? 0),
        tokensOutput: Number(period.tokens_output ?? 0),
        estimatedCost:
          period.estimated_cost == null ? null : Number(period.estimated_cost),
        errors: Number(period.errors ?? 0),
        model: (period.model as string) ?? null,
        updatedAt: String(period.updated_at ?? new Date().toISOString()),
      },
      session: {
        sessionId,
        commerceId,
        requests: Number(session.requests ?? 0),
        updatedAt: String(session.updated_at ?? new Date().toISOString()),
      },
    };
  }

  if (atomicErr && !isMissingRpcError(atomicErr.message)) {
    throw mapRpcQuotaError(atomicErr.message);
  }

  // Legacy two-step path (Phase 2.1 migrations only).
  const { data: sessionRow, error: sErr } = await supabase.rpc(
    'reserve_ai_chatbot_session',
    {
      p_session_id: sessionId,
      p_commerce_id: commerceId,
      p_max_requests: config.maxRequestsPerSession,
    },
  );
  if (sErr) throw mapRpcQuotaError(sErr.message);

  const { data: periodRow, error: pErr } = await supabase.rpc(
    'increment_ai_chatbot_usage',
    {
      p_commerce_id: commerceId,
      p_period_month: periodMonth,
      p_requests: 1,
      p_conversations: params.isNewConversation ? 1 : 0,
      p_tokens_input: 0,
      p_tokens_output: 0,
      p_max_requests: config.maxMonthlyRequestsPerCommerce,
      p_max_tokens: config.maxMonthlyTokensPerCommerce,
    },
  );
  if (pErr) {
    // Best-effort note: session was already incremented on the legacy path.
    throw mapRpcQuotaError(pErr.message);
  }

  const period = periodRow as Record<string, unknown>;
  const session = sessionRow as Record<string, unknown>;

  return {
    period: {
      commerceId,
      periodMonth: String(period.period_month ?? periodMonth),
      requests: Number(period.requests ?? 0),
      conversations: Number(period.conversations ?? 0),
      tokensInput: Number(period.tokens_input ?? 0),
      tokensOutput: Number(period.tokens_output ?? 0),
      estimatedCost:
        period.estimated_cost == null ? null : Number(period.estimated_cost),
      errors: Number(period.errors ?? 0),
      model: (period.model as string) ?? null,
      updatedAt: String(period.updated_at ?? new Date().toISOString()),
    },
    session: {
      sessionId,
      commerceId,
      requests: Number(session.requests ?? 0),
      updatedAt: String(session.updated_at ?? new Date().toISOString()),
    },
  };
}

function isMissingRpcError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes('could not find the function') ||
    m.includes('function public.reserve_ai_chatbot_quota') ||
    m.includes('schema cache') ||
    m.includes('does not exist')
  );
}

async function recordPostgres(params: {
  config: ChatbotConfig;
  supabase: SupabaseClient;
  commerceId: string;
  model: string;
  tokensInput: number;
  tokensOutput: number;
  error?: boolean;
}): Promise<ChatbotUsagePeriod> {
  const cost = estimateCostUsd(
    params.config,
    params.tokensInput,
    params.tokensOutput,
  );
  const { data, error } = await params.supabase.rpc('increment_ai_chatbot_usage', {
    p_commerce_id: params.commerceId,
    p_period_month: currentPeriodMonth(),
    p_requests: 0,
    p_conversations: 0,
    p_tokens_input: Math.max(0, Math.floor(params.tokensInput || 0)),
    p_tokens_output: Math.max(0, Math.floor(params.tokensOutput || 0)),
    p_estimated_cost: cost,
    p_errors: params.error ? 1 : 0,
    p_model: params.model,
  });
  if (error) throw mapRpcQuotaError(error.message);
  const period = data as Record<string, unknown>;
  return {
    commerceId: params.commerceId,
    periodMonth: String(period.period_month ?? currentPeriodMonth()),
    requests: Number(period.requests ?? 0),
    conversations: Number(period.conversations ?? 0),
    tokensInput: Number(period.tokens_input ?? 0),
    tokensOutput: Number(period.tokens_output ?? 0),
    estimatedCost:
      period.estimated_cost == null ? null : Number(period.estimated_cost),
    errors: Number(period.errors ?? 0),
    model: (period.model as string) ?? params.model,
    updatedAt: String(period.updated_at ?? new Date().toISOString()),
  };
}

/** Sync helper kept for unit tests of filesystem backend. */
export function reserveChatbotRequest(params: {
  config: ChatbotConfig;
  commerceId: string;
  sessionId: string;
  isNewConversation?: boolean;
}): { period: ChatbotUsagePeriod; session: ChatbotSessionUsage } {
  if (params.config.quotaBackend !== 'filesystem') {
    throw new ChatbotQuotaError(
      'Use reserveChatbotRequestAsync for postgres backend',
      503,
      'quota_backend_async_required',
    );
  }
  return reserveFilesystem(params);
}

export function recordChatbotTokens(params: {
  config: ChatbotConfig;
  commerceId: string;
  model: string;
  tokensInput: number;
  tokensOutput: number;
  error?: boolean;
}): ChatbotUsagePeriod {
  if (params.config.quotaBackend !== 'filesystem') {
    throw new ChatbotQuotaError(
      'Use recordChatbotTokensAsync for postgres backend',
      503,
      'quota_backend_async_required',
    );
  }
  return recordFilesystem(params);
}

export async function reserveChatbotRequestAsync(params: {
  config: ChatbotConfig;
  commerceId: string;
  sessionId: string;
  isNewConversation?: boolean;
  supabase?: SupabaseClient | null;
}): Promise<{ period: ChatbotUsagePeriod; session: ChatbotSessionUsage }> {
  if (params.config.quotaBackend === 'postgres') {
    if (!params.supabase) {
      throw new ChatbotQuotaError(
        'Postgres quota requires Supabase client',
        503,
        'quota_unavailable',
      );
    }
    return reservePostgres({
      config: params.config,
      supabase: params.supabase,
      commerceId: params.commerceId,
      sessionId: params.sessionId,
      isNewConversation: params.isNewConversation,
    });
  }
  return reserveFilesystem(params);
}

export async function recordChatbotTokensAsync(params: {
  config: ChatbotConfig;
  commerceId: string;
  model: string;
  tokensInput: number;
  tokensOutput: number;
  error?: boolean;
  supabase?: SupabaseClient | null;
}): Promise<ChatbotUsagePeriod> {
  if (params.config.quotaBackend === 'postgres') {
    if (!params.supabase) {
      throw new ChatbotQuotaError(
        'Postgres quota requires Supabase client',
        503,
        'quota_unavailable',
      );
    }
    return recordPostgres({
      config: params.config,
      supabase: params.supabase,
      commerceId: params.commerceId,
      model: params.model,
      tokensInput: params.tokensInput,
      tokensOutput: params.tokensOutput,
      error: params.error,
    });
  }
  return recordFilesystem(params);
}

export function resetChatbotQuotaForTests(config: ChatbotConfig) {
  ensureDir(config.usageDir);
}
