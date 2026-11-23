/**
 * In-memory supervision store for local/E2E when CHAT_SUPERVISION_MEMORY=1.
 * Not for production. Process-local; survives only for the Node process lifetime.
 */
import { randomUUID } from 'node:crypto';

import { hashConsumerSession } from './supervision-shared';

export type MemConversation = {
  id: string;
  comercio_id: string;
  consumer_session_id: string;
  consumer_session_hash: string;
  status: 'ai_handling' | 'human_handling' | 'needs_attention' | 'closed';
  attention_version: number;
  assigned_user_id: string | null;
  assigned_at: string | null;
  consumer_label: string | null;
  last_message_at: string | null;
  last_message_preview: string | null;
  unread_merchant_count: number;
  first_consumer_message_at: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type MemMessage = {
  id: string;
  conversation_id: string;
  comercio_id: string;
  seq: number;
  role: 'consumer' | 'assistant' | 'staff' | 'system';
  sender_user_id: string | null;
  body: string;
  client_message_id: string | null;
  payload: Record<string, unknown>;
  created_at: string;
};

export type MemEvent = {
  id: string;
  conversation_id: string;
  comercio_id: string;
  event_type: string;
  dedupe_key: string;
  channel: string;
  status: 'queued' | 'sent' | 'failed' | 'skipped';
  last_error: string | null;
  created_at: string;
};

const g = globalThis as unknown as {
  __chatSupervisionMemory?: {
    conversations: Map<string, MemConversation>;
    byHash: Map<string, string>;
    messages: Map<string, MemMessage[]>;
    events: Map<string, MemEvent>;
    seq: number;
  };
};

function store() {
  if (!g.__chatSupervisionMemory) {
    g.__chatSupervisionMemory = {
      conversations: new Map(),
      byHash: new Map(),
      messages: new Map(),
      events: new Map(),
      seq: 0,
    };
  }
  return g.__chatSupervisionMemory;
}

export function isSupervisionMemoryEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const raw = (env.CHAT_SUPERVISION_MEMORY || '').trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes';
}

export function memoryReset() {
  const s = store();
  s.conversations.clear();
  s.byHash.clear();
  s.messages.clear();
  s.events.clear();
  s.seq = 0;
}

export function memoryGetBySession(
  comercioId: string,
  sessionId: string,
): MemConversation | null {
  const hash = hashConsumerSession(comercioId, sessionId);
  const id = store().byHash.get(`${comercioId}:${hash}`);
  if (!id) return null;
  return store().conversations.get(id) || null;
}

export function memoryGetConversation(id: string): MemConversation | null {
  return store().conversations.get(id) || null;
}

export function memoryListConversations(comercioId: string): MemConversation[] {
  return [...store().conversations.values()]
    .filter((c) => c.comercio_id === comercioId)
    .sort((a, b) =>
      String(b.last_message_at || '').localeCompare(String(a.last_message_at || '')),
    );
}

export function memoryUpsertConversation(
  row: Partial<MemConversation> & {
    comercio_id: string;
    consumer_session_id: string;
    consumer_session_hash: string;
  },
): MemConversation {
  const s = store();
  const existingId = s.byHash.get(
    `${row.comercio_id}:${row.consumer_session_hash}`,
  );
  const now = new Date().toISOString();
  if (existingId) {
    const prev = s.conversations.get(existingId)!;
    const next: MemConversation = {
      ...prev,
      ...row,
      id: prev.id,
      updated_at: now,
    };
    s.conversations.set(prev.id, next);
    return next;
  }
  const id = row.id || randomUUID();
  const created: MemConversation = {
    id,
    comercio_id: row.comercio_id,
    consumer_session_id: row.consumer_session_id,
    consumer_session_hash: row.consumer_session_hash,
    status: row.status || 'ai_handling',
    attention_version: row.attention_version ?? 1,
    assigned_user_id: row.assigned_user_id ?? null,
    assigned_at: row.assigned_at ?? null,
    consumer_label: row.consumer_label ?? null,
    last_message_at: row.last_message_at ?? now,
    last_message_preview: row.last_message_preview ?? null,
    unread_merchant_count: row.unread_merchant_count ?? 0,
    first_consumer_message_at: row.first_consumer_message_at ?? now,
    closed_at: row.closed_at ?? null,
    created_at: now,
    updated_at: now,
  };
  s.conversations.set(id, created);
  s.byHash.set(`${created.comercio_id}:${created.consumer_session_hash}`, id);
  s.messages.set(id, []);
  return created;
}

export function memoryUpdateConversation(
  id: string,
  patch: Partial<MemConversation>,
): MemConversation | null {
  const s = store();
  const prev = s.conversations.get(id);
  if (!prev) return null;
  const next = {
    ...prev,
    ...patch,
    id: prev.id,
    updated_at: new Date().toISOString(),
  };
  s.conversations.set(id, next);
  return next;
}

export function memoryAddMessage(input: {
  conversation_id: string;
  comercio_id: string;
  role: MemMessage['role'];
  body: string;
  sender_user_id?: string | null;
  client_message_id?: string | null;
  payload?: Record<string, unknown>;
}): MemMessage | null {
  const s = store();
  const list = s.messages.get(input.conversation_id);
  if (!list) return null;
  if (input.client_message_id) {
    const dup = list.find((m) => m.client_message_id === input.client_message_id);
    if (dup) return dup;
  }
  s.seq += 1;
  const msg: MemMessage = {
    id: randomUUID(),
    conversation_id: input.conversation_id,
    comercio_id: input.comercio_id,
    seq: s.seq,
    role: input.role,
    sender_user_id: input.sender_user_id ?? null,
    body: input.body,
    client_message_id: input.client_message_id ?? null,
    payload: input.payload || {},
    created_at: new Date().toISOString(),
  };
  list.push(msg);
  return msg;
}

export function memoryListMessages(
  conversationId: string,
  afterSeq = 0,
  roles?: string[],
): MemMessage[] {
  const list = store().messages.get(conversationId) || [];
  return list.filter((m) => {
    if (afterSeq > 0 && m.seq <= afterSeq) return false;
    if (roles && !roles.includes(m.role)) return false;
    return true;
  });
}

export function memoryInsertEvent(input: {
  conversation_id: string;
  comercio_id: string;
  event_type: string;
  dedupe_key: string;
}): { ok: true; event: MemEvent } | { ok: false; duplicate: true } {
  const s = store();
  if (s.events.has(input.dedupe_key)) {
    return { ok: false, duplicate: true };
  }
  const event: MemEvent = {
    id: randomUUID(),
    conversation_id: input.conversation_id,
    comercio_id: input.comercio_id,
    event_type: input.event_type,
    dedupe_key: input.dedupe_key,
    channel: 'whatsapp',
    status: 'queued',
    last_error: null,
    created_at: new Date().toISOString(),
  };
  s.events.set(input.dedupe_key, event);
  return { ok: true, event };
}

export function memoryUpdateEvent(
  dedupeKey: string,
  patch: Partial<Pick<MemEvent, 'status' | 'last_error'>>,
) {
  const s = store();
  const prev = s.events.get(dedupeKey);
  if (!prev) return;
  s.events.set(dedupeKey, { ...prev, ...patch });
}

export function memoryListEvents(): MemEvent[] {
  return [...store().events.values()];
}

export function memoryTakeConversation(
  conversationId: string,
  userId: string,
): MemConversation | null {
  const c = memoryGetConversation(conversationId);
  if (!c) return null;
  if (
    c.status === 'ai_handling' ||
    c.status === 'needs_attention' ||
    (c.status === 'human_handling' && c.assigned_user_id === userId)
  ) {
    return memoryUpdateConversation(conversationId, {
      status: 'human_handling',
      assigned_user_id: userId,
      assigned_at: new Date().toISOString(),
      attention_version: c.attention_version + 1,
    });
  }
  return null;
}

export function memoryReturnToAssistant(
  conversationId: string,
): MemConversation | null {
  const c = memoryGetConversation(conversationId);
  if (!c || c.status !== 'human_handling') return null;
  return memoryUpdateConversation(conversationId, {
    status: 'ai_handling',
    assigned_user_id: null,
    assigned_at: null,
    attention_version: c.attention_version + 1,
  });
}
