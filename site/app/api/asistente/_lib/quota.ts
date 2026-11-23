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

import type { DiscoveryAssistantConfig } from './config';

export type DiscoveryUsagePeriod = {
  agent: 'discovery';
  periodMonth: string;
  requests: number;
  tokensInput?: number;
  tokensOutput?: number;
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
