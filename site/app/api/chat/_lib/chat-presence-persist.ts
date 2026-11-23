import { getServiceSupabaseClient } from '../../_lib/supabase-server';
import {
  type ChatPresenceParty,
  getChatPresence,
  mergePresenceFromDbRow,
  touchChatRead,
  touchChatTyping,
} from './chat-presence';
import {
  isSupervisionMemoryEnabled,
  memoryGetConversation,
  memoryListMessages,
} from './supervision-memory';
import { publishConversationEvent } from './supervision';

const TYPING_TTL_MS = 3500;

export async function applyConversationPresence(input: {
  conversationId: string;
  comercioId: string;
  party: ChatPresenceParty;
  typing?: boolean;
  readUpToSeq?: number;
}) {
  let state = getChatPresence(input.conversationId);
  if (typeof input.typing === 'boolean') {
    state = touchChatTyping(
      input.conversationId,
      input.party,
      input.typing,
      TYPING_TTL_MS,
    );
  }
  if (
    typeof input.readUpToSeq === 'number' &&
    Number.isFinite(input.readUpToSeq)
  ) {
    state = touchChatRead(
      input.conversationId,
      input.party,
      input.readUpToSeq,
    );
  }

  // Persist when columns exist; otherwise in-memory + broadcast still work.
  if (!isSupervisionMemoryEnabled()) {
    try {
      const sb = getServiceSupabaseClient();
      const patch: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };
      if (typeof input.typing === 'boolean') {
        const until = input.typing
          ? new Date(Date.now() + TYPING_TTL_MS).toISOString()
          : null;
        if (input.party === 'consumer') patch.consumer_typing_until = until;
        else patch.staff_typing_until = until;
      }
      if (
        typeof input.readUpToSeq === 'number' &&
        Number.isFinite(input.readUpToSeq)
      ) {
        if (input.party === 'consumer') {
          patch.consumer_last_read_seq = state.consumerLastReadSeq;
        } else {
          patch.staff_last_read_seq = state.staffLastReadSeq;
        }
      }
      await sb
        .from('chat_conversations')
        .update(patch)
        .eq('id', input.conversationId)
        .eq('comercio_id', input.comercioId);
    } catch {
      /* columns may be missing — non-fatal */
    }
  }

  void publishConversationEvent(input.comercioId, input.conversationId, {
    type: 'presence',
    party: input.party,
    typing: typeof input.typing === 'boolean' ? input.typing : undefined,
    readUpToSeq:
      typeof input.readUpToSeq === 'number' ? input.readUpToSeq : undefined,
    consumerLastReadSeq: state.consumerLastReadSeq,
    staffLastReadSeq: state.staffLastReadSeq,
  });

  return state;
}

export async function loadConversationPresence(input: {
  conversationId: string;
  comercioId: string;
}) {
  if (isSupervisionMemoryEnabled()) {
    return getChatPresence(input.conversationId);
  }
  try {
    const sb = getServiceSupabaseClient();
    const { data } = await sb
      .from('chat_conversations')
      .select(
        'consumer_typing_until,staff_typing_until,consumer_last_read_seq,staff_last_read_seq',
      )
      .eq('id', input.conversationId)
      .eq('comercio_id', input.comercioId)
      .maybeSingle();
    return mergePresenceFromDbRow(input.conversationId, data);
  } catch {
    return getChatPresence(input.conversationId);
  }
}

export async function applyMessageReaction(input: {
  conversationId: string;
  comercioId: string;
  messageId: string;
  party: 'consumer' | 'staff' | 'assistant';
  emoji: string;
}) {
  const emoji = input.emoji.trim().slice(0, 8);
  if (!emoji) return { ok: false as const, error: 'empty_emoji' };

  if (isSupervisionMemoryEnabled()) {
    const conv = memoryGetConversation(input.conversationId);
    if (!conv || conv.comercio_id !== input.comercioId) {
      return { ok: false as const, error: 'not_found' };
    }
    const rows = memoryListMessages(input.conversationId, 0);
    const msg = rows.find((m) => m.id === input.messageId);
    if (!msg) return { ok: false as const, error: 'message_not_found' };
    const prev = Array.isArray(msg.payload?.reactions)
      ? (msg.payload.reactions as Array<Record<string, unknown>>)
      : [];
    const without = prev.filter((r) => r.party !== input.party);
    const existing = prev.find(
      (r) => r.party === input.party && r.emoji === emoji,
    );
    const next = existing
      ? without
      : [...without, { emoji, party: input.party, at: Date.now() }];
    msg.payload = { ...msg.payload, reactions: next };
    void publishConversationEvent(input.comercioId, input.conversationId, {
      type: 'reaction',
      messageId: input.messageId,
      reactions: next,
    });
    return { ok: true as const, reactions: next };
  }

  try {
    const sb = getServiceSupabaseClient();
    const { data: row, error } = await sb
      .from('chat_messages')
      .select('id,payload')
      .eq('id', input.messageId)
      .eq('conversation_id', input.conversationId)
      .eq('comercio_id', input.comercioId)
      .maybeSingle();
    if (error || !row) {
      return { ok: false as const, error: 'message_not_found' };
    }
    const payload =
      row.payload && typeof row.payload === 'object' && !Array.isArray(row.payload)
        ? (row.payload as Record<string, unknown>)
        : {};
    const prev = Array.isArray(payload.reactions)
      ? (payload.reactions as Array<Record<string, unknown>>)
      : [];
    const without = prev.filter((r) => r.party !== input.party);
    const existing = prev.find(
      (r) => r.party === input.party && r.emoji === emoji,
    );
    const next = existing
      ? without
      : [...without, { emoji, party: input.party, at: Date.now() }];
    const { error: upErr } = await sb
      .from('chat_messages')
      .update({ payload: { ...payload, reactions: next } })
      .eq('id', input.messageId)
      .eq('conversation_id', input.conversationId);
    if (upErr) return { ok: false as const, error: 'update_failed' };
    void publishConversationEvent(input.comercioId, input.conversationId, {
      type: 'reaction',
      messageId: input.messageId,
      reactions: next,
    });
    return { ok: true as const, reactions: next };
  } catch {
    return { ok: false as const, error: 'update_failed' };
  }
}
