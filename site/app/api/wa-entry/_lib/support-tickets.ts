/**
 * Platform WA support tickets.
 * Memory for tests / flag-off; durable Supabase when PLATFORM_WA_INBOX_SUPABASE=1.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export type WaSupportTicket = {
  id: string;
  fromDigits: string;
  text: string;
  context: string | null;
  status: 'pending' | 'claimed' | 'closed';
  createdAtMs: number;
  notified: boolean;
  notifyError: string | null;
};

const tickets = new Map<string, WaSupportTicket>();
const byContact = new Map<string, string[]>();

function inboxSupabaseEnabled(): boolean {
  return String(process.env.PLATFORM_WA_INBOX_SUPABASE || '').trim() === '1';
}

function sb(): SupabaseClient | null {
  if (!inboxSupabaseEnabled()) return null;
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '').trim();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function rowToTicket(row: Record<string, unknown>): WaSupportTicket {
  const statusRaw = String(row.status || 'pending');
  const status =
    statusRaw === 'claimed' || statusRaw === 'closed' ? statusRaw : 'pending';
  return {
    id: String(row.id || ''),
    fromDigits: String(row.from_digits || ''),
    text: String(row.text || ''),
    context: row.context == null ? null : String(row.context),
    status,
    createdAtMs: Number(row.created_at_ms) || 0,
    notified: Boolean(row.notified),
    notifyError: row.notify_error == null ? null : String(row.notify_error),
  };
}

export function resetSupportTicketsForTests() {
  tickets.clear();
  byContact.clear();
}

async function persistTicket(ticket: WaSupportTicket): Promise<void> {
  const client = sb();
  if (!client) {
    if (inboxSupabaseEnabled()) {
      throw new Error('support_ticket_supabase_unavailable');
    }
    return;
  }
  const { error } = await client.from('wa_platform_support_tickets').upsert(
    {
      id: ticket.id,
      from_digits: ticket.fromDigits,
      text: ticket.text,
      context: ticket.context,
      status: ticket.status,
      created_at_ms: ticket.createdAtMs,
      notified: ticket.notified,
      notify_error: ticket.notifyError,
      updated_at_ms: Date.now(),
    },
    { onConflict: 'id' },
  );
  if (error) {
    // Pending-text unique: return/update existing pending row for same contact+text.
    if (/wa_platform_support_tickets_pending_text_uidx|duplicate key/i.test(error.message)) {
      const { data } = await client
        .from('wa_platform_support_tickets')
        .select('*')
        .eq('from_digits', ticket.fromDigits)
        .eq('status', 'pending')
        .eq('text', ticket.text)
        .limit(1)
        .maybeSingle();
      if (data) {
        const existing = rowToTicket(data as Record<string, unknown>);
        tickets.set(existing.id, existing);
        return;
      }
    }
    throw new Error(`support_ticket_persist_failed:${error.message}`);
  }
}

/**
 * Sync create (memory). Prefer `createSupportTicketDurable` when persistence matters.
 */
export function createSupportTicket(params: {
  fromDigits: string;
  text: string;
  context?: string | null;
  nowMs?: number;
}): WaSupportTicket {
  const nowMs = params.nowMs ?? Date.now();
  const fromDigits = String(params.fromDigits || '').replace(/\D/g, '');
  const text = params.text.trim().slice(0, 2000);
  const existingIds = byContact.get(fromDigits) || [];
  for (const id of existingIds.slice(-5)) {
    const t = tickets.get(id);
    if (
      t &&
      t.status === 'pending' &&
      t.text === text &&
      nowMs - t.createdAtMs < 10 * 60 * 1000
    ) {
      return t;
    }
  }
  const id = `sup_${nowMs.toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const ticket: WaSupportTicket = {
    id,
    fromDigits,
    text,
    context: params.context?.slice(0, 2000) || null,
    status: 'pending',
    createdAtMs: nowMs,
    notified: false,
    notifyError: null,
  };
  tickets.set(id, ticket);
  byContact.set(fromDigits, [...existingIds, id]);
  return ticket;
}

/** Memory + durable write when PLATFORM_WA_INBOX_SUPABASE=1. */
export async function createSupportTicketDurable(params: {
  fromDigits: string;
  text: string;
  context?: string | null;
  nowMs?: number;
}): Promise<WaSupportTicket> {
  const ticket = createSupportTicket(params);
  await persistTicket(ticket);
  return tickets.get(ticket.id) || ticket;
}

export function listPendingSupportTickets(limit = 50): WaSupportTicket[] {
  return [...tickets.values()]
    .filter((t) => t.status === 'pending')
    .sort((a, b) => b.createdAtMs - a.createdAtMs)
    .slice(0, limit);
}

export async function listPendingSupportTicketsDurable(
  limit = 50,
): Promise<WaSupportTicket[]> {
  const client = sb();
  if (!client) return listPendingSupportTickets(limit);
  const { data, error } = await client
    .from('wa_platform_support_tickets')
    .select('*')
    .eq('status', 'pending')
    .order('created_at_ms', { ascending: false })
    .limit(Math.min(200, Math.max(1, limit)));
  if (error || !data) return listPendingSupportTickets(limit);
  const out = data.map((row) => rowToTicket(row as Record<string, unknown>));
  for (const t of out) {
    tickets.set(t.id, t);
    const prev = byContact.get(t.fromDigits) || [];
    if (!prev.includes(t.id)) byContact.set(t.fromDigits, [...prev, t.id]);
  }
  return out;
}

export function markSupportTicketNotified(id: string, ok: boolean, error?: string) {
  const t = tickets.get(id);
  if (!t) return null;
  t.notified = ok;
  t.notifyError = ok ? null : error || 'notify_failed';
  tickets.set(id, t);
  const client = sb();
  if (client) {
    void client
      .from('wa_platform_support_tickets')
      .update({
        notified: t.notified,
        notify_error: t.notifyError,
        updated_at_ms: Date.now(),
      })
      .eq('id', id)
      .then(() => undefined)
      .catch(() => undefined);
  }
  return t;
}

export function claimSupportTicket(id: string): WaSupportTicket | null {
  const t = tickets.get(id);
  if (!t) return null;
  t.status = 'claimed';
  tickets.set(id, t);
  const client = sb();
  if (client) {
    void client
      .from('wa_platform_support_tickets')
      .update({ status: 'claimed', updated_at_ms: Date.now() })
      .eq('id', id)
      .then(() => undefined)
      .catch(() => undefined);
  }
  return t;
}
