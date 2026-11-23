/**
 * Wa-entry feature flags — fail closed.
 * Production must keep PLATFORM_WA_INBOUND / PLATFORM_WA_ROUTER off until
 * an explicit activation review. Local sim never needs real WaSender keys.
 */

export type WaEntryAdapterKind = 'sim' | 'wasender';

export type WaEntryConfig = {
  inboundEnabled: boolean;
  routerEnabled: boolean;
  adapter: WaEntryAdapterKind;
  webhookSecret: string;
  /** Absolute or relative path for local JSONL/state (sim only). */
  localDataDir: string;
  threadTtlMs: number;
  humanPauseMs: number;
  maxRepliesPerHour: number;
  consumerAssistantUrl: string;
  businessLandingUrl: string;
  businessRegisterUrl: string;
  businessManageUrl: string;
  allowRealWasender: boolean;
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

export function loadWaEntryConfig(env: NodeJS.ProcessEnv = process.env): WaEntryConfig {
  const adapterRaw = envStr(env, 'PLATFORM_WA_ADAPTER', 'sim').toLowerCase();
  const adapter: WaEntryAdapterKind = adapterRaw === 'wasender' ? 'wasender' : 'sim';

  return {
    inboundEnabled: envBool(env, 'PLATFORM_WA_INBOUND', false),
    routerEnabled: envBool(env, 'PLATFORM_WA_ROUTER', false),
    adapter,
    webhookSecret: envStr(env, 'PLATFORM_WA_WEBHOOK_SECRET', ''),
    localDataDir: envStr(env, 'PLATFORM_WA_LOCAL_DIR', '.wa-entry-local'),
    threadTtlMs: envInt(env, 'PLATFORM_WA_THREAD_TTL_MS', 1000 * 60 * 60 * 24),
    humanPauseMs: envInt(env, 'PLATFORM_WA_HUMAN_PAUSE_MS', 1000 * 60 * 30),
    maxRepliesPerHour: envInt(env, 'PLATFORM_WA_MAX_REPLIES_PER_HOUR', 20),
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
    allowRealWasender: envBool(env, 'PLATFORM_WA_ALLOW_REAL_WASENDER', false),
  };
}

export function assertSafeLocalConfig(config: WaEntryConfig, env: NodeJS.ProcessEnv = process.env) {
  if (config.adapter === 'sim') return;

  if (!config.allowRealWasender) {
    throw new Error(
      'wa_entry_refused: wasender adapter requires PLATFORM_WA_ALLOW_REAL_WASENDER=1',
    );
  }

  // Hard stop: never use prod service role from Next .env.local for this module.
  const serviceRole = (env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
  if (serviceRole && !envBool(env, 'PLATFORM_WA_ALLOW_PROD_SERVICE_ROLE', false)) {
    throw new Error(
      'wa_entry_refused: SUPABASE_SERVICE_ROLE_KEY present without PLATFORM_WA_ALLOW_PROD_SERVICE_ROLE',
    );
  }
}
