/**
 * Server-side chat supervision: persist conversations/messages, gate Gemini,
 * enqueue WaSender new-conversation notices. Never throws into the consumer path.
 */
import 'server-only';

import { createHash, randomUUID } from 'node:crypto';

import { getServiceSupabaseClient } from '../../_lib/supabase-server';
import { sendWhatsappText } from '../../_lib/send-order-whatsapp';
import { resolveMerchantContacts } from '../../_lib/notify-merchant-new-order';
import {
  getChatSupervisionConfig,
  isSupervisionEnabledForCommerce,
} from './supervision-config';
import {
  detectNeedsHuman,
  didEscalateToNeedsAttention,
  hashConsumerSession,
  merchantConversationHref,
  nextSupervisionRetryAt,
  shouldRetrySupervisionNotify,
} from './supervision-shared';
import {
  isSupervisionMemoryEnabled,
  memoryAddMessage,
  memoryGetBySession,
  memoryGetConversation,
  memoryInsertEvent,
  memoryUpdateConversation,
  memoryUpdateEvent,
  memoryUpsertConversation,
} from './supervision-memory';

export {
  detectNeedsHuman,
  didEscalateToNeedsAttention,
  hashConsumerSession,
  merchantConversationHref,
  nextSupervisionRetryAt,
  shouldDiscardInFlightAssistant,
  shouldRetrySupervisionNotify,
} from './supervision-shared';

export type ConversationStatus =
  | 'ai_handling'
  | 'human_handling'
  | 'needs_attention'
  | 'closed';

export type ChatMessageRole = 'consumer' | 'assistant' | 'staff' | 'system';

export type SupervisionConversation = {
  id: string;
  comercio_id: string;
  status: ConversationStatus;
  attention_version: number;
  assigned_user_id: string | null;
  consumer_label: string | null;
  last_message_preview: string | null;
};

function previewText(text: string, max = 140) {
  const t = text.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function isRealConsumerMessage(text: string) {
  const t = text.trim();
  if (t.length < 1) return false;
  // Ignore empty / whitespace-only; welcome/carousel never hit POST as user text.
  return true;
}

export async function getConversationBySession(
  comercioId: string,
  sessionId: string,
): Promise<SupervisionConversation | null> {
  if (!isSupervisionEnabledForCommerce(comercioId)) return null;
  try {
    if (isSupervisionMemoryEnabled()) {
      const row = memoryGetBySession(comercioId, sessionId);
      if (!row) return null;
      return {
        id: row.id,
        comercio_id: row.comercio_id,
        status: row.status,
        attention_version: row.attention_version,
        assigned_user_id: row.assigned_user_id,
        consumer_label: row.consumer_label,
        last_message_preview: row.last_message_preview,
      };
    }
    const sb = getServiceSupabaseClient();
    const hash = hashConsumerSession(comercioId, sessionId);
    const { data, error } = await sb
      .from('chat_conversations')
      .select(
        'id,comercio_id,status,attention_version,assigned_user_id,consumer_label,last_message_preview',
      )
      .eq('comercio_id', comercioId)
      .eq('consumer_session_hash', hash)
      .maybeSingle();
    if (error || !data) return null;
    return data as SupervisionConversation;
  } catch {
    return null;
  }
}

export async function shouldSkipGemini(
  comercioId: string,
  sessionId: string,
): Promise<{ skip: boolean; conversation: SupervisionConversation | null }> {
  const conversation = await getConversationBySession(comercioId, sessionId);
  if (!conversation) return { skip: false, conversation: null };
  const cfg = getChatSupervisionConfig();
  if (!cfg.humanTakeover) return { skip: false, conversation };
  const skip =
    conversation.status === 'human_handling' ||
    conversation.status === 'closed';
  return { skip, conversation };
}

type PersistConsumerTurnInput = {
  comercioId: string;
  commerceName: string;
  sessionId: string;
  text: string;
  clientMessageId?: string | null;
  payload?: Record<string, unknown>;
};

export type PersistConsumerTurnResult = {
  ok: boolean;
  conversationId?: string;
  messageId?: string;
  isNewConversation?: boolean;
  status?: ConversationStatus;
  attentionVersion?: number;
  error?: string;
};

/**
 * Persist consumer message. Opens/reopens conversation. Schedules WaSender
 * only for brand-new (or reopened after idle) conversations. Never throws.
 */
export async function persistConsumerTurn(
  input: PersistConsumerTurnInput,
): Promise<PersistConsumerTurnResult> {
  if (!isSupervisionEnabledForCommerce(input.comercioId)) {
    return { ok: false, error: 'supervision_disabled' };
  }
  if (!isRealConsumerMessage(input.text)) {
    return { ok: false, error: 'empty_message' };
  }

  try {
    const cfg = getChatSupervisionConfig();
    const hash = hashConsumerSession(input.comercioId, input.sessionId);
    const now = new Date();
    const reopenMs = cfg.reopenAfterHours * 3600_000;

    if (isSupervisionMemoryEnabled()) {
      const existing = memoryGetBySession(input.comercioId, input.sessionId);
      let isNewConversation = !existing;
      let conversation = existing;
      const previousStatus = existing?.status || null;
      if (!conversation) {
        conversation = memoryUpsertConversation({
          comercio_id: input.comercioId,
          consumer_session_id: input.sessionId.trim().slice(0, 80),
          consumer_session_hash: hash,
          status: detectNeedsHuman(input.text)
            ? 'needs_attention'
            : 'ai_handling',
          first_consumer_message_at: now.toISOString(),
          last_message_at: now.toISOString(),
          last_message_preview: previewText(input.text),
          unread_merchant_count: 1,
        });
      } else {
        const wasClosed = conversation.status === 'closed';
        if (wasClosed) isNewConversation = true;
        const nextStatus = detectNeedsHuman(input.text)
          ? 'needs_attention'
          : wasClosed
            ? 'ai_handling'
            : conversation.status;
        conversation =
          memoryUpdateConversation(conversation.id, {
            status: nextStatus,
            last_message_at: now.toISOString(),
            last_message_preview: previewText(input.text),
            unread_merchant_count: conversation.unread_merchant_count + 1,
            closed_at: wasClosed ? null : conversation.closed_at,
            ...(wasClosed
              ? {
                  assigned_user_id: null,
                  assigned_at: null,
                  attention_version: conversation.attention_version + 1,
                }
              : {}),
          }) || conversation;
        void reopenMs;
      }
      const clientMessageId =
        (input.clientMessageId || '').trim() ||
        `c_${createHash('sha256')
          .update(`${conversation.id}:${input.text}:${now.toISOString()}`)
          .digest('hex')
          .slice(0, 24)}`;
      const msg = memoryAddMessage({
        conversation_id: conversation.id,
        comercio_id: input.comercioId,
        role: 'consumer',
        body: input.text.slice(0, 4000),
        client_message_id: clientMessageId,
        payload: input.payload || {},
      });
      if (isNewConversation && cfg.wasenderNotify) {
        void enqueueNewConversationNotify({
          conversationId: conversation.id,
          comercioId: input.comercioId,
          commerceName: input.commerceName,
        }).catch(() => {});
      } else if (
        cfg.wasenderNotify &&
        detectNeedsHuman(input.text) &&
        conversation.status === 'needs_attention'
      ) {
        void enqueueNeedsAttentionNotify({
          conversationId: conversation.id,
          comercioId: input.comercioId,
          commerceName: input.commerceName,
        }).catch(() => {});
      }
      if (
        didEscalateToNeedsAttention(
          previousStatus,
          conversation.status,
          input.text,
        )
      ) {
        void offerAlternateContactIfNeeded({
          conversationId: conversation.id,
          comercioId: input.comercioId,
          commerceName: input.commerceName,
        }).catch(() => {});
      }
      return {
        ok: true,
        conversationId: conversation.id,
        messageId: msg?.id,
        isNewConversation,
        status: conversation.status,
        attentionVersion: conversation.attention_version,
      };
    }

    const sb = getServiceSupabaseClient();

    const existing = await sb
      .from('chat_conversations')
      .select('*')
      .eq('comercio_id', input.comercioId)
      .eq('consumer_session_hash', hash)
      .maybeSingle();

    let conversation = existing.data as Record<string, unknown> | null;
    let isNewConversation = false;
    const previousStatus = conversation
      ? String(conversation.status || '')
      : null;

    if (!conversation) {
      isNewConversation = true;
      const insert = await sb
        .from('chat_conversations')
        .insert({
          comercio_id: input.comercioId,
          consumer_session_id: input.sessionId.trim().slice(0, 80),
          consumer_session_hash: hash,
          status: detectNeedsHuman(input.text)
            ? 'needs_attention'
            : 'ai_handling',
          first_consumer_message_at: now.toISOString(),
          last_message_at: now.toISOString(),
          last_message_preview: previewText(input.text),
          unread_merchant_count: 1,
        })
        .select('*')
        .single();
      if (insert.error || !insert.data) {
        return { ok: false, error: insert.error?.message || 'insert_failed' };
      }
      conversation = insert.data as Record<string, unknown>;
    } else {
      const lastAt = conversation.last_message_at
        ? new Date(String(conversation.last_message_at)).getTime()
        : 0;
      const wasClosed = conversation.status === 'closed';
      const idleReopen =
        wasClosed || (lastAt > 0 && now.getTime() - lastAt > reopenMs);
      if (idleReopen && wasClosed) {
        isNewConversation = true;
      }
      const nextStatus = detectNeedsHuman(input.text)
        ? 'needs_attention'
        : wasClosed
          ? 'ai_handling'
          : String(conversation.status);

      const upd = await sb
        .from('chat_conversations')
        .update({
          status: nextStatus,
          last_message_at: now.toISOString(),
          last_message_preview: previewText(input.text),
          unread_merchant_count:
            Number(conversation.unread_merchant_count || 0) + 1,
          closed_at: wasClosed ? null : conversation.closed_at,
          updated_at: now.toISOString(),
          ...(wasClosed
            ? {
                assigned_user_id: null,
                assigned_at: null,
                attention_version:
                  Number(conversation.attention_version || 1) + 1,
              }
            : {}),
        })
        .eq('id', conversation.id)
        .select('*')
        .single();
      if (upd.data) conversation = upd.data as Record<string, unknown>;
    }

    const conversationId = String(conversation!.id);
    const clientMessageId =
      (input.clientMessageId || '').trim() ||
      `c_${createHash('sha256').update(`${conversationId}:${input.text}:${now.toISOString()}`).digest('hex').slice(0, 24)}`;

    const msg = await sb
      .from('chat_messages')
      .upsert(
        {
          conversation_id: conversationId,
          comercio_id: input.comercioId,
          role: 'consumer',
          body: input.text.slice(0, 4000),
          client_message_id: clientMessageId,
          payload: input.payload || {},
        },
        { onConflict: 'conversation_id,client_message_id', ignoreDuplicates: true },
      )
      .select('id')
      .maybeSingle();

    if (isNewConversation && cfg.wasenderNotify) {
      void enqueueNewConversationNotify({
        conversationId,
        comercioId: input.comercioId,
        commerceName: input.commerceName,
      }).catch(() => {});
    } else if (
      cfg.wasenderNotify &&
      detectNeedsHuman(input.text) &&
      String(conversation!.status) === 'needs_attention'
    ) {
      void enqueueNeedsAttentionNotify({
        conversationId,
        comercioId: input.comercioId,
        commerceName: input.commerceName,
      }).catch(() => {});
    }

    void publishConversationEvent(input.comercioId, conversationId, {
      type: 'message_created',
      role: 'consumer',
    }).catch(() => {});

    if (
      didEscalateToNeedsAttention(
        previousStatus,
        String(conversation!.status),
        input.text,
      )
    ) {
      void offerAlternateContactIfNeeded({
        conversationId,
        comercioId: input.comercioId,
        commerceName: input.commerceName,
      }).catch(() => {});
    }

    // Opportunistic retry of failed WaSender notifies (never blocks chat).
    void retryFailedSupervisionNotifies(input.comercioId).catch(() => {});

    return {
      ok: true,
      conversationId,
      messageId: msg.data?.id ? String(msg.data.id) : undefined,
      isNewConversation,
      status: String(conversation!.status) as ConversationStatus,
      attentionVersion: Number(conversation!.attention_version || 1),
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'persist_failed',
    };
  }
}

export async function persistAssistantOrStaffMessage(input: {
  conversationId: string;
  comercioId: string;
  role: 'assistant' | 'staff' | 'system';
  text: string;
  senderUserId?: string | null;
  clientMessageId?: string | null;
  payload?: Record<string, unknown>;
  attentionVersionAtStart?: number | null;
}): Promise<{ ok: boolean; discarded?: boolean; messageId?: string }> {
  if (!isSupervisionEnabledForCommerce(input.comercioId)) {
    return { ok: false };
  }
  try {
    const clientMessageId =
      (input.clientMessageId || '').trim() || `m_${randomUUID()}`;

    if (isSupervisionMemoryEnabled()) {
      const live = memoryGetConversation(input.conversationId);
      if (
        input.role === 'assistant' &&
        input.attentionVersionAtStart != null &&
        live &&
        (live.status === 'human_handling' ||
          live.status === 'closed' ||
          live.attention_version !== Number(input.attentionVersionAtStart))
      ) {
        return { ok: true, discarded: true };
      }
      const msg = memoryAddMessage({
        conversation_id: input.conversationId,
        comercio_id: input.comercioId,
        role: input.role,
        body: input.text.slice(0, 4000),
        sender_user_id: input.senderUserId || null,
        client_message_id: clientMessageId,
        payload: input.payload || {},
      });
      if (!msg) return { ok: false };
      memoryUpdateConversation(input.conversationId, {
        last_message_at: new Date().toISOString(),
        last_message_preview: previewText(input.text),
      });
      return { ok: true, messageId: msg.id };
    }

    const sb = getServiceSupabaseClient();
    if (
      input.role === 'assistant' &&
      input.attentionVersionAtStart != null
    ) {
      const { data: live } = await sb
        .from('chat_conversations')
        .select('status,attention_version')
        .eq('id', input.conversationId)
        .maybeSingle();
      if (
        live &&
        (live.status === 'human_handling' ||
          live.status === 'closed' ||
          Number(live.attention_version) !==
            Number(input.attentionVersionAtStart))
      ) {
        return { ok: true, discarded: true };
      }
    }

    const { data, error } = await sb
      .from('chat_messages')
      .upsert(
        {
          conversation_id: input.conversationId,
          comercio_id: input.comercioId,
          role: input.role,
          sender_user_id: input.senderUserId || null,
          body: input.text.slice(0, 4000),
          client_message_id: clientMessageId,
          payload: input.payload || {},
        },
        { onConflict: 'conversation_id,client_message_id', ignoreDuplicates: true },
      )
      .select('id')
      .maybeSingle();
    if (error) return { ok: false };

    await sb
      .from('chat_conversations')
      .update({
        last_message_at: new Date().toISOString(),
        last_message_preview: previewText(input.text),
        updated_at: new Date().toISOString(),
      })
      .eq('id', input.conversationId);

    void publishConversationEvent(input.comercioId, input.conversationId, {
      type: 'message_created',
      role: input.role,
    }).catch(() => {});

    return { ok: true, messageId: data?.id ? String(data.id) : undefined };
  } catch {
    return { ok: false };
  }
}

/**
 * Discreet alternate-contact note when a consumer asks for a human.
 * Does not promise an immediate reply if no staff is online.
 */
async function offerAlternateContactIfNeeded(input: {
  conversationId: string;
  comercioId: string;
  commerceName: string;
}) {
  const dest = isSupervisionMemoryEnabled()
    ? null
    : await resolveSupervisionWhatsapp(input.comercioId);
  const name = dest?.nombre || input.commerceName || 'el restaurante';
  const body = dest?.phone
    ? `El personal de ${name} puede unirse a este chat cuando esté disponible. Si necesitas ayuda ahora, también puedes escribir al WhatsApp del local: ${dest.phone}. No prometemos una respuesta humana inmediata.`
    : `El personal de ${name} puede unirse a este chat cuando esté disponible. No prometemos una respuesta humana inmediata; si el local publica WhatsApp en el menú, úsalo para contacto directo.`;

  await persistAssistantOrStaffMessage({
    conversationId: input.conversationId,
    comercioId: input.comercioId,
    role: 'system',
    text: body,
    clientMessageId: `sys_alt_contact_${input.conversationId}`,
  });
}

async function resolveSupervisionWhatsapp(
  comercioId: string,
): Promise<{ phone: string; nombre: string } | null> {
  const sb = getServiceSupabaseClient();
  const { data: row } = await sb
    .from('comercios')
    .select('nombre,whatsapp,branding_ia')
    .eq('id', comercioId)
    .maybeSingle();
  const cfg =
    (row?.branding_ia as { config_negocio?: Record<string, unknown> } | null)
      ?.config_negocio || {};
  const preferred = String(
    cfg.supervision_whatsapp ||
      cfg.notify_whatsapp ||
      cfg.whatsapp_avisos ||
      '',
  ).trim();
  const contacts = await resolveMerchantContacts(sb, comercioId);
  const phone = preferred || contacts.whatsapp;
  if (!phone) return null;
  // Hard reject platform support digits if ever misconfigured.
  const digits = phone.replace(/\D/g, '');
  if (digits === '584220451906') return null;
  return {
    phone,
    nombre: contacts.nombre || String(row?.nombre || 'Tu restaurante'),
  };
}

async function enqueueNewConversationNotify(input: {
  conversationId: string;
  comercioId: string;
  commerceName: string;
}) {
  const cfg = getChatSupervisionConfig();
  if (!cfg.wasenderNotify) return;
  const dedupeKey = `chat_supervision:new:${input.conversationId}`;

  if (isSupervisionMemoryEnabled()) {
    const inserted = memoryInsertEvent({
      conversation_id: input.conversationId,
      comercio_id: input.comercioId,
      event_type: 'new_conversation',
      dedupe_key: dedupeKey,
    });
    if (!inserted.ok) return;
    // Memory mode: mark prepared; do not hit WaSender unless explicitly enabled
    // outside e2e. Still exercise idempotency path.
    if ((process.env.CHAT_SUPERVISION_MEMORY_SEND_WASENDER || '').trim() !== '1') {
      memoryUpdateEvent(dedupeKey, { status: 'skipped', last_error: 'memory_mode' });
      return;
    }
  }

  const sb = getServiceSupabaseClient();

  if (!isSupervisionMemoryEnabled()) {
    const { error: dedupeErr } = await sb.from('chat_supervision_events').insert({
      conversation_id: input.conversationId,
      comercio_id: input.comercioId,
      event_type: 'new_conversation',
      dedupe_key: dedupeKey,
      channel: 'whatsapp',
      status: 'queued',
    });
    if (dedupeErr) {
      // Unique violation = already notified
      return;
    }
  }

  const dest = await resolveSupervisionWhatsapp(input.comercioId);
  if (!dest) {
    await sb
      .from('chat_supervision_events')
      .update({ status: 'skipped', last_error: 'no_supervision_whatsapp' })
      .eq('dedupe_key', dedupeKey);
    return;
  }

  const link = merchantConversationHref(input.conversationId);
  const text = [
    '🔔 *Nueva conversación en El Menú XFA*',
    '',
    `Un cliente ha iniciado una conversación con el asistente virtual de *${dest.nombre || input.commerceName}*.`,
    '',
    'El asistente ya está atendiendo automáticamente.',
    'Puedes revisar los mensajes en tiempo real e intervenir cuando quieras.',
    '',
    'Ver conversación:',
    link,
  ].join('\n');

  try {
    await sendWhatsappText(dest.phone, text, {
      source: 'chat-supervision',
      dedupeKey,
      comercioId: input.comercioId,
    });
    await sb
      .from('chat_supervision_events')
      .update({
        status: 'sent',
        meta: { attempts: 0, handed_to_wasender_queue: true },
        updated_at: new Date().toISOString(),
      })
      .eq('dedupe_key', dedupeKey);
  } catch (err) {
    await markSupervisionNotifyFailed(
      dedupeKey,
      err instanceof Error ? err.message.slice(0, 300) : 'send_failed',
    );
  }
}

async function enqueueNeedsAttentionNotify(input: {
  conversationId: string;
  comercioId: string;
  commerceName: string;
}) {
  const dedupeKey = `chat_supervision:attention:${input.conversationId}:${new Date()
    .toISOString()
    .slice(0, 13)}`; // at most hourly
  const sb = getServiceSupabaseClient();
  const { error } = await sb.from('chat_supervision_events').insert({
    conversation_id: input.conversationId,
    comercio_id: input.comercioId,
    event_type: 'needs_attention',
    dedupe_key: dedupeKey,
    channel: 'whatsapp',
    status: 'queued',
  });
  if (error) return;

  const dest = await resolveSupervisionWhatsapp(input.comercioId);
  if (!dest) {
    await sb
      .from('chat_supervision_events')
      .update({ status: 'skipped', last_error: 'no_supervision_whatsapp' })
      .eq('dedupe_key', dedupeKey);
    return;
  }
  const link = merchantConversationHref(input.conversationId);
  const text = [
    '🟠 *Conversación requiere atención*',
    '',
    `Un cliente pidió ayuda humana en *${dest.nombre || input.commerceName}*.`,
    '',
    'Ver conversación:',
    link,
  ].join('\n');
  try {
    await sendWhatsappText(dest.phone, text, {
      source: 'chat-supervision-attention',
      dedupeKey,
      comercioId: input.comercioId,
    });
    await sb
      .from('chat_supervision_events')
      .update({
        status: 'sent',
        meta: { attempts: 0, handed_to_wasender_queue: true },
        updated_at: new Date().toISOString(),
      })
      .eq('dedupe_key', dedupeKey);
  } catch (err) {
    await markSupervisionNotifyFailed(
      dedupeKey,
      err instanceof Error ? err.message.slice(0, 300) : 'send_failed',
    );
  }
}

async function markSupervisionNotifyFailed(dedupeKey: string, lastError: string) {
  const sb = getServiceSupabaseClient();
  const { data } = await sb
    .from('chat_supervision_events')
    .select('meta')
    .eq('dedupe_key', dedupeKey)
    .maybeSingle();
  const prev = (data?.meta as { attempts?: number } | null) || {};
  const attempts = Number(prev.attempts || 0) + 1;
  const nextRetry = nextSupervisionRetryAt(attempts);
  await sb
    .from('chat_supervision_events')
    .update({
      status: 'failed',
      last_error: lastError,
      meta: {
        ...prev,
        attempts,
        next_retry_at: nextRetry,
      },
      updated_at: new Date().toISOString(),
    })
    .eq('dedupe_key', dedupeKey);
}

/**
 * Re-queue failed supervision WhatsApp notifies with limited backoff.
 * Relies on wasender_message_queue for delivery retries once enqueue succeeds.
 */
export async function retryFailedSupervisionNotifies(comercioId: string) {
  if (!isSupervisionEnabledForCommerce(comercioId)) return;
  if (isSupervisionMemoryEnabled()) return;
  const cfg = getChatSupervisionConfig();
  if (!cfg.wasenderNotify) return;

  const sb = getServiceSupabaseClient();
  const { data: rows } = await sb
    .from('chat_supervision_events')
    .select('id,dedupe_key,event_type,conversation_id,meta,last_error')
    .eq('comercio_id', comercioId)
    .eq('status', 'failed')
    .in('event_type', ['new_conversation', 'needs_attention'])
    .order('updated_at', { ascending: true })
    .limit(5);

  for (const row of rows || []) {
    const meta = (row.meta as { attempts?: number; next_retry_at?: string }) || {};
    if (!shouldRetrySupervisionNotify(meta)) continue;

    const dest = await resolveSupervisionWhatsapp(comercioId);
    if (!dest) {
      await sb
        .from('chat_supervision_events')
        .update({
          status: 'skipped',
          last_error: 'no_supervision_whatsapp',
          updated_at: new Date().toISOString(),
        })
        .eq('dedupe_key', row.dedupe_key);
      continue;
    }

    const link = merchantConversationHref(String(row.conversation_id));
    const text =
      row.event_type === 'needs_attention'
        ? [
            '🟠 *Conversación requiere atención*',
            '',
            `Un cliente pidió ayuda humana en *${dest.nombre}*.`,
            '',
            'Ver conversación:',
            link,
          ].join('\n')
        : [
            '🔔 *Nueva conversación en El Menú XFA*',
            '',
            `Un cliente ha iniciado una conversación con el asistente virtual de *${dest.nombre}*.`,
            '',
            'El asistente ya está atendiendo automáticamente.',
            'Puedes revisar los mensajes en tiempo real e intervenir cuando quieras.',
            '',
            'Ver conversación:',
            link,
          ].join('\n');

    try {
      await sendWhatsappText(dest.phone, text, {
        source:
          row.event_type === 'needs_attention'
            ? 'chat-supervision-attention-retry'
            : 'chat-supervision-retry',
        dedupeKey: String(row.dedupe_key),
        comercioId,
      });
      await sb
        .from('chat_supervision_events')
        .update({
          status: 'sent',
          last_error: null,
          meta: {
            ...meta,
            handed_to_wasender_queue: true,
            retried_at: new Date().toISOString(),
          },
          updated_at: new Date().toISOString(),
        })
        .eq('dedupe_key', row.dedupe_key);
    } catch (err) {
      await markSupervisionNotifyFailed(
        String(row.dedupe_key),
        err instanceof Error ? err.message.slice(0, 300) : 'retry_failed',
      );
    }
  }
}

/**
 * Best-effort Realtime broadcast. If Realtime is unavailable, clients recover
 * via REST pagination — DB remains source of truth.
 */
export async function publishConversationEvent(
  comercioId: string,
  conversationId: string,
  event: Record<string, unknown>,
) {
  try {
    const sb = getServiceSupabaseClient();
    const channel = sb.channel(`commerce:${comercioId}:chat`, {
      config: { private: true },
    });
    await channel.subscribe();
    await channel.send({
      type: 'broadcast',
      event: 'chat',
      payload: {
        conversationId,
        v: 1,
        at: new Date().toISOString(),
        ...event,
      },
    });
    await sb.removeChannel(channel);
  } catch {
    // non-fatal
  }
}
