/**
 * Platform WA inbox persistence (operators of elmenuxfa.com).
 * Default: durable process memory (same pattern as support tickets).
 * Optional Supabase tables when PLATFORM_WA_INBOX_SUPABASE=1 and migration applied.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { canResumeAutoReplyForContact } from './auto-reply-policy';
import { resolveWaEntryControlStore } from './control-store';
import {
  describeConversationControl,
  returnConversationToAssistant,
  takeConversation,
  type WaConversationControl,
} from './operator-control';

export type InboxStatus =
  | 'ai_handling'
  | 'human_handling'
  | 'needs_attention'
  | 'pending'
  | 'closed';

export type InboxMessageRole = 'contact' | 'assistant' | 'operator' | 'system';

export type InboxMessage = {
  id: string;
  fromDigits: string;
  role: InboxMessageRole;
  text: string;
  atMs: number;
  clientMessageId?: string | null;
  operatorId?: string | null;
  operatorLabel?: string | null;
  outboundId?: string | null;
};

export type InboxConversation = {
  fromDigits: string;
  displayName: string | null;
  status: InboxStatus;
  assignedOperatorId: string | null;
  assignedOperatorLabel: string | null;
  lastMessageText: string;
  lastMessageAtMs: number;
  unreadCount: number;
  attentionVersion: number;
  contextRole: string | null;
  contextNote: string | null;
  updatedAtMs: number;
  closedAtMs: number | null;
  humanActive: boolean;
  aiActive: boolean;
};

type G = typeof globalThis & {
  __waPlatformInboxConvs?: Map<string, InboxConversation>;
  __waPlatformInboxMsgs?: Map<string, InboxMessage[]>;
};

function g(): G {
  return globalThis as G;
}

function convMap(): Map<string, InboxConversation> {
  const x = g();
  if (!x.__waPlatformInboxConvs) x.__waPlatformInboxConvs = new Map();
  return x.__waPlatformInboxConvs;
}

function msgMap(): Map<string, InboxMessage[]> {
  const x = g();
  if (!x.__waPlatformInboxMsgs) x.__waPlatformInboxMsgs = new Map();
  return x.__waPlatformInboxMsgs;
}

function digitsOf(raw: string): string {
  return String(raw || '').replace(/\D/g, '');
}

function useSupabase(): boolean {
  return String(process.env.PLATFORM_WA_INBOX_SUPABASE || '').trim() === '1';
}

function sb(): SupabaseClient | null {
  if (!useSupabase()) return null;
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '').trim();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function statusFromControl(
  prev: InboxConversation | undefined,
  control: WaConversationControl,
  markNeedsAttention?: boolean,
): InboxStatus {
  if (prev?.status === 'closed' && !markNeedsAttention) return 'closed';
  if (control.closed) return 'closed';
  if (control.humanHandling) return 'human_handling';
  if (markNeedsAttention || prev?.status === 'needs_attention') return 'needs_attention';
  if (prev?.status === 'pending') return 'pending';
  if (control.aiActive) return 'ai_handling';
  return 'pending';
}

function mergeControl(
  prev: InboxConversation | undefined,
  control: WaConversationControl,
  patch?: Partial<InboxConversation>,
): InboxConversation {
  const now = Date.now();
  return {
    fromDigits: control.fromDigits,
    displayName: patch?.displayName ?? prev?.displayName ?? null,
    status: patch?.status ?? statusFromControl(prev, control, false),
    assignedOperatorId:
      patch?.assignedOperatorId ??
      (control.humanHandling ? control.controllerId : null) ??
      prev?.assignedOperatorId ??
      null,
    assignedOperatorLabel:
      patch?.assignedOperatorLabel ??
      (control.humanHandling ? control.controllerId : null) ??
      prev?.assignedOperatorLabel ??
      null,
    lastMessageText: patch?.lastMessageText ?? prev?.lastMessageText ?? '',
    lastMessageAtMs: patch?.lastMessageAtMs ?? prev?.lastMessageAtMs ?? 0,
    unreadCount: patch?.unreadCount ?? prev?.unreadCount ?? 0,
    attentionVersion: control.attentionVersion,
    contextRole: patch?.contextRole ?? prev?.contextRole ?? null,
    contextNote: patch?.contextNote ?? prev?.contextNote ?? null,
    updatedAtMs: patch?.updatedAtMs ?? now,
    closedAtMs: patch?.closedAtMs ?? prev?.closedAtMs ?? null,
    humanActive: control.humanHandling,
    aiActive: control.aiActive && !control.humanHandling,
  };
}

export async function upsertInboxConversationOnInbound(input: {
  fromDigits: string;
  displayName?: string | null;
  text: string;
  atMs?: number;
  contextRole?: string | null;
  contextNote?: string | null;
  markNeedsAttention?: boolean;
}): Promise<InboxConversation> {
  const fromDigits = digitsOf(input.fromDigits);
  const atMs = input.atMs ?? Date.now();
  const text = String(input.text || '').slice(0, 4000);
  const store = resolveWaEntryControlStore();
  const thread = await store.getThread(fromDigits);
  const control = describeConversationControl(fromDigits, thread, atMs);
  const prev = convMap().get(fromDigits);
  const reopen = prev?.status === 'closed';
  const next = mergeControl(prev, control, {
    displayName: (input.displayName || prev?.displayName || null)?.trim() || null,
    status: input.markNeedsAttention
      ? 'needs_attention'
      : reopen
        ? 'pending'
        : statusFromControl(prev, control, input.markNeedsAttention),
    lastMessageText: text.slice(0, 240),
    lastMessageAtMs: atMs,
    unreadCount: (prev?.unreadCount || 0) + 1,
    contextRole: input.contextRole ?? prev?.contextRole ?? null,
    contextNote: input.contextNote ?? prev?.contextNote ?? null,
    updatedAtMs: atMs,
    closedAtMs: null,
  });
  convMap().set(fromDigits, next);

  const client = sb();
  if (client) {
    try {
      await client.from('wa_platform_inbox_conversations').upsert(
        {
          from_digits: next.fromDigits,
          display_name: next.displayName,
          status: next.status,
          assigned_operator_id: next.assignedOperatorId,
          assigned_operator_label: next.assignedOperatorLabel,
          last_message_text: next.lastMessageText,
          last_message_at_ms: next.lastMessageAtMs,
          unread_count: next.unreadCount,
          attention_version: next.attentionVersion,
          context_role: next.contextRole,
          context_note: next.contextNote,
          updated_at_ms: next.updatedAtMs,
          closed_at_ms: next.closedAtMs,
        },
        { onConflict: 'from_digits' },
      );
    } catch {
      /* memory remains SoT until migration */
    }
  }
  return next;
}

export async function appendInboxMessage(input: {
  fromDigits: string;
  role: InboxMessageRole;
  text: string;
  atMs?: number;
  clientMessageId?: string | null;
  operatorId?: string | null;
  operatorLabel?: string | null;
  outboundId?: string | null;
  id?: string;
}): Promise<InboxMessage> {
  const fromDigits = digitsOf(input.fromDigits);
  const atMs = input.atMs ?? Date.now();
  const id =
    input.id || `waim_${atMs}_${Math.random().toString(36).slice(2, 10)}`;
  const msg: InboxMessage = {
    id,
    fromDigits,
    role: input.role,
    text: String(input.text || '').slice(0, 4000),
    atMs,
    clientMessageId: input.clientMessageId || null,
    operatorId: input.operatorId || null,
    operatorLabel: input.operatorLabel || null,
    outboundId: input.outboundId || null,
  };

  const list = msgMap().get(fromDigits) || [];
  if (input.clientMessageId) {
    const dup = list.find((m) => m.clientMessageId === input.clientMessageId);
    if (dup) return dup;
  }
  list.push(msg);
  if (list.length > 500) list.splice(0, list.length - 500);
  msgMap().set(fromDigits, list);

  const prev = convMap().get(fromDigits);
  if (prev) {
    convMap().set(fromDigits, {
      ...prev,
      lastMessageText: msg.text.slice(0, 240),
      lastMessageAtMs: atMs,
      updatedAtMs: atMs,
    });
  }

  const client = sb();
  if (client) {
    try {
      await client.from('wa_platform_inbox_messages').upsert(
        {
          id: msg.id,
          from_digits: msg.fromDigits,
          role: msg.role,
          text: msg.text,
          at_ms: msg.atMs,
          client_message_id: msg.clientMessageId,
          operator_id: msg.operatorId,
          outbound_id: msg.outboundId,
        },
        { onConflict: 'id' },
      );
    } catch {
      /* ignore */
    }
  }
  return msg;
}

export async function listInboxConversations(input?: {
  filter?: string;
  q?: string;
  limit?: number;
}): Promise<InboxConversation[]> {
  const filter = (input?.filter || 'all').toLowerCase();
  const q = (input?.q || '').trim().toLowerCase();
  const limit = Math.min(200, Math.max(1, input?.limit || 80));
  const store = resolveWaEntryControlStore();
  const nowMs = Date.now();

  for (const r of Array.from(convMap().values())) {
    const thread = await store.getThread(r.fromDigits);
    const control = describeConversationControl(r.fromDigits, thread, nowMs);
    convMap().set(r.fromDigits, mergeControl(r, control));
  }

  let out = Array.from(convMap().values());
  if (filter === 'unattended' || filter === 'sin_atender') {
    out = out.filter((c) => c.status === 'pending' || c.status === 'needs_attention');
  } else if (filter === 'ai' || filter === 'ia') {
    out = out.filter((c) => c.status === 'ai_handling' && c.aiActive);
  } else if (filter === 'human' || filter === 'humana') {
    out = out.filter((c) => c.humanActive || c.status === 'human_handling');
  } else if (filter === 'pending' || filter === 'pendientes') {
    out = out.filter((c) => c.status === 'pending' || c.status === 'needs_attention');
  } else if (filter === 'closed' || filter === 'cerradas') {
    out = out.filter((c) => c.status === 'closed');
  }

  if (q) {
    const qDigits = q.replace(/\D/g, '');
    out = out.filter((c) => {
      const hay = `${c.fromDigits} ${c.displayName || ''} ${c.lastMessageText}`.toLowerCase();
      return hay.includes(q) || (qDigits.length >= 4 && c.fromDigits.includes(qDigits));
    });
  }

  out.sort((a, b) => b.lastMessageAtMs - a.lastMessageAtMs);
  return out.slice(0, limit);
}

export async function getInboxConversation(
  fromDigitsRaw: string,
): Promise<InboxConversation | null> {
  const fromDigits = digitsOf(fromDigitsRaw);
  const prev = convMap().get(fromDigits);
  if (!prev) return null;
  const store = resolveWaEntryControlStore();
  const thread = await store.getThread(fromDigits);
  const control = describeConversationControl(fromDigits, thread, Date.now());
  const synced = mergeControl(prev, control);
  convMap().set(fromDigits, synced);
  return synced;
}

export async function listInboxMessages(input: {
  fromDigits: string;
  afterMs?: number;
  beforeMs?: number;
  limit?: number;
}): Promise<InboxMessage[]> {
  const fromDigits = digitsOf(input.fromDigits);
  const limit = Math.min(200, Math.max(1, input.limit || 80));
  let list = [...(msgMap().get(fromDigits) || [])];
  if (typeof input.afterMs === 'number' && Number.isFinite(input.afterMs)) {
    list = list.filter((m) => m.atMs > input.afterMs!);
  }
  if (typeof input.beforeMs === 'number' && Number.isFinite(input.beforeMs)) {
    list = list.filter((m) => m.atMs < input.beforeMs!);
  }
  list.sort((a, b) => a.atMs - b.atMs);
  if (list.length > limit) list = list.slice(list.length - limit);
  return list;
}

export async function markInboxRead(fromDigitsRaw: string): Promise<void> {
  const fromDigits = digitsOf(fromDigitsRaw);
  const prev = convMap().get(fromDigits);
  if (!prev) return;
  convMap().set(fromDigits, { ...prev, unreadCount: 0, updatedAtMs: Date.now() });
}

export async function inboxTakeConversation(input: {
  fromDigits: string;
  operatorId: string;
  operatorLabel?: string | null;
}): Promise<{ ok: true; conversation: InboxConversation } | { ok: false; error: string }> {
  const fromDigits = digitsOf(input.fromDigits);
  const store = resolveWaEntryControlStore();
  const nowMs = Date.now();
  const control = await takeConversation({
    store,
    fromDigits,
    controllerId: input.operatorId,
    nowMs,
  });
  const prev = convMap().get(fromDigits);
  const next = mergeControl(prev, control, {
    status: 'human_handling',
    assignedOperatorId: input.operatorId,
    assignedOperatorLabel: input.operatorLabel || input.operatorId,
    unreadCount: 0,
    closedAtMs: null,
    lastMessageText: prev?.lastMessageText || '',
    lastMessageAtMs: prev?.lastMessageAtMs || nowMs,
  });
  convMap().set(fromDigits, next);
  await appendInboxMessage({
    fromDigits,
    role: 'system',
    text: `Atención humana: ${next.assignedOperatorLabel}`,
  });
  return { ok: true, conversation: next };
}

export async function inboxReturnConversation(input: {
  fromDigits: string;
  operatorId: string;
}): Promise<
  | { ok: true; conversation: InboxConversation; aiResumed: boolean }
  | { ok: false; error: string }
> {
  const fromDigits = digitsOf(input.fromDigits);
  const aiAllowed = canResumeAutoReplyForContact(fromDigits);
  const store = resolveWaEntryControlStore();
  const nowMs = Date.now();
  const control = await returnConversationToAssistant({
    store,
    fromDigits,
    controllerId: input.operatorId,
    nowMs,
  });
  const prev = convMap().get(fromDigits);
  if (!prev) {
    const seeded = mergeControl(undefined, control, {
      status: aiAllowed ? 'ai_handling' : 'pending',
      assignedOperatorId: null,
      assignedOperatorLabel: null,
    });
    convMap().set(fromDigits, seeded);
    return { ok: true, conversation: seeded, aiResumed: aiAllowed };
  }
  const next = mergeControl(prev, control, {
    status: aiAllowed ? 'ai_handling' : 'pending',
    assignedOperatorId: null,
    assignedOperatorLabel: null,
    aiActive: aiAllowed,
  });
  // Force aiActive false when not allowlisted even if control says ai_active.
  if (!aiAllowed) {
    next.aiActive = false;
    next.status = 'pending';
  }
  convMap().set(fromDigits, next);
  await appendInboxMessage({
    fromDigits,
    role: 'system',
    text: aiAllowed
      ? 'Conversación devuelta al asistente.'
      : 'Conversación liberada. Sin respuestas automáticas (contacto no autorizado).',
  });
  return { ok: true, conversation: next, aiResumed: aiAllowed };
}

export async function inboxCloseConversation(
  fromDigitsRaw: string,
): Promise<InboxConversation | null> {
  const fromDigits = digitsOf(fromDigitsRaw);
  const store = resolveWaEntryControlStore();
  const nowMs = Date.now();
  await takeConversation({
    store,
    fromDigits,
    controllerId: 'admin:close',
    nowMs,
    mode: 'closed',
  });
  const prev = convMap().get(fromDigits);
  if (!prev) return null;
  const next: InboxConversation = {
    ...prev,
    status: 'closed',
    closedAtMs: nowMs,
    updatedAtMs: nowMs,
    humanActive: true,
    aiActive: false,
  };
  convMap().set(fromDigits, next);
  await appendInboxMessage({
    fromDigits,
    role: 'system',
    text: 'Conversación cerrada. El historial se conserva.',
  });
  return next;
}

export async function inboxSetContext(input: {
  fromDigits: string;
  contextRole?: string | null;
  contextNote?: string | null;
}): Promise<void> {
  const fromDigits = digitsOf(input.fromDigits);
  const prev = convMap().get(fromDigits);
  if (!prev) return;
  convMap().set(fromDigits, {
    ...prev,
    contextRole: input.contextRole ?? prev.contextRole,
    contextNote: input.contextNote ?? prev.contextNote,
    updatedAtMs: Date.now(),
  });
}

/** Test helper */
export function __resetInboxStoreForTests(): void {
  convMap().clear();
  msgMap().clear();
}
