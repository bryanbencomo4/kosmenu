/**
 * Register a human-support request for the platform WA inbox.
 * Durable when PLATFORM_WA_INBOX_SUPABASE=1 (wa_platform_* tables).
 * Callers must only claim success to the contact when `ok: true`.
 */

import {
  appendInboxMessage,
  upsertInboxConversationOnInbound,
} from './inbox-store';
import {
  createSupportTicketDurable,
  markSupportTicketNotified,
  type WaSupportTicket,
} from './support-tickets';

export type RegisterHumanSupportResult =
  | { ok: true; ticket: WaSupportTicket }
  | { ok: false; error: string; ticket?: WaSupportTicket };

export async function registerHumanSupportRequest(params: {
  fromDigits: string;
  text: string;
  context?: string | null;
  nowMs?: number;
}): Promise<RegisterHumanSupportResult> {
  const nowMs = params.nowMs ?? Date.now();
  const fromDigits = String(params.fromDigits || '').replace(/\D/g, '');
  if (!fromDigits || fromDigits.length < 10) {
    return { ok: false, error: 'fromDigits_required' };
  }

  let ticket: WaSupportTicket;
  try {
    ticket = await createSupportTicketDurable({
      fromDigits,
      text: params.text,
      context: params.context,
      nowMs,
    });
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'ticket_create_failed',
    };
  }

  try {
    const note = `Solicitud humana · ${ticket.id} · ${(params.text || '').slice(0, 180)}`;
    const conversation = await upsertInboxConversationOnInbound({
      fromDigits,
      text: note,
      atMs: nowMs,
      markNeedsAttention: true,
      contextRole: 'support_human',
      contextNote: note,
    });
    if (!conversation?.fromDigits) {
      return { ok: false, error: 'inbox_upsert_failed', ticket };
    }
    await appendInboxMessage({
      fromDigits,
      role: 'system',
      text: `Pendiente de asesor · ${ticket.id}`,
      atMs: nowMs,
      clientMessageId: `sys_${ticket.id}`,
    });
    // Recorded for operators watching /wa-control (no separate notifier channel).
    markSupportTicketNotified(ticket.id, true);
    return { ok: true, ticket };
  } catch (e) {
    markSupportTicketNotified(
      ticket.id,
      false,
      e instanceof Error ? e.message : 'inbox_register_failed',
    );
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'inbox_register_failed',
      ticket,
    };
  }
}

/** Last-resort personal line — only used after escalate registration succeeds. */
const OWNER_ESCALATE_DISPLAY = '+584140821633';

export const HUMAN_SUPPORT_SUCCESS_REPLY = [
  'Listo 🙏 No pude cerrarlo del todo con lo que tengo aquí.',
  '',
  `Te paso con atención personal: *${OWNER_ESCALATE_DISPLAY}*`,
  '',
  'También pueden escribirte por este mismo chat. Gracias por la paciencia.',
].join('\n');

export const HUMAN_SUPPORT_FAILURE_REPLY =
  'No pude registrar tu solicitud ahora. 🙏 Intenta de nuevo en unos minutos o escribe *9* otra vez.';
