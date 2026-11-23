/**
 * Discovery assistant server config.
 *
 * Live Gemini in production requires a persistent atomic quota backend.
 * Filesystem quota is authorized only for development/test — never for prod live calls.
 * Until postgres (or equivalent) RPCs exist, production Gemini stays disabled;
 * directory/search fallback remains available.
 */

import { isDiscoveryAssistantSimulate } from '../../../_lib/discovery-assistant';
import {
  CHATBOT_FALLBACK_MODEL,
  CHATBOT_PRIMARY_MODEL,
  resolveChatbotModelPair,
} from '../../chat/_lib/models';

export type DiscoveryQuotaBackend = 'filesystem' | 'postgres' | 'none';

export type DiscoveryAssistantConfig = {
  enabled: boolean;
  allowProduction: boolean;
  simulate: boolean;
  quotaBackend: DiscoveryQuotaBackend;
  geminiApiKey: string | null;
  model: string;
  modelFallback: string;
  timeoutMs: number;
  maxOutputTokens: number;
  maxToolRounds: number;
  maxHistoryMessages: number;
  maxMessageChars: number;
  maxMessagesPerRequest: number;
  rateLimitPerIpPerMinute: number;
  maxRequestsPerSession: number;
  maxMonthlyRequests: number;
  maxMonthlyTokens: number;
  defaultPageSize: number;
  usageDir: string;
};

function envBool(name: string, fallback = false, env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = (env[name] ?? '').trim().toLowerCase();
  if (!raw) return fallback;
  return raw === '1' || raw === 'true' || raw === 'yes';
}

function envInt(name: string, fallback: number, env: NodeJS.ProcessEnv = process.env): number {
  const n = Number(env[name]);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function resolveQuotaBackend(env: NodeJS.ProcessEnv): DiscoveryQuotaBackend {
  const explicit = (env.DISCOVERY_ASSISTANT_QUOTA_BACKEND ?? '').trim().toLowerCase();
  if (explicit === 'postgres' || explicit === 'filesystem' || explicit === 'none') {
    return explicit;
  }
  const nodeEnv = (env.NODE_ENV ?? '').toLowerCase();
  // Production defaults to none until a persistent backend ships (no migrations in this phase).
  if (nodeEnv === 'production') return 'none';
  return 'filesystem';
}

export function getDiscoveryAssistantConfig(
  env: NodeJS.ProcessEnv = process.env,
): DiscoveryAssistantConfig {
  const geminiApiKey = (env.GEMINI_API_KEY ?? '').trim() || null;
  const resolved = resolveChatbotModelPair({
    primaryRaw: env.DISCOVERY_ASSISTANT_GEMINI_MODEL ?? env.CHATBOT_GEMINI_MODEL,
    fallbackRaw:
      env.DISCOVERY_ASSISTANT_GEMINI_MODEL_FALLBACK ?? env.CHATBOT_GEMINI_MODEL_FALLBACK,
  });

  return {
    enabled: envBool('DISCOVERY_ASSISTANT_ENABLED', false, env),
    allowProduction: envBool('DISCOVERY_ASSISTANT_ALLOW_PRODUCTION', false, env),
    simulate: isDiscoveryAssistantSimulate(env),
    quotaBackend: resolveQuotaBackend(env),
    geminiApiKey,
    model: resolved.model || CHATBOT_PRIMARY_MODEL,
    modelFallback: resolved.modelFallback || CHATBOT_FALLBACK_MODEL,
    timeoutMs: envInt('DISCOVERY_ASSISTANT_TIMEOUT_MS', 20_000, env),
    maxOutputTokens: envInt('DISCOVERY_ASSISTANT_MAX_OUTPUT_TOKENS', 512, env),
    maxToolRounds: envInt('DISCOVERY_ASSISTANT_MAX_TOOL_ROUNDS', 2, env),
    maxHistoryMessages: envInt('DISCOVERY_ASSISTANT_MAX_HISTORY_MESSAGES', 20, env),
    maxMessageChars: envInt('DISCOVERY_ASSISTANT_MAX_MESSAGE_CHARS', 800, env),
    maxMessagesPerRequest: envInt('DISCOVERY_ASSISTANT_MAX_MESSAGES_PER_REQUEST', 30, env),
    rateLimitPerIpPerMinute: envInt('DISCOVERY_ASSISTANT_RATE_LIMIT_PER_IP_PER_MIN', 30, env),
    maxRequestsPerSession: envInt('DISCOVERY_ASSISTANT_MAX_REQUESTS_PER_SESSION', 40, env),
    maxMonthlyRequests: envInt('DISCOVERY_ASSISTANT_MAX_MONTHLY_REQUESTS', 2_000, env),
    maxMonthlyTokens: envInt('DISCOVERY_ASSISTANT_MAX_MONTHLY_TOKENS', 2_000_000, env),
    defaultPageSize: envInt('DISCOVERY_ASSISTANT_PAGE_SIZE', 24, env),
    usageDir:
      (env.DISCOVERY_ASSISTANT_USAGE_DIR ?? '').trim() ||
      `${process.cwd()}/.data/discovery-assistant-usage`,
  };
}

/**
 * Live Gemini authorization. Fail-closed in production without persistent quota.
 * Filesystem backend never authorizes live Gemini in production.
 *
 * NOTE: Postgres RPCs are not shipped yet — even with quotaBackend=postgres,
 * production live Gemini stays off until DISCOVERY_ASSISTANT_POSTGRES_QUOTA_READY=1
 * is set after migrations exist. Today that means isDiscoveryGeminiLiveAllowed
 * returns false in production always for practical deploys.
 */
export function isDiscoveryGeminiLiveAllowed(
  config: DiscoveryAssistantConfig,
  env: NodeJS.ProcessEnv = process.env,
): { ok: boolean; reason?: string } {
  if (!config.enabled) return { ok: false, reason: 'discovery_disabled' };
  if (config.simulate) return { ok: false, reason: 'simulate_mode' };

  const nodeEnv = (env.NODE_ENV ?? '').toLowerCase();
  if (nodeEnv === 'production') {
    if (!config.allowProduction) return { ok: false, reason: 'production_blocked' };
    if (config.quotaBackend !== 'postgres') {
      return { ok: false, reason: 'quota_backend_not_persistent' };
    }
    // Postgres RPCs are not shipped in this phase — keep Gemini off until they exist.
    if (!envBool('DISCOVERY_ASSISTANT_POSTGRES_QUOTA_READY', false, env)) {
      return { ok: false, reason: 'postgres_quota_not_ready' };
    }
  }

  if (config.quotaBackend === 'none') {
    return { ok: false, reason: 'quota_backend_none' };
  }
  if (config.quotaBackend === 'filesystem' && nodeEnv === 'production') {
    return { ok: false, reason: 'filesystem_forbidden_in_production' };
  }
  if (!config.geminiApiKey) {
    return { ok: false, reason: 'gemini_unconfigured' };
  }
  // Explicit opt-in for any live Google call (local included).
  if (!envBool('DISCOVERY_ASSISTANT_ALLOW_GEMINI', false, env)) {
    return { ok: false, reason: 'gemini_not_opted_in' };
  }
  return { ok: true };
}

export const DISCOVERY_FALLBACK_MSG =
  'Puedo ayudarte a buscar restaurantes con los filtros del directorio. Prueba una categoría o escribe qué se te antoja.';
