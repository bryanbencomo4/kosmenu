/**
 * Wa-entry feature flags — fail closed.
 * Production must keep PLATFORM_WA_INBOUND / PLATFORM_WA_ROUTER off until
 * an explicit activation review. Local sim never needs real WaSender keys.
 */

export type WaEntryAdapterKind = 'sim' | 'preview_isolated' | 'wasender';
export type WaEntryStoreKind = 'memory' | 'file' | 'supabase_preview';

export type WaEntryConfig = {
  inboundEnabled: boolean;
  routerEnabled: boolean;
  adapter: WaEntryAdapterKind;
  storeKind: WaEntryStoreKind;
  webhookSecret: string;
  /** Absolute or relative path for local JSONL/state (file store). */
  localDataDir: string;
  threadTtlMs: number;
  humanPauseMs: number;
  maxRepliesPerHour: number;
  /** Window to treat fromMe text as our own bot echo. */
  echoWindowMs: number;
  /** Max inbound JSON body bytes. */
  maxBodyBytes: number;
  /** Soft per-IP webhook accepts per minute (process-local). */
  webhookRatePerMinute: number;
  consumerAssistantUrl: string;
  businessLandingUrl: string;
  businessRegisterUrl: string;
  businessManageUrl: string;
  allowRealWasender: boolean;
  /** Digits-only allowlist; empty = no real sends / no real inbound replies when enforced. */
  allowlistDigits: string[];
  /** When true, allowlist is enforced even for sim replies (tests). */
  enforceAllowlist: boolean;
  /** Preview-only Supabase URL (must contain Preview project ref). */
  previewSupabaseUrl: string;
  previewServiceRoleKey: string;
  previewProjectRef: string;
};

export const WA_ENTRY_PREVIEW_PROJECT_REF = 'gsfxqzvmyzjjgpigrste';
export const WA_ENTRY_PROD_PROJECT_REF = 'qqhberaayhohxlbbhdyi';

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

function parseAllowlist(raw: string): string[] {
  return raw
    .split(/[,\s]+/)
    .map((p) => p.replace(/\D/g, ''))
    .filter(Boolean);
}

export function loadWaEntryConfig(env: NodeJS.ProcessEnv = process.env): WaEntryConfig {
  const adapterRaw = envStr(env, 'PLATFORM_WA_ADAPTER', 'sim').toLowerCase();
  let adapter: WaEntryAdapterKind = 'sim';
  if (adapterRaw === 'wasender') adapter = 'wasender';
  if (adapterRaw === 'preview_isolated' || adapterRaw === 'preview') adapter = 'preview_isolated';

  const storeRaw = envStr(env, 'PLATFORM_WA_STORE', 'file').toLowerCase();
  let storeKind: WaEntryStoreKind = 'file';
  if (storeRaw === 'memory') storeKind = 'memory';
  if (storeRaw === 'supabase_preview' || storeRaw === 'preview') storeKind = 'supabase_preview';

  // Isolated Preview path defaults store to supabase_preview when adapter says so.
  if (adapter === 'preview_isolated' && storeRaw === 'file') {
    storeKind = 'supabase_preview';
  }

  return {
    inboundEnabled: envBool(env, 'PLATFORM_WA_INBOUND', false),
    routerEnabled: envBool(env, 'PLATFORM_WA_ROUTER', false),
    adapter,
    storeKind,
    webhookSecret: envStr(env, 'PLATFORM_WA_WEBHOOK_SECRET', ''),
    localDataDir: envStr(env, 'PLATFORM_WA_LOCAL_DIR', '.wa-entry-local'),
    threadTtlMs: envInt(env, 'PLATFORM_WA_THREAD_TTL_MS', 1000 * 60 * 60 * 24),
    humanPauseMs: envInt(env, 'PLATFORM_WA_HUMAN_PAUSE_MS', 1000 * 60 * 30),
    maxRepliesPerHour: envInt(env, 'PLATFORM_WA_MAX_REPLIES_PER_HOUR', 20),
    echoWindowMs: envInt(env, 'PLATFORM_WA_ECHO_WINDOW_MS', 1000 * 60 * 5),
    maxBodyBytes: envInt(env, 'PLATFORM_WA_MAX_BODY_BYTES', 64 * 1024),
    webhookRatePerMinute: envInt(env, 'PLATFORM_WA_WEBHOOK_RATE_PER_MINUTE', 120),
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
    allowlistDigits: parseAllowlist(envStr(env, 'PLATFORM_WA_ALLOWLIST_DIGITS', '')),
    enforceAllowlist: envBool(env, 'PLATFORM_WA_ENFORCE_ALLOWLIST', false),
    previewSupabaseUrl: envStr(env, 'PLATFORM_WA_PREVIEW_SUPABASE_URL', ''),
    previewServiceRoleKey: envStr(env, 'PLATFORM_WA_PREVIEW_SERVICE_ROLE_KEY', ''),
    previewProjectRef: envStr(env, 'PLATFORM_WA_PREVIEW_PROJECT_REF', WA_ENTRY_PREVIEW_PROJECT_REF),
  };
}

export function assertSafeLocalConfig(config: WaEntryConfig, env: NodeJS.ProcessEnv = process.env) {
  if (config.adapter === 'wasender') {
    if (!config.allowRealWasender) {
      throw new Error(
        'wa_entry_refused: wasender adapter requires PLATFORM_WA_ALLOW_REAL_WASENDER=1',
      );
    }
    if (config.allowlistDigits.length === 0) {
      throw new Error(
        'wa_entry_refused: wasender adapter requires PLATFORM_WA_ALLOWLIST_DIGITS',
      );
    }
  }

  if (config.storeKind === 'supabase_preview') {
    // Wa-entry writes use PLATFORM_WA_PREVIEW_* only. The host app may still
    // have NEXT_PUBLIC_SUPABASE_URL=production for public read surfaces on a
    // Preview deploy; that is allowed as long as Preview target asserts pass.
    assertPreviewSupabaseTarget(config);
  }
}

export function assertPreviewSupabaseTarget(config: WaEntryConfig) {
  const ref = config.previewProjectRef || WA_ENTRY_PREVIEW_PROJECT_REF;
  if (ref === WA_ENTRY_PROD_PROJECT_REF) {
    throw new Error('wa_entry_refused: Preview project ref cannot be production');
  }
  if (!config.previewSupabaseUrl || !config.previewServiceRoleKey) {
    throw new Error(
      'wa_entry_refused: PLATFORM_WA_PREVIEW_SUPABASE_URL and PLATFORM_WA_PREVIEW_SERVICE_ROLE_KEY required',
    );
  }
  if (config.previewSupabaseUrl.includes(WA_ENTRY_PROD_PROJECT_REF)) {
    throw new Error('wa_entry_refused: Preview URL points at production project');
  }
  if (!config.previewSupabaseUrl.includes(ref)) {
    throw new Error(
      `wa_entry_refused: Preview URL does not contain expected ref ${ref}`,
    );
  }
}

export function isAllowlisted(config: WaEntryConfig, fromDigits: string): boolean {
  if (!config.enforceAllowlist && config.adapter === 'sim') return true;
  if (config.allowlistDigits.length === 0) {
    // Empty allowlist: sim may reply; real wasender already refused at assert.
    return config.adapter === 'sim' && !config.enforceAllowlist;
  }
  return config.allowlistDigits.includes(fromDigits);
}
