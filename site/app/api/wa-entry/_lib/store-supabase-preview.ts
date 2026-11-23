import { createClient } from '@supabase/supabase-js';

import {
  WA_ENTRY_PREVIEW_PROJECT_REF,
  WA_ENTRY_PROD_PROJECT_REF,
  type WaEntryConfig,
  assertPreviewSupabaseTarget,
} from './config';
import { hashOutboundText, type WaOutboundRecord, type WaThreadRecord } from './contract';
import type { WaEntryAsyncStore } from './store-async';

/**
 * Shared atomic store for Supabase Preview only.
 * Uses tables/RPCs from preview-bootstrap/12-wa-entry-router.sql.
 * Never targets production project ref.
 */
export function createSupabasePreviewAsyncStore(config: WaEntryConfig): WaEntryAsyncStore {
  assertPreviewSupabaseTarget(config);

  const client = createClient(config.previewSupabaseUrl, config.previewServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return {
    async getThread(fromDigits) {
      const { data, error } = await client
        .from('wa_entry_threads')
        .select('*')
        .eq('from_digits', fromDigits)
        .maybeSingle();
      if (error) throw new Error(`wa_entry_preview getThread: ${error.message}`);
      if (!data) return null;
      return rowToThread(data as Record<string, unknown>);
    },

    async saveThread(thread) {
      const { error } = await client.from('wa_entry_threads').upsert(
        {
          from_digits: thread.fromDigits,
          state: thread.state,
          updated_at_ms: thread.updatedAtMs,
          expires_at_ms: thread.expiresAtMs,
          human_paused_until_ms: thread.humanPausedUntilMs,
          replies_last_hour: thread.repliesLastHour,
          last_outbound_dedupe_key: thread.lastOutboundDedupeKey,
        },
        { onConflict: 'from_digits' },
      );
      if (error) throw new Error(`wa_entry_preview saveThread: ${error.message}`);
    },

    async tryClaimMessage(messageId, sessionId = 'unknown') {
      const { data, error } = await client.rpc('wa_entry_try_claim_message', {
        p_message_id: messageId,
        p_session_id: sessionId,
      });
      if (error) throw new Error(`wa_entry_preview tryClaim: ${error.message}`);
      return data === true;
    },

    async appendOutbound(record) {
      const { error } = await client.from('wa_entry_outbound').insert({
        id: record.id,
        to_digits: record.to,
        text: record.text,
        text_hash: record.textHash || hashOutboundText(record.text),
        event_id: record.eventId,
        dedupe_key: record.dedupeKey,
        result: record.result,
        at_ms: record.atMs,
        attempt: record.attempt,
        origin: record.origin,
      });
      if (error) throw new Error(`wa_entry_preview appendOutbound: ${error.message}`);
    },

    async listOutbound(limit = 50) {
      const { data, error } = await client
        .from('wa_entry_outbound')
        .select('*')
        .order('at_ms', { ascending: false })
        .limit(limit);
      if (error) throw new Error(`wa_entry_preview listOutbound: ${error.message}`);
      return (data || []).map(rowToOutbound);
    },

    async matchBotEcho(params) {
      const { data, error } = await client.rpc('wa_entry_match_bot_echo', {
        p_to_digits: params.toDigits,
        p_text_hash: hashOutboundText(params.text),
        p_now_ms: params.nowMs,
        p_window_ms: params.windowMs,
      });
      if (error) throw new Error(`wa_entry_preview matchBotEcho: ${error.message}`);
      return data === true;
    },

    async tryAcquireSendLock(chatDigits, nowMs, ttlMs) {
      const { data, error } = await client.rpc('wa_entry_try_acquire_send_lock', {
        p_chat_digits: chatDigits,
        p_now_ms: nowMs,
        p_ttl_ms: ttlMs,
      });
      if (error) throw new Error(`wa_entry_preview sendLock: ${error.message}`);
      return data === true;
    },

    async releaseSendLock(chatDigits) {
      const { error } = await client.rpc('wa_entry_release_send_lock', {
        p_chat_digits: chatDigits,
      });
      if (error) throw new Error(`wa_entry_preview releaseLock: ${error.message}`);
    },
  };
}

function rowToThread(row: Record<string, unknown>): WaThreadRecord {
  return {
    fromDigits: String(row.from_digits),
    state: row.state as WaThreadRecord['state'],
    updatedAtMs: Number(row.updated_at_ms),
    expiresAtMs: Number(row.expires_at_ms),
    humanPausedUntilMs:
      row.human_paused_until_ms == null ? null : Number(row.human_paused_until_ms),
    repliesLastHour: Array.isArray(row.replies_last_hour)
      ? (row.replies_last_hour as number[])
      : [],
    lastOutboundDedupeKey:
      row.last_outbound_dedupe_key == null ? null : String(row.last_outbound_dedupe_key),
  };
}

function rowToOutbound(row: Record<string, unknown>): WaOutboundRecord {
  return {
    id: String(row.id),
    to: String(row.to_digits),
    text: String(row.text || ''),
    eventId: String(row.event_id || ''),
    dedupeKey: String(row.dedupe_key || ''),
    result: row.result as WaOutboundRecord['result'],
    atMs: Number(row.at_ms),
    attempt: Number(row.attempt || 1),
    origin: (row.origin as WaOutboundRecord['origin']) || 'wa_entry_bot',
    textHash: String(row.text_hash || hashOutboundText(String(row.text || ''))),
  };
}

export function assertUrlIsPreviewNotProd(url: string) {
  if (url.includes(WA_ENTRY_PROD_PROJECT_REF)) {
    throw new Error('wa_entry_refused: URL is production');
  }
  if (!url.includes(WA_ENTRY_PREVIEW_PROJECT_REF)) {
    throw new Error('wa_entry_refused: URL is not Preview');
  }
}
