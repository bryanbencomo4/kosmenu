/**
 * Wa-entry feature flags — fail closed.
 * Production must keep PLATFORM_WA_INBOUND / PLATFORM_WA_ROUTER off until
 * an explicit activation review. Local sim never needs real WaSender keys.
 */

import type { WaInteractiveMode } from './interactive';

export type WaEntryAdapterKind = 'sim' | 'preview_isolated' | 'wasender';
export type WaEntryStoreKind = 'memory' | 'file' | 'supabase_preview' | 'supabase';

export type WaEntryConfig = {
  inboundEnabled: boolean;
  routerEnabled: boolean;
  /**
   * Interactive menu modality. Default `text` (numbered menus).
   * `poll` = documented WaSender single-select polls (local / gated).
   * Native reply buttons / lists are not documented on WaSender — never invent them.
   */
  interactiveMode: WaInteractiveMode;
  /**
   * When true AND interactiveMode=poll, prepared Wasender sender may attempt
   * real poll payloads. Default false — text fallback only. Do not enable in
   * production without explicit authorization (Edge queue + poll.results webhook).
   */
  pollSendEnabled: boolean;
  /**
   * Master Assistant orchestrator. Default false — production keeps the
   * deterministic router. Never enable on +584220451906 without GO review.
   */
  masterAssistantEnabled: boolean;
  /** Run Master path but caller should suppress outbound (shadow). */
  masterAssistantShadow: boolean;
  /**
   * When Master is on and allowlist empty: if true, all contacts get Master.
   * Default false (fail-closed). Requires explicit PLATFORM_WA_MASTER_PUBLIC=1.
   */
  masterPublic: boolean;
  /**
   * Pilot gate: Master only for these digits when Master is enabled.
   * Fail-closed: empty list ⇒ nobody receives Master (classic router for all),
   * unless masterPublic.
   */
  masterAllowlistDigits: string[];
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
  /** Production Supabase URL override (defaults to NEXT_PUBLIC_SUPABASE_URL). */
  prodSupabaseUrl: string;
  /** Production service-role override (defaults to SUPABASE_SERVICE_ROLE_KEY). */
  prodServiceRoleKey: string;
  prodProjectRef: string;
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
  if (storeRaw === 'supabase' || storeRaw === 'supabase_prod' || storeRaw === 'prod') {
    storeKind = 'supabase';
  }

  // Isolated Preview path defaults store to supabase_preview when adapter says so.
  if (adapter === 'preview_isolated' && storeRaw === 'file') {
    storeKind = 'supabase_preview';
  }

  const interactiveRaw = envStr(env, 'PLATFORM_WA_INTERACTIVE_MODE', 'text').toLowerCase();
  const interactiveMode: WaInteractiveMode = interactiveRaw === 'poll' ? 'poll' : 'text';

  return {
    inboundEnabled: envBool(env, 'PLATFORM_WA_INBOUND', false),
    routerEnabled: envBool(env, 'PLATFORM_WA_ROUTER', false),
    interactiveMode,
    pollSendEnabled: envBool(env, 'PLATFORM_WA_POLL_SEND', false),
    masterAssistantEnabled: envBool(env, 'PLATFORM_WA_MASTER', false),
    masterAssistantShadow: envBool(env, 'PLATFORM_WA_MASTER_SHADOW', false),
    /** When true + Master on + empty allowlist → all contacts (still fail-closed default). */
    masterPublic: envBool(env, 'PLATFORM_WA_MASTER_PUBLIC', false),
    masterAllowlistDigits: parseAllowlist(
      envStr(env, 'PLATFORM_WA_MASTER_ALLOWLIST_DIGITS', ''),
    ),
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
    prodSupabaseUrl: envStr(env, 'PLATFORM_WA_PROD_SUPABASE_URL', ''),
    prodServiceRoleKey: envStr(env, 'PLATFORM_WA_PROD_SERVICE_ROLE_KEY', ''),
    prodProjectRef: envStr(env, 'PLATFORM_WA_PROD_PROJECT_REF', WA_ENTRY_PROD_PROJECT_REF),
  };
}

export function assertSafeLocalConfig(config: WaEntryConfig, env: NodeJS.ProcessEnv = process.env) {
  // Passiveive reception (inbound on, router off) may use adapter=wasender with
  // ALLOW_REAL=0; runtime installs a refusing sender until real sends are armed.
  if (config.adapter === 'wasender' && config.routerEnabled) {
    if (!config.allowRealWasender) {
      throw new Error(
        'wa_entry_refused: wasender adapter requires PLATFORM_WA_ALLOW_REAL_WASENDER=1 when router is on',
      );
    }
    // Public controlled open: empty allowlist is allowed only when enforcement is off.
    // Fail-closed: if ENFORCE_ALLOWLIST=1, digits are mandatory.
    if (config.enforceAllowlist && config.allowlistDigits.length === 0) {
      throw new Error(
        'wa_entry_refused: wasender adapter requires PLATFORM_WA_ALLOWLIST_DIGITS when ENFORCE_ALLOWLIST=1',
      );
    }
  }

  if (config.storeKind === 'supabase_preview') {
    // Wa-entry writes use PLATFORM_WA_PREVIEW_* only. The host app may still
    // have NEXT_PUBLIC_SUPABASE_URL=production for public read surfaces on a
    // Preview deploy; that is allowed as long as Preview target asserts pass.
    assertPreviewSupabaseTarget(config);
  }

  if (config.storeKind === 'supabase') {
    assertProdSupabaseTarget(config);
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

export function assertProdSupabaseTarget(
  config: WaEntryConfig,
  env: NodeJS.ProcessEnv = process.env,
) {
  const ref = config.prodProjectRef || WA_ENTRY_PROD_PROJECT_REF;
  if (ref === WA_ENTRY_PREVIEW_PROJECT_REF) {
    throw new Error('wa_entry_refused: production store cannot target Preview ref');
  }
  if (ref !== WA_ENTRY_PROD_PROJECT_REF) {
    throw new Error(`wa_entry_refused: unexpected production project ref ${ref}`);
  }

  const url = (config.prodSupabaseUrl || env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
  const key = (config.prodServiceRoleKey || env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!url || !key) {
    throw new Error(
      'wa_entry_refused: production Supabase URL and SUPABASE_SERVICE_ROLE_KEY required',
    );
  }
  if (url.includes(WA_ENTRY_PREVIEW_PROJECT_REF)) {
    throw new Error('wa_entry_refused: production store URL points at Preview');
  }
  if (!url.includes(WA_ENTRY_PROD_PROJECT_REF)) {
    throw new Error(
      `wa_entry_refused: production URL does not contain expected ref ${WA_ENTRY_PROD_PROJECT_REF}`,
    );
  }
}

export function isAllowlisted(config: WaEntryConfig, fromDigits: string): boolean {
  // Enforcement off + empty list = public inbound (any sender).
  if (!config.enforceAllowlist && config.allowlistDigits.length === 0) return true;
  if (!config.enforceAllowlist && config.adapter === 'sim') return true;
  if (config.allowlistDigits.length === 0) {
    // Enforcing with empty list: refuse everyone (fail-closed).
    return false;
  }
  return config.allowlistDigits.includes(fromDigits);
}

/**
 * Master pilot gate — independent from PLATFORM_WA_ALLOWLIST_DIGITS.
 * Fail-closed: Master enabled + empty master allowlist ⇒ no Master for anyone,
 * unless PLATFORM_WA_MASTER_PUBLIC=1 (explicit public open).
 */
export function isMasterPilotAllowlisted(config: WaEntryConfig, fromDigits: string): boolean {
  if (!config.masterAssistantEnabled) return false;
  if (config.masterAllowlistDigits.length === 0) {
    return Boolean(config.masterPublic);
  }
  const digits = (fromDigits || '').replace(/\D/g, '');
  return config.masterAllowlistDigits.includes(digits);
}
