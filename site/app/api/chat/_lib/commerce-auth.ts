/**
 * Per-commerce chatbot authorization (server-only).
 *
 * Production requires ALL of:
 * - runtime gates (CHATBOT_ENABLED, ALLOW_PRODUCTION, postgres, GEMINI_API_KEY)
 * - commerce UUID in CHATBOT_ALLOWED_COMMERCE_IDS
 * - comercios.chatbot_enabled = true (fresh DB read, no cache)
 * - quota reserve succeeds
 *
 * Slug / URL / query params never bypass these checks — only the server-resolved UUID.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ChatbotConfig } from './config';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Sole commerce allowed for LOCAL offline chatbot smoke (Pizzas El Trueno).
 * Never honored in production. Does not enable orders/checkout.
 */
export const LOCAL_OFFLINE_CHATBOT_COMMERCE_ID =
  '0aa8c53b-07f1-446e-8b88-66c2b7ae89ea';
export const LOCAL_OFFLINE_CHATBOT_SLUG = 'pizzas-el-trueno';

/**
 * Local-only: allow Gemini chat against an offline commerce catalog snapshot.
 *
 * Requires ALL of:
 * - NODE_ENV !== production
 * - CHATBOT_ALLOW_OFFLINE_LOCAL=1
 * - commerce UUID === Pizzas El Trueno only
 *
 * Never enables pedidos/pagos/carrito. Production always returns false.
 */
export function allowsLocalOfflineChatbotCommerce(params: {
  commerceId: string;
  nodeEnv?: string | null;
  allowOfflineLocalFlag?: string | null;
}): boolean {
  const nodeEnv = (params.nodeEnv ?? process.env.NODE_ENV ?? '')
    .trim()
    .toLowerCase();
  if (nodeEnv === 'production') return false;

  const flag = (
    params.allowOfflineLocalFlag ??
    process.env.CHATBOT_ALLOW_OFFLINE_LOCAL ??
    ''
  )
    .trim()
    .toLowerCase();
  if (flag !== '1' && flag !== 'true') return false;

  const id = params.commerceId.trim().toLowerCase();
  return id === LOCAL_OFFLINE_CHATBOT_COMMERCE_ID;
}

export class CommerceAccessError extends Error {
  status: number;
  code: string;
  constructor(message: string, status: number, code: string) {
    super(message);
    this.name = 'CommerceAccessError';
    this.status = status;
    this.code = code;
  }
}

/** Parse CHATBOT_ALLOWED_COMMERCE_IDS (comma/space/semicolon separated). Invalid tokens ignored. */
export function parseAllowedCommerceIds(
  raw: string | null | undefined,
): Set<string> {
  const out = new Set<string>();
  const text = (raw ?? '').trim();
  if (!text) return out;
  for (const part of text.split(/[,;\s]+/)) {
    const id = part.trim().toLowerCase();
    if (!id) continue;
    if (UUID_RE.test(id)) out.add(id);
  }
  return out;
}

export function isCommerceOnAllowlist(
  allowedIds: ReadonlySet<string>,
  commerceId: string,
): boolean {
  const id = commerceId.trim().toLowerCase();
  if (!UUID_RE.test(id)) return false;
  return allowedIds.has(id);
}

/**
 * Fail-closed allowlist rule:
 * - production: empty allowlist → deny all; otherwise must include commerceId
 * - non-production: empty allowlist → allow (local smoke); if set → must include
 */
export function assertCommerceAllowlist(params: {
  allowedIds: ReadonlySet<string>;
  commerceId: string;
  nodeEnv?: string | null;
}): void {
  const nodeEnv = (params.nodeEnv ?? process.env.NODE_ENV ?? '').toLowerCase();
  const isProd = nodeEnv === 'production';
  if (params.allowedIds.size === 0) {
    if (isProd) {
      throw new CommerceAccessError(
        'Chatbot allowlist empty in production',
        403,
        'commerce_allowlist_empty',
      );
    }
    return;
  }
  if (!isCommerceOnAllowlist(params.allowedIds, params.commerceId)) {
    throw new CommerceAccessError(
      'Commerce not on chatbot allowlist',
      403,
      'commerce_not_allowlisted',
    );
  }
}

/**
 * Fresh DB read of comercios.chatbot_enabled — no in-memory cache.
 * Used as immediate kill switch without redeploy.
 */
export async function assertCommerceChatbotEnabled(params: {
  supabase: SupabaseClient;
  commerceId: string;
}): Promise<void> {
  const { data, error } = await params.supabase
    .from('comercios')
    .select('chatbot_enabled')
    .eq('id', params.commerceId)
    .maybeSingle();

  if (error) {
    // Column missing (migration not applied) → fail closed when flag is required.
    const msg = (error.message || '').toLowerCase();
    if (
      msg.includes('chatbot_enabled') ||
      msg.includes('column') ||
      msg.includes('does not exist')
    ) {
      throw new CommerceAccessError(
        'chatbot_enabled column unavailable',
        503,
        'commerce_flag_unavailable',
      );
    }
    throw new CommerceAccessError(error.message, 503, 'quota_db_error');
  }

  if (!data || (data as { chatbot_enabled?: boolean }).chatbot_enabled !== true) {
    throw new CommerceAccessError(
      'Chatbot not enabled for this restaurant',
      403,
      'commerce_chatbot_disabled',
    );
  }
}

/** Full per-commerce gate before Gemini (allowlist + optional DB flag). */
export async function assertChatbotCommerceAccess(params: {
  config: ChatbotConfig;
  commerceId: string;
  supabase: SupabaseClient | null;
  nodeEnv?: string | null;
}): Promise<void> {
  assertCommerceAllowlist({
    allowedIds: params.config.allowedCommerceIds,
    commerceId: params.commerceId,
    nodeEnv: params.nodeEnv,
  });

  if (!params.config.requireCommerceFlag) return;

  if (!params.supabase) {
    throw new CommerceAccessError(
      'Commerce flag requires postgres client',
      503,
      'quota_unavailable',
    );
  }

  await assertCommerceChatbotEnabled({
    supabase: params.supabase,
    commerceId: params.commerceId,
  });
}
