/**
 * Master Assistant flags — fail closed. Default OFF so production wa-entry
 * router stays unchanged until explicit activation review.
 */

export type WaMasterConfig = {
  enabled: boolean;
  /** Shadow: run orchestrator but caller must not send replies. */
  shadowMode: boolean;
  allowGemini: boolean;
  maxTurnsInPrompt: number;
  maxRepliesPerTurn: number;
  profileTtlMs: number;
  consumerAssistantUrl: string;
  businessLandingUrl: string;
  businessRegisterUrl: string;
  businessManageUrl: string;
};

function envBool(env: NodeJS.ProcessEnv, key: string, fallback = false): boolean {
  const raw = (env[key] ?? '').trim().toLowerCase();
  if (!raw) return fallback;
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
}

function envInt(env: NodeJS.ProcessEnv, key: string, fallback: number): number {
  const n = Number(env[key]);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function envStr(env: NodeJS.ProcessEnv, key: string, fallback: string): string {
  const v = (env[key] ?? '').trim();
  return v || fallback;
}

export function loadWaMasterConfig(env: NodeJS.ProcessEnv = process.env): WaMasterConfig {
  return {
    enabled: envBool(env, 'PLATFORM_WA_MASTER', false),
    shadowMode: envBool(env, 'PLATFORM_WA_MASTER_SHADOW', false),
    allowGemini: envBool(env, 'PLATFORM_WA_MASTER_ALLOW_GEMINI', false),
    maxTurnsInPrompt: envInt(env, 'PLATFORM_WA_MASTER_MAX_TURNS', 12),
    maxRepliesPerTurn: envInt(env, 'PLATFORM_WA_MASTER_MAX_REPLIES', 2),
    profileTtlMs: envInt(env, 'PLATFORM_WA_MASTER_PROFILE_TTL_MS', 1000 * 60 * 60 * 24 * 180),
    consumerAssistantUrl: envStr(
      env,
      'PLATFORM_WA_CONSUMER_URL',
      'https://elmenuxfa.com/asistente?ref=wa',
    ),
    businessLandingUrl: envStr(
      env,
      'PLATFORM_WA_BUSINESS_LANDING_URL',
      'https://business.elmenuxfa.com/',
    ),
    businessRegisterUrl: envStr(
      env,
      'PLATFORM_WA_BUSINESS_REGISTER_URL',
      'https://app.elmenuxfa.com/?tab=register',
    ),
    businessManageUrl: envStr(
      env,
      'PLATFORM_WA_BUSINESS_MANAGE_URL',
      'https://app.elmenuxfa.com/',
    ),
  };
}
