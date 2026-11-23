'use client';

import { useEffect } from 'react';

import { commerceChatChannelName } from '../../_lib/chat-supervision-realtime';
import { getBrowserSupabase } from '../../_lib/supabase-browser';

export { commerceChatChannelName };

/**
 * Merchant conversation delivery:
 * 1) postgres_changes INSERT on chat_messages (needs Realtime publication + RLS)
 * 2) Broadcast hint on commerce chat channel → caller refetches via authorized REST
 *
 * Payload never carries message bodies — DB + REST remain source of truth.
 */
export function useConversationRealtime(
  conversationId: string | null,
  comercioId: string | null,
  onInsert: (row: {
    id: string;
    seq: number;
    role: string;
    body: string;
    created_at: string;
    payload?: Record<string, unknown> | null;
  }) => void,
  onBroadcastHint?: (hint?: Record<string, unknown>) => void,
) {
  useEffect(() => {
    if (!conversationId) return;
    const sb = getBrowserSupabase();
    if (!sb) return;

    const upsertRow = (row: {
      id?: string;
      seq?: number;
      role?: string;
      body?: string;
      created_at?: string;
      payload?: Record<string, unknown> | null;
    }) => {
      if (!row?.id) return;
      onInsert({
        id: String(row.id),
        seq: Number(row.seq || 0),
        role: String(row.role || ''),
        body: String(row.body || ''),
        created_at: String(row.created_at || new Date().toISOString()),
        payload:
          row.payload && typeof row.payload === 'object' ? row.payload : {},
      });
    };

    const channel = sb
      .channel(`chat_messages:${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => upsertRow(payload.new as Parameters<typeof upsertRow>[0]),
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'chat_messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => upsertRow(payload.new as Parameters<typeof upsertRow>[0]),
      )
      .subscribe();

    return () => {
      void sb.removeChannel(channel);
    };
  }, [conversationId, onInsert]);

  useEffect(() => {
    if (!conversationId || !comercioId?.trim() || !onBroadcastHint) return;
    const sb = getBrowserSupabase();
    if (!sb) return;

    const channel = sb
      .channel(commerceChatChannelName(comercioId.trim()))
      .on('broadcast', { event: 'chat' }, (msg) => {
        const payload = (msg?.payload || {}) as Record<string, unknown> & {
          conversationId?: string;
        };
        if (
          payload.conversationId &&
          payload.conversationId !== conversationId
        ) {
          return;
        }
        onBroadcastHint(payload);
      })
      .subscribe();

    return () => {
      void sb.removeChannel(channel);
    };
  }, [conversationId, comercioId, onBroadcastHint]);
}
