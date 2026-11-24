/**
 * Platform WA support tickets — memory-first (no prod migration).
 * Escalation notice to the user only after a ticket is recorded.
 */

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

export function resetSupportTicketsForTests() {
  tickets.clear();
  byContact.clear();
}

export function createSupportTicket(params: {
  fromDigits: string;
  text: string;
  context?: string | null;
  nowMs?: number;
}): WaSupportTicket {
  const nowMs = params.nowMs ?? Date.now();
  // Dedupe: same contact + same text within 10 minutes.
  const existingIds = byContact.get(params.fromDigits) || [];
  for (const id of existingIds.slice(-5)) {
    const t = tickets.get(id);
    if (
      t &&
      t.status === 'pending' &&
      t.text === params.text.trim() &&
      nowMs - t.createdAtMs < 10 * 60 * 1000
    ) {
      return t;
    }
  }
  const id = `sup_${nowMs.toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const ticket: WaSupportTicket = {
    id,
    fromDigits: params.fromDigits,
    text: params.text.trim().slice(0, 2000),
    context: params.context?.slice(0, 2000) || null,
    status: 'pending',
    createdAtMs: nowMs,
    notified: false,
    notifyError: null,
  };
  tickets.set(id, ticket);
  byContact.set(params.fromDigits, [...existingIds, id]);
  return ticket;
}

export function listPendingSupportTickets(limit = 50): WaSupportTicket[] {
  return [...tickets.values()]
    .filter((t) => t.status === 'pending')
    .sort((a, b) => b.createdAtMs - a.createdAtMs)
    .slice(0, limit);
}

export function markSupportTicketNotified(id: string, ok: boolean, error?: string) {
  const t = tickets.get(id);
  if (!t) return null;
  t.notified = ok;
  t.notifyError = ok ? null : error || 'notify_failed';
  tickets.set(id, t);
  return t;
}

export function claimSupportTicket(id: string): WaSupportTicket | null {
  const t = tickets.get(id);
  if (!t) return null;
  t.status = 'claimed';
  tickets.set(id, t);
  return t;
}
