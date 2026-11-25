import { getServiceSupabaseClient } from '../../_lib/supabase-server';
import {
  appendInboxMessage,
  upsertInboxConversationOnInbound,
} from '../../wa-entry/_lib/inbox-store';
import {
  createSupportTicketDurable,
  markSupportTicketNotified,
} from '../../wa-entry/_lib/support-tickets';
import type { BusinessShop } from './auth';
import { syntheticBusinessAssistantDigits } from './escalate-id';
import type { BusinessToolResult } from './tools';

export { syntheticBusinessAssistantDigits } from './escalate-id';

function digitsOnly(raw: string): string {
  return String(raw || '').replace(/\D/g, '');
}

async function resolveContactDigits(
  shop: BusinessShop,
  userId: string,
): Promise<{ digits: string; label: string }> {
  try {
    const sb = getServiceSupabaseClient();
    const { data } = await sb
      .from('comercios')
      .select('whatsapp,telefonos,nombre')
      .eq('id', shop.comercioId)
      .maybeSingle();
    const candidates = [data?.whatsapp, data?.telefonos]
      .map((v) => digitsOnly(String(v || '')))
      .filter((d) => d.length >= 10);
    if (candidates[0]) {
      return {
        digits: candidates[0],
        label: `Negocio · ${shop.nombre}`,
      };
    }
  } catch {
    /* fall through */
  }
  return {
    digits: syntheticBusinessAssistantDigits(userId),
    label: `Asistente web · ${shop.nombre}`,
  };
}

/**
 * Puts the merchant in touch with platform ops (admin.elmenuxfa.com → WA Control).
 * Never claims success if the inbox/ticket write fails.
 */
export async function escalateBusinessAssistantToHuman(params: {
  userId: string;
  shop: BusinessShop;
  userText: string;
  reason?: string;
  history?: Array<{ role: 'user' | 'assistant'; text: string }>;
}): Promise<BusinessToolResult> {
  const { digits, label } = await resolveContactDigits(params.shop, params.userId);
  const nowMs = Date.now();
  const ask = (params.reason || params.userText || '').trim().slice(0, 1500);
  const historyBlock = (params.history || [])
    .slice(-6)
    .map((m) => `${m.role === 'user' ? 'Dueño' : 'Bot'}: ${m.text.slice(0, 160)}`)
    .join('\n');
  const context = [
    'Fuente: asistente-negocio (web)',
    `Comercio: ${params.shop.nombre} (${params.shop.comercioId})`,
    `UserId: ${params.userId}`,
    historyBlock ? `Historial:\n${historyBlock}` : '',
  ]
    .filter(Boolean)
    .join('\n')
    .slice(0, 3500);

  try {
    const ticket = await createSupportTicketDurable({
      fromDigits: digits,
      text: ask || 'Necesito ayuda con el asistente del negocio',
      context,
      nowMs,
    });

    await upsertInboxConversationOnInbound({
      fromDigits: digits,
      displayName: label,
      text: ask.slice(0, 240) || 'Escalado desde asistente-negocio',
      atMs: nowMs,
      markNeedsAttention: true,
      contextRole: 'business_assistant',
      contextNote: `Web asistente · ${params.shop.nombre} · ticket ${ticket.id}`,
    });

    await appendInboxMessage({
      fromDigits: digits,
      role: 'contact',
      text: ask || 'Necesito ayuda con el asistente del negocio',
      atMs: nowMs,
      clientMessageId: `ba_c_${ticket.id}`,
    });
    await appendInboxMessage({
      fromDigits: digits,
      role: 'system',
      text: `Escalado desde asistente-negocio · ${ticket.id} · ${params.shop.nombre}`,
      atMs: nowMs + 1,
      clientMessageId: `ba_s_${ticket.id}`,
    });
    markSupportTicketNotified(ticket.id, true);

    return {
      text: [
        'Perfecto — te pongo en contacto con el equipo de *elmenuxfa.com* 🙌',
        '',
        'Ya les llegó tu consulta en *admin → WA Control*. En un momentito te responden por aquí o por WhatsApp.',
        '',
        `Ref: \`${ticket.id.slice(0, 12)}\``,
      ].join('\n'),
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'escalate_failed';
    return {
      text: [
        'Quise pasarte con el equipo, pero no pude registrar la solicitud ahora 😅',
        '',
        'Intenta de nuevo en un minutito o escribe *hablar con un humano*.',
        `(${msg})`,
      ].join('\n'),
    };
  }
}
