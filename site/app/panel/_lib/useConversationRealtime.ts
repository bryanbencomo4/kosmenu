'use client';

import { useEffect } from 'react';

import { getBrowserSupabase } from '../../_lib/supabase-browser';

/**
 * Subscribe to chat_messages inserts for one conversation (postgres_changes).
 * Requires migration applied + table in supabase_realtime publication + RLS.
 * Falls back silently if Realtime unavailable — callers should still recover via REST.
 */
export function useConversationRealtime(
  conversationId: string | null,
  onInsert: (row: {
    id: string;
    seq: number;
    role: string;
    body: string;
    created_at: string;
  }) => void,
) {
  useEffect(() => {
    if (!conversationId) return;
    const sb = getBrowserSupabase();
    if (!sb) return;

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
        (payload) => {
          const row = payload.new as {
            id?: string;
            seq?: number;
            role?: string;
            body?: string;
            created_at?: string;
          };
          if (!row?.id) return;
          onInsert({
            id: String(row.id),
            seq: Number(row.seq || 0),
            role: String(row.role || ''),
            body: String(row.body || ''),
            created_at: String(row.created_at || new Date().toISOString()),
          });
        },
      )
      .subscribe();

    return () => {
      void sb.removeChannel(channel);
    };
  }, [conversationId, onInsert]);
}
