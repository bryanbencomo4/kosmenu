/**
 * Opaque one-time handoff codes: WhatsApp / inbox → web assistants.
 * Never put phones/credentials in the URL. Payload is non-sensitive context only.
 * Default store: memory (tests). Supabase store for Preview/prod when table exists.
 */

import { createHash, randomBytes } from 'node:crypto';

import type { SupabaseClient } from '@supabase/supabase-js';

import {
  sanitizeConversationContext,
  type ConversationContext,
} from './conversation-context';

export const WA_HANDOFF_TTL_MS = 5 * 60 * 1000;
/** Commerce chatbot handoffs keep context a bit longer (operator → customer). */
export const WA_HANDOFF_COMMERCE_TTL_MS = 15 * 60 * 1000;
export const WA_HANDOFF_ALLOWED_DESTINATIONS = [
  'consumer_discovery',
  'business_assistant',
  'commerce_chatbot',
] as const;

export type WaHandoffDestination = (typeof WA_HANDOFF_ALLOWED_DESTINATIONS)[number];

/** Handoff payload = shared conversation context (sanitized). */
export type WaHandoffPayload = ConversationContext;

export type WaHandoffRecord = {
  code: string;
  destination: WaHandoffDestination;
  payload: WaHandoffPayload;
  fromDigitsHash: string | null;
  expiresAtMs: number;
  consumedAtMs: number | null;
  revokedAtMs: number | null;
  createdAtMs: number;
};

export type WaHandoffIssueResult = {
  code: string;
  url: string;
  expiresAtMs: number;
};

export type WaHandoffRedeemResult =
  | { ok: true; record: WaHandoffRecord }
  | {
      ok: false;
      error:
        | 'not_found'
        | 'expired'
        | 'consumed'
        | 'revoked'
        | 'destination_mismatch'
        | 'race';
    };

export interface WaHandoffStore {
  issue(input: {
    destination: WaHandoffDestination;
    payload: WaHandoffPayload;
    fromDigits?: string | null;
    ttlMs?: number;
    nowMs?: number;
  }): Promise<WaHandoffRecord>;
  /** Atomic consume — only after intentional user action. */
  redeem(input: {
    code: string;
    destination?: WaHandoffDestination;
    nowMs?: number;
  }): Promise<WaHandoffRedeemResult>;
  /** Validate without consuming (previews / page boot). */
  validate(input: {
    code: string;
    destination?: WaHandoffDestination;
    nowMs?: number;
  }): Promise<WaHandoffRedeemResult>;
  revoke(code: string, nowMs?: number): Promise<boolean>;
  peek(code: string): Promise<WaHandoffRecord | null>;
}

export function hashWaHandoffDigits(digits: string): string {
  const d = (digits || '').replace(/\D/g, '');
  return createHash('sha256').update(`wa_handoff:${d}`).digest('hex');
}

export function generateWaHandoffCode(): string {
  return randomBytes(18).toString('base64url');
}

function sanitizePayload(payload: WaHandoffPayload): WaHandoffPayload {
  return sanitizeConversationContext(payload);
}

export function buildWaHandoffUrl(params: {
  destination: WaHandoffDestination;
  code: string;
  consumerBaseUrl: string;
  businessAssistantBaseUrl: string;
  /** Public site origin for /v/{slug}?chatbot=1 (commerce handoff). */
  publicSiteBaseUrl?: string;
  slug?: string | null;
}): string {
  const code = encodeURIComponent(params.code);
  if (params.destination === 'consumer_discovery') {
    const base = params.consumerBaseUrl.includes('?')
      ? params.consumerBaseUrl.split('?')[0]
      : params.consumerBaseUrl.replace(/\/$/, '');
    // Prefer hash fragment for the opaque code so referrers/logs/previews leak less.
    return `${base}?ref=wa#h=${code}`;
  }
  if (params.destination === 'commerce_chatbot') {
    const site = (params.publicSiteBaseUrl || 'https://elmenuxfa.com').replace(
      /\/$/,
      '',
    );
    const slug = (params.slug || '').trim().replace(/^\/+|\/+$/g, '');
    if (!slug) {
      // Fail soft: still return a code-bearing URL on public root (redeem will fail closed without comercio).
      return `${site}/?chatbot=1&h=${code}`;
    }
    return `${site}/v/${encodeURIComponent(slug)}?chatbot=1&h=${code}`;
  }
  // Flutter PathUrlStrategy strips URL fragments on boot — use query for merchant app.
  const base = params.businessAssistantBaseUrl.replace(/\/$/, '');
  const join = base.includes('?') ? '&' : '?';
  return `${base}${join}h=${code}`;
}

/** Validate without consuming — safe for link-preview bots / page boots. */
export function evaluateHandoffRecord(
  cur: WaHandoffRecord | null,
  destination: WaHandoffDestination | undefined,
  nowMs: number,
): WaHandoffRedeemResult {
  if (!cur) return { ok: false, error: 'not_found' };
  if (cur.revokedAtMs != null) return { ok: false, error: 'revoked' };
  if (cur.consumedAtMs != null) return { ok: false, error: 'consumed' };
  if (cur.expiresAtMs <= nowMs) return { ok: false, error: 'expired' };
  if (destination && destination !== cur.destination) {
    return { ok: false, error: 'destination_mismatch' };
  }
  return { ok: true, record: cur };
}

export function createMemoryWaHandoffStore(): WaHandoffStore {
  const map = new Map<string, WaHandoffRecord>();
  return {
    async issue(input) {
      const nowMs = input.nowMs ?? Date.now();
      const code = generateWaHandoffCode();
      const record: WaHandoffRecord = {
        code,
        destination: input.destination,
        payload: sanitizePayload(input.payload),
        fromDigitsHash: input.fromDigits ? hashWaHandoffDigits(input.fromDigits) : null,
        expiresAtMs: nowMs + (input.ttlMs ?? WA_HANDOFF_TTL_MS),
        consumedAtMs: null,
        revokedAtMs: null,
        createdAtMs: nowMs,
      };
      map.set(code, record);
      return record;
    },
    async redeem(input) {
      const nowMs = input.nowMs ?? Date.now();
      const checked = evaluateHandoffRecord(
        map.get(input.code) ?? null,
        input.destination,
        nowMs,
      );
      if (!checked.ok) return checked;
      const next = { ...checked.record, consumedAtMs: nowMs };
      map.set(input.code, next);
      return { ok: true, record: next };
    },
    async validate(input) {
      const nowMs = input.nowMs ?? Date.now();
      return evaluateHandoffRecord(
        map.get(input.code) ?? null,
        input.destination,
        nowMs,
      );
    },
    async revoke(code, nowMs = Date.now()) {
      const cur = map.get(code);
      if (!cur) return false;
      map.set(code, { ...cur, revokedAtMs: nowMs });
      return true;
    },
    async peek(code) {
      return map.get(code) ?? null;
    },
  };
}

/**
 * Atomic redeem via RPC when available; falls back to conditional update.
 */
export function createSupabaseWaHandoffStore(client: SupabaseClient): WaHandoffStore {
  return {
    async issue(input) {
      const nowMs = input.nowMs ?? Date.now();
      const code = generateWaHandoffCode();
      const expiresAtMs = nowMs + (input.ttlMs ?? WA_HANDOFF_TTL_MS);
      const payload = sanitizePayload(input.payload);
      const row = {
        code,
        destination: input.destination,
        payload_json: payload,
        from_digits_hash: input.fromDigits ? hashWaHandoffDigits(input.fromDigits) : null,
        expires_at_ms: expiresAtMs,
        consumed_at_ms: null,
        revoked_at_ms: null,
        created_at_ms: nowMs,
      };
      const { error } = await client.from('wa_handoff_codes').insert(row);
      if (error) throw new Error(`wa_handoff_issue: ${error.message}`);
      return {
        code,
        destination: input.destination,
        payload,
        fromDigitsHash: row.from_digits_hash,
        expiresAtMs,
        consumedAtMs: null,
        revokedAtMs: null,
        createdAtMs: nowMs,
      };
    },
    async redeem(input) {
      const nowMs = input.nowMs ?? Date.now();
      const { data, error } = await client.rpc('wa_handoff_redeem', {
        p_code: input.code,
        p_destination: input.destination ?? null,
        p_now_ms: nowMs,
      });
      if (error) {
        // Fallback path without RPC
        return redeemWithUpdate(client, input.code, input.destination, nowMs);
      }
      const row = Array.isArray(data) ? data[0] : data;
      if (!row || row.ok !== true) {
        const err = (row?.error as WaHandoffRedeemResult extends { ok: false }
          ? WaHandoffRedeemResult['error']
          : string) || 'not_found';
        return { ok: false, error: err as 'not_found' };
      }
      return {
        ok: true,
        record: {
          code: String(row.code),
          destination: row.destination as WaHandoffDestination,
          payload: (row.payload_json || {}) as WaHandoffPayload,
          fromDigitsHash: row.from_digits_hash ? String(row.from_digits_hash) : null,
          expiresAtMs: Number(row.expires_at_ms),
          consumedAtMs: row.consumed_at_ms == null ? null : Number(row.consumed_at_ms),
          revokedAtMs: row.revoked_at_ms == null ? null : Number(row.revoked_at_ms),
          createdAtMs: Number(row.created_at_ms),
        },
      };
    },
    async validate(input) {
      const nowMs = input.nowMs ?? Date.now();
      const cur = await this.peek(input.code);
      return evaluateHandoffRecord(cur, input.destination, nowMs);
    },
    async revoke(code, nowMs = Date.now()) {
      const { data, error } = await client
        .from('wa_handoff_codes')
        .update({ revoked_at_ms: nowMs })
        .eq('code', code)
        .is('revoked_at_ms', null)
        .select('code')
        .maybeSingle();
      if (error) return false;
      return Boolean(data?.code);
    },
    async peek(code) {
      const { data } = await client
        .from('wa_handoff_codes')
        .select('*')
        .eq('code', code)
        .maybeSingle();
      if (!data) return null;
      return {
        code: String(data.code),
        destination: data.destination as WaHandoffDestination,
        payload: (data.payload_json || {}) as WaHandoffPayload,
        fromDigitsHash: data.from_digits_hash ? String(data.from_digits_hash) : null,
        expiresAtMs: Number(data.expires_at_ms),
        consumedAtMs: data.consumed_at_ms == null ? null : Number(data.consumed_at_ms),
        revokedAtMs: data.revoked_at_ms == null ? null : Number(data.revoked_at_ms),
        createdAtMs: Number(data.created_at_ms),
      };
    },
  };
}

async function redeemWithUpdate(
  client: SupabaseClient,
  code: string,
  destination: WaHandoffDestination | undefined,
  nowMs: number,
): Promise<WaHandoffRedeemResult> {
  const { data: cur } = await client
    .from('wa_handoff_codes')
    .select('*')
    .eq('code', code)
    .maybeSingle();
  if (!cur) return { ok: false, error: 'not_found' };
  if (cur.revoked_at_ms != null) return { ok: false, error: 'revoked' };
  if (cur.consumed_at_ms != null) return { ok: false, error: 'consumed' };
  if (Number(cur.expires_at_ms) <= nowMs) return { ok: false, error: 'expired' };
  if (destination && cur.destination !== destination) {
    return { ok: false, error: 'destination_mismatch' };
  }
  const { data: updated, error } = await client
    .from('wa_handoff_codes')
    .update({ consumed_at_ms: nowMs })
    .eq('code', code)
    .is('consumed_at_ms', null)
    .is('revoked_at_ms', null)
    .gt('expires_at_ms', nowMs)
    .select('*')
    .maybeSingle();
  if (error || !updated) return { ok: false, error: 'race' };
  return {
    ok: true,
    record: {
      code: String(updated.code),
      destination: updated.destination as WaHandoffDestination,
      payload: (updated.payload_json || {}) as WaHandoffPayload,
      fromDigitsHash: updated.from_digits_hash ? String(updated.from_digits_hash) : null,
      expiresAtMs: Number(updated.expires_at_ms),
      consumedAtMs: Number(updated.consumed_at_ms),
      revokedAtMs: null,
      createdAtMs: Number(updated.created_at_ms),
    },
  };
}

export { detectCommercialIntentFromText } from '../../_lib/commercial-intent';
