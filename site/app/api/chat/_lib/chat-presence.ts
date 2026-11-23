/**
 * Ephemeral typing + last-read state for WhatsApp-like parity.
 * Process-local fallback (dev / memory / same instance) plus optional DB columns.
 */

export type ChatPresenceParty = 'consumer' | 'staff';

export type ChatPresenceState = {
  consumerTypingUntil: number;
  staffTypingUntil: number;
  consumerLastReadSeq: number;
  staffLastReadSeq: number;
};

const g = globalThis as unknown as {
  __chatPresence?: Map<string, ChatPresenceState>;
};

function store() {
  if (!g.__chatPresence) g.__chatPresence = new Map();
  return g.__chatPresence;
}

function emptyState(): ChatPresenceState {
  return {
    consumerTypingUntil: 0,
    staffTypingUntil: 0,
    consumerLastReadSeq: 0,
    staffLastReadSeq: 0,
  };
}

export function getChatPresence(conversationId: string): ChatPresenceState {
  return store().get(conversationId) || emptyState();
}

export function touchChatTyping(
  conversationId: string,
  party: ChatPresenceParty,
  typing: boolean,
  ttlMs = 3500,
): ChatPresenceState {
  const prev = getChatPresence(conversationId);
  const next: ChatPresenceState = { ...prev };
  const until = typing ? Date.now() + ttlMs : 0;
  if (party === 'consumer') next.consumerTypingUntil = until;
  else next.staffTypingUntil = until;
  store().set(conversationId, next);
  return next;
}

export function touchChatRead(
  conversationId: string,
  party: ChatPresenceParty,
  readUpToSeq: number,
): ChatPresenceState {
  const prev = getChatPresence(conversationId);
  const next: ChatPresenceState = { ...prev };
  const seq = Math.max(0, Math.floor(readUpToSeq || 0));
  if (party === 'consumer') {
    next.consumerLastReadSeq = Math.max(prev.consumerLastReadSeq, seq);
  } else {
    next.staffLastReadSeq = Math.max(prev.staffLastReadSeq, seq);
  }
  store().set(conversationId, next);
  return next;
}

export function isPeerTyping(
  state: ChatPresenceState,
  viewer: ChatPresenceParty,
  now = Date.now(),
): boolean {
  if (viewer === 'consumer') return state.staffTypingUntil > now;
  return state.consumerTypingUntil > now;
}

export function mergePresenceFromDbRow(
  conversationId: string,
  row: {
    consumer_typing_until?: string | null;
    staff_typing_until?: string | null;
    consumer_last_read_seq?: number | null;
    staff_last_read_seq?: number | null;
  } | null | undefined,
): ChatPresenceState {
  const prev = getChatPresence(conversationId);
  if (!row) return prev;
  const next: ChatPresenceState = {
    consumerTypingUntil: Math.max(
      prev.consumerTypingUntil,
      row.consumer_typing_until
        ? Date.parse(row.consumer_typing_until) || 0
        : 0,
    ),
    staffTypingUntil: Math.max(
      prev.staffTypingUntil,
      row.staff_typing_until ? Date.parse(row.staff_typing_until) || 0 : 0,
    ),
    consumerLastReadSeq: Math.max(
      prev.consumerLastReadSeq,
      Number(row.consumer_last_read_seq || 0),
    ),
    staffLastReadSeq: Math.max(
      prev.staffLastReadSeq,
      Number(row.staff_last_read_seq || 0),
    ),
  };
  store().set(conversationId, next);
  return next;
}
