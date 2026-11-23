/**
 * Server-only chatbot configuration.
 * Never expose secrets via NEXT_PUBLIC_*.
 *
 * Activation layers (must ALL pass for live Gemini in production):
 * 1) CHATBOT_ENABLED=1  — master server switch
 * 2) CHATBOT_ALLOW_PRODUCTION=1
 * 3) CHATBOT_QUOTA_BACKEND=postgres (default in production)
 * 4) GEMINI_API_KEY present
 * 5) Commerce UUID in CHATBOT_ALLOWED_COMMERCE_IDS (fail-closed if empty in prod)
 * 6) comercios.chatbot_enabled = true (fresh DB read; forced in production)
 * 7) Quota reserve succeeds
 *
 * NEXT_PUBLIC_CHATBOT_PREVIEW / ?chatbot=1 only open the UI shell. They never authorize Gemini.
 * Path slug is resolved server-side to a UUID; clients cannot bypass allowlist via URL.
 *
 * Models (Phase 2.2): CHATBOT_GEMINI_MODEL / CHATBOT_GEMINI_MODEL_FALLBACK
 * defaults to gemini-3.1-flash-lite / gemini-2.5-flash-lite (see _lib/models.ts).
 */

import { parseAllowedCommerceIds } from './commerce-auth';
import {
  CHATBOT_FALLBACK_MODEL,
  CHATBOT_PRIMARY_MODEL,
  resolveChatbotModelPair,
} from './models';

export type ChatbotQuotaBackend = 'filesystem' | 'postgres';

export type ChatbotConfig = {
  enabled: boolean;
  allowProduction: boolean;
  /**
   * Enforce comercios.chatbot_enabled on every request (fresh DB read).
   * Forced true when NODE_ENV=production.
   */
  requireCommerceFlag: boolean;
  /** UUID allowlist from CHATBOT_ALLOWED_COMMERCE_IDS (empty = deny-all in production). */
  allowedCommerceIds: ReadonlySet<string>;
  quotaBackend: ChatbotQuotaBackend;
  geminiApiKey: string | null;
  model: string;
  modelFallback: string;
  /** Soft warnings from model resolution (retired ids, price guards). */
  modelWarnings: string[];
  timeoutMs: number;
  maxOutputTokens: number;
  maxToolRounds: number;
  maxHistoryMessages: number;
  maxMessageChars: number;
  maxMessagesPerRequest: number;
  rateLimitPerIpPerMinute: number;
  maxRequestsPerSession: number;
  maxMonthlyRequestsPerCommerce: number;
  maxMonthlyTokensPerCommerce: number;
  priceInputPer1M: number | null;
  priceOutputPer1M: number | null;
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

function envFloatOrNull(name: string, env: NodeJS.ProcessEnv = process.env): number | null {
  const raw = (env[name] ?? '').trim();
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function resolveQuotaBackend(env: NodeJS.ProcessEnv): ChatbotQuotaBackend {
  const explicit = (env.CHATBOT_QUOTA_BACKEND ?? '').trim().toLowerCase();
  if (explicit === 'postgres' || explicit === 'filesystem') return explicit;
  const nodeEnv = (env.NODE_ENV ?? '').toLowerCase();
  // Production defaults to postgres; local/dev defaults to filesystem.
  return nodeEnv === 'production' ? 'postgres' : 'filesystem';
}

export function getChatbotConfig(
  env: NodeJS.ProcessEnv = process.env,
): ChatbotConfig {
  const geminiApiKey = (env.GEMINI_API_KEY ?? '').trim() || null;
  const nodeEnv = (env.NODE_ENV ?? '').toLowerCase();
  const isProduction = nodeEnv === 'production';
  const resolved = resolveChatbotModelPair({
    primaryRaw: env.CHATBOT_GEMINI_MODEL,
    fallbackRaw: env.CHATBOT_GEMINI_MODEL_FALLBACK,
  });
  const priceInputOverride = envFloatOrNull('CHATBOT_PRICE_INPUT_PER_1M', env);
  const priceOutputOverride = envFloatOrNull('CHATBOT_PRICE_OUTPUT_PER_1M', env);
  // Production always requires the per-commerce DB kill switch.
  const requireCommerceFlag =
    isProduction || envBool('CHATBOT_REQUIRE_COMMERCE_FLAG', false, env);
  return {
    enabled: envBool('CHATBOT_ENABLED', false, env),
    allowProduction: envBool('CHATBOT_ALLOW_PRODUCTION', false, env),
    requireCommerceFlag,
    allowedCommerceIds: parseAllowedCommerceIds(env.CHATBOT_ALLOWED_COMMERCE_IDS),
    quotaBackend: resolveQuotaBackend(env),
    geminiApiKey,
    model: resolved.model || CHATBOT_PRIMARY_MODEL,
    modelFallback: resolved.modelFallback || CHATBOT_FALLBACK_MODEL,
    modelWarnings: resolved.warnings,
    timeoutMs: envInt('CHATBOT_TIMEOUT_MS', 25_000, env),
    maxOutputTokens: envInt('CHATBOT_MAX_OUTPUT_TOKENS', 512, env),
    // Prefer ≤2 rounds: digest + parallel tools should cover most turns.
    maxToolRounds: envInt('CHATBOT_MAX_TOOL_ROUNDS', 2, env),
    maxHistoryMessages: envInt('CHATBOT_MAX_HISTORY_MESSAGES', 24, env),
    maxMessageChars: envInt('CHATBOT_MAX_MESSAGE_CHARS', 800, env),
    maxMessagesPerRequest: envInt('CHATBOT_MAX_MESSAGES_PER_REQUEST', 40, env),
    rateLimitPerIpPerMinute: envInt('CHATBOT_RATE_LIMIT_PER_IP_PER_MIN', 20, env),
    maxRequestsPerSession: envInt('CHATBOT_MAX_REQUESTS_PER_SESSION', 40, env),
    maxMonthlyRequestsPerCommerce: envInt(
      'CHATBOT_MAX_MONTHLY_REQUESTS_PER_COMMERCE',
      500,
      env,
    ),
    maxMonthlyTokensPerCommerce: envInt(
      'CHATBOT_MAX_MONTHLY_TOKENS_PER_COMMERCE',
      2_000_000,
      env,
    ),
    // Defaults match the resolved primary catalog pricing unless overridden.
    priceInputPer1M: priceInputOverride ?? resolved.priceInputPer1M,
    priceOutputPer1M: priceOutputOverride ?? resolved.priceOutputPer1M,
    usageDir:
      (env.CHATBOT_USAGE_DIR ?? '').trim() ||
      `${process.cwd()}/.data/chatbot-usage`,
  };
}

/**
 * Server authorization for live Gemini (independent of NEXT_PUBLIC_* / URL params).
 * Does not include per-commerce allowlist / chatbot_enabled — those run after UUID resolve.
 */
export function isChatbotRuntimeAllowed(
  config: ChatbotConfig,
  env: NodeJS.ProcessEnv = process.env,
): { ok: boolean; reason?: string } {
  if (!config.enabled) {
    return { ok: false, reason: 'chatbot_disabled' };
  }
  const nodeEnv = (env.NODE_ENV ?? '').toLowerCase();
  if (nodeEnv === 'production' && !config.allowProduction) {
    return { ok: false, reason: 'production_blocked' };
  }
  if (nodeEnv === 'production' && config.quotaBackend !== 'postgres') {
    return { ok: false, reason: 'quota_backend_not_persistent' };
  }
  if (nodeEnv === 'production' && !config.requireCommerceFlag) {
    return { ok: false, reason: 'commerce_flag_required' };
  }
  if (nodeEnv === 'production' && config.allowedCommerceIds.size === 0) {
    return { ok: false, reason: 'commerce_allowlist_empty' };
  }
  if (!config.geminiApiKey) {
    // Local simulator does not need a real Gemini key (never hits Google).
    const simulate =
      nodeEnv !== 'production' &&
      ['1', 'true', 'yes'].includes(
        (env.CHATBOT_SIMULATE_GEMINI ?? '').trim().toLowerCase(),
      );
    if (!simulate) {
      return { ok: false, reason: 'gemini_unconfigured' };
    }
  }
  return { ok: true };
}

export function estimateCostUsd(
  config: ChatbotConfig,
  tokensIn: number,
  tokensOut: number,
): number | null {
  if (config.priceInputPer1M == null || config.priceOutputPer1M == null) {
    return null;
  }
  return (
    (tokensIn / 1_000_000) * config.priceInputPer1M +
    (tokensOut / 1_000_000) * config.priceOutputPer1M
  );
}

export const CHATBOT_UNAVAILABLE_MSG =
  'En este momento no puedo responderte. Puedes consultar nuestro menú o hablar directamente con el restaurante.';
