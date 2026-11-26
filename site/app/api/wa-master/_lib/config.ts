/**
 * Master Assistant flags — fail closed. Default OFF so production wa-entry
 * router stays unchanged until explicit activation review.
 */

export type WaMasterConfig = {
  enabled: boolean;
  /** Shadow: run orchestrator but caller must not send replies. */
  shadowMode: boolean;
  allowGemini: boolean;
  /** Simulate NLU/tools path without Google HTTP (default true when Gemini off). */
  simulateAgent: boolean;
  /**
   * Receptionist mode: opaque handoffs available as helpers (not the default path).
   * Resolve in WhatsApp with DB/tools first; hand off only when needed.
   */
  receptionistMode: boolean;
  /** Optional Gemini TTS voice notes (Wasender audio). Fail-closed. */
  voiceNotesEnabled: boolean;
  /**
   * Central brain: natural-language topic router (guide A–D) that replaces numbered
   * smart menus. Falls back to the legacy specialist chain when it cannot decide.
   */
  brainEnabled: boolean;
  /** Owner personal line for last-resort escalate (digits only). */
  ownerEscalateDigits: string;
  maxTurnsInPrompt: number;
  maxRepliesPerTurn: number;
  maxMonthlyGeminiRequests: number;
  /** Hard cap of billable Gemini HTTP calls per Master turn (incl. retries). */
  maxGeminiHttpPerTurn: number;
  profileTtlMs: number;
  memoryDataDir: string;
  consumerAssistantUrl: string;
  businessLandingUrl: string;
  businessRegisterUrl: string;
  businessManageUrl: string;
  /** Next-hosted business assistant (Preview path). Flutter app host redirects later. */
  businessAssistantUrl: string;
  /** Public site origin for commerce chatbot handoff URLs (/v/{slug}?chatbot=1). */
  publicSiteUrl: string;
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
    simulateAgent: envBool(env, 'PLATFORM_WA_MASTER_SIMULATE', true),
    receptionistMode: envBool(env, 'PLATFORM_WA_MASTER_RECEPTIONIST', false),
    voiceNotesEnabled: envBool(env, 'PLATFORM_WA_MASTER_VOICE', false),
    brainEnabled: envBool(env, 'PLATFORM_WA_MASTER_BRAIN', false),
    ownerEscalateDigits: envStr(env, 'PLATFORM_WA_MASTER_OWNER_DIGITS', '584140821633').replace(
      /\D/g,
      '',
    ),
    maxTurnsInPrompt: envInt(env, 'PLATFORM_WA_MASTER_MAX_TURNS', 12),
    maxRepliesPerTurn: envInt(env, 'PLATFORM_WA_MASTER_MAX_REPLIES', 2),
    maxMonthlyGeminiRequests: envInt(env, 'PLATFORM_WA_MASTER_MAX_MONTHLY_REQUESTS', 200),
    maxGeminiHttpPerTurn: envInt(env, 'PLATFORM_WA_MASTER_MAX_GEMINI_HTTP_PER_TURN', 2),
    profileTtlMs: envInt(env, 'PLATFORM_WA_MASTER_PROFILE_TTL_MS', 1000 * 60 * 60 * 24 * 180),
    memoryDataDir: envStr(env, 'PLATFORM_WA_MASTER_MEMORY_DIR', '.wa-master-local'),
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
    businessAssistantUrl: envStr(
      env,
      'PLATFORM_WA_BUSINESS_ASSISTANT_URL',
      'https://app.elmenuxfa.com/asistente',
    ),
    publicSiteUrl: envStr(env, 'NEXT_PUBLIC_SITE_URL', 'https://elmenuxfa.com'),
  };
}
