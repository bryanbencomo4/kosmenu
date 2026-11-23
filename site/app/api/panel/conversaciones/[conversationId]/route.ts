import { NextResponse } from 'next/server';

import { getServiceSupabaseClient } from '../../../_lib/supabase-server';
import { consumeRateLimit, getClientIp } from '../../../_lib/rate-limit';
import { requireMerchantConversationAccess } from '../_lib/auth';
import { canSendStaffMessage } from '../_lib/staff-authz';
import {
  getChatSupervisionConfig,
  isSupervisionEnabledForCommerce,
} from '../../../chat/_lib/supervision-config';

function supervisionFlagsPayload(comercioId: string) {
  const cfg = getChatSupervisionConfig();
  return {
    enabled: isSupervisionEnabledForCommerce(comercioId),
    human_takeover: cfg.humanTakeover,
    wasender_notify: cfg.wasenderNotify,
  };
}
import {
  persistAssistantOrStaffMessage,
  publishConversationEvent,
} from '../../../chat/_lib/supervision';
import {
  isSupervisionMemoryEnabled,
  memoryGetConversation,
  memoryListMessages,
  memoryReturnToAssistant,
  memoryTakeConversation,
  memoryUpdateConversation,
} from '../../../chat/_lib/supervision-memory';

export const runtime = 'nodejs';

async function loadConversation(conversationId: string) {
  if (isSupervisionMemoryEnabled()) {
    return memoryGetConversation(conversationId) as Record<string, unknown> | null;
  }
  const sb = getServiceSupabaseClient();
  const { data, error } = await sb
    .from('chat_conversations')
    .select('*')
    .eq('id', conversationId)
    .maybeSingle();
  if (error || !data) return null;
  return data as Record<string, unknown>;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ conversationId: string }> },
) {
  const ip = getClientIp(request);
  // Inbox poll + Realtime recovery can burst; keep generous for staff sessions.
  const rl = consumeRateLimit(`panel:chat:get:${ip}`, 180, 60_000);
  if (!rl.ok) return NextResponse.json({ error: 'rate_limited' }, { status: 429 });

  const { conversationId: raw } = await context.params;
  const conversationId = decodeURIComponent(raw || '').trim();
  const conversation = await loadConversation(conversationId);
  if (!conversation) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  const access = await requireMerchantConversationAccess(
    request,
    String(conversation.comercio_id),
  );
  if ('error' in access) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  if (!isSupervisionEnabledForCommerce(access.comercioId)) {
    return NextResponse.json({ error: 'supervision_disabled' }, { status: 403 });
  }

  const url = new URL(request.url);
  const afterSeq = Number(url.searchParams.get('afterSeq') || 0);

  if (isSupervisionMemoryEnabled()) {
    memoryUpdateConversation(conversationId, { unread_merchant_count: 0 });
    void publishConversationEvent(access.comercioId, conversationId, {
      type: 'unread_cleared',
    });
    return NextResponse.json({
      ok: true,
      conversation,
      messages: memoryListMessages(
        conversationId,
        Number.isFinite(afterSeq) ? afterSeq : 0,
      ).slice(0, 100),
      flags: supervisionFlagsPayload(access.comercioId),
      memory: true,
    });
  }

  const sb = getServiceSupabaseClient();
  let q = sb
    .from('chat_messages')
    .select('id,seq,role,sender_user_id,body,payload,created_at,client_message_id')
    .eq('conversation_id', conversationId)
    .order('seq', { ascending: true })
    .limit(100);
  if (Number.isFinite(afterSeq) && afterSeq > 0) {
    q = q.gt('seq', afterSeq);
  }
  const { data: messages, error } = await q;
  if (error) {
    return NextResponse.json({ error: 'messages_failed' }, { status: 503 });
  }

  await sb
    .from('chat_conversations')
    .update({ unread_merchant_count: 0 })
    .eq('id', conversationId)
    .eq('comercio_id', access.comercioId);

  void publishConversationEvent(access.comercioId, conversationId, {
    type: 'unread_cleared',
  });

  return NextResponse.json({
    ok: true,
    conversation,
    messages: messages || [],
    flags: supervisionFlagsPayload(access.comercioId),
  });
}

/**
 * POST actions: take | return | message
 * (close/archive intentionally disabled — merchants keep conversation history)
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ conversationId: string }> },
) {
  const ip = getClientIp(request);
  const rl = consumeRateLimit(`panel:chat:act:${ip}`, 40, 60_000);
  if (!rl.ok) return NextResponse.json({ error: 'rate_limited' }, { status: 429 });

  const { conversationId: raw } = await context.params;
  const conversationId = decodeURIComponent(raw || '').trim();
  const conversation = await loadConversation(conversationId);
  if (!conversation) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  const access = await requireMerchantConversationAccess(
    request,
    String(conversation.comercio_id),
  );
  if ('error' in access) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  if (!isSupervisionEnabledForCommerce(access.comercioId)) {
    return NextResponse.json({ error: 'supervision_disabled' }, { status: 403 });
  }

  let body: {
    action?: string;
    text?: string;
    payload?: Record<string, unknown>;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  const action = String(body.action || '').trim();
  const humanActions = new Set(['take', 'return', 'message']);
  if (humanActions.has(action) && !getChatSupervisionConfig().humanTakeover) {
    return NextResponse.json(
      { error: 'human_takeover_disabled' },
      { status: 403 },
    );
  }
  const sb = isSupervisionMemoryEnabled() ? null : getServiceSupabaseClient();

  if (action === 'take') {
    if (isSupervisionMemoryEnabled()) {
      const data = memoryTakeConversation(conversationId, access.user.id);
      if (!data) {
        return NextResponse.json({ error: 'conflict' }, { status: 409 });
      }
      await persistAssistantOrStaffMessage({
        conversationId,
        comercioId: access.comercioId,
        role: 'system',
        text: 'Un miembro del restaurante se ha unido a la conversación 😊',
        senderUserId: access.user.id,
        clientMessageId: `sys_take_${conversationId}_${data.attention_version}`,
      });
      void publishConversationEvent(access.comercioId, conversationId, {
        type: 'status_changed',
        status: 'human_handling',
      });
      return NextResponse.json({ ok: true, conversation: data, memory: true });
    }
    const { data, error } = await sb!.rpc('chat_take_conversation', {
      p_conversation_id: conversationId,
      p_user_id: access.user.id,
    });
    if (error) {
      return NextResponse.json(
        { error: error.message.includes('takeover_conflict') ? 'conflict' : 'take_failed' },
        { status: error.message.includes('takeover_conflict') ? 409 : 503 },
      );
    }
    await persistAssistantOrStaffMessage({
      conversationId,
      comercioId: access.comercioId,
      role: 'system',
      text: 'Un miembro del restaurante se ha unido a la conversación 😊',
      senderUserId: access.user.id,
      clientMessageId: `sys_take_${conversationId}_${data?.attention_version || Date.now()}`,
    });
    void publishConversationEvent(access.comercioId, conversationId, {
      type: 'status_changed',
      status: 'human_handling',
    });
    return NextResponse.json({ ok: true, conversation: data });
  }

  if (action === 'return') {
    if (isSupervisionMemoryEnabled()) {
      const data = memoryReturnToAssistant(conversationId);
      if (!data) {
        return NextResponse.json({ error: 'conflict' }, { status: 409 });
      }
      await persistAssistantOrStaffMessage({
        conversationId,
        comercioId: access.comercioId,
        role: 'system',
        text: 'El asistente virtual vuelve a atender esta conversación.',
        senderUserId: access.user.id,
        clientMessageId: `sys_return_${conversationId}_${data.attention_version}`,
      });
      void publishConversationEvent(access.comercioId, conversationId, {
        type: 'status_changed',
        status: 'ai_handling',
      });
      return NextResponse.json({ ok: true, conversation: data, memory: true });
    }
    const { data, error } = await sb!.rpc('chat_return_to_assistant', {
      p_conversation_id: conversationId,
      p_user_id: access.user.id,
    });
    if (error) {
      return NextResponse.json(
        { error: error.message.includes('return_conflict') ? 'conflict' : 'return_failed' },
        { status: error.message.includes('return_conflict') ? 409 : 503 },
      );
    }
    await persistAssistantOrStaffMessage({
      conversationId,
      comercioId: access.comercioId,
      role: 'system',
      text: 'El asistente virtual vuelve a atender esta conversación.',
      senderUserId: access.user.id,
      clientMessageId: `sys_return_${conversationId}_${data?.attention_version || Date.now()}`,
    });
    void publishConversationEvent(access.comercioId, conversationId, {
      type: 'status_changed',
      status: 'ai_handling',
    });
    return NextResponse.json({ ok: true, conversation: data });
  }

  if (action === 'close') {
    return NextResponse.json(
      {
        error: 'close_disabled',
        message:
          'Archivar o cerrar chats está desactivado para conservar el historial con el cliente.',
      },
      { status: 410 },
    );
  }

  if (action === 'presence') {
    const typing =
      typeof (body as { typing?: unknown }).typing === 'boolean'
        ? Boolean((body as { typing?: boolean }).typing)
        : undefined;
    const readUpToSeq = Number(
      (body as { readUpToSeq?: unknown }).readUpToSeq,
    );
    const { applyConversationPresence } = await import(
      '../../../chat/_lib/chat-presence-persist'
    );
    const state = await applyConversationPresence({
      conversationId,
      comercioId: access.comercioId,
      party: 'staff',
      typing,
      readUpToSeq: Number.isFinite(readUpToSeq) ? readUpToSeq : undefined,
    });
    return NextResponse.json({
      ok: true,
      peerTyping: state.consumerTypingUntil > Date.now(),
      consumerLastReadSeq: state.consumerLastReadSeq,
      staffLastReadSeq: state.staffLastReadSeq,
    });
  }

  if (action === 'react') {
    const messageId = String(
      (body.payload as { messageId?: unknown } | undefined)?.messageId ||
        (body as { messageId?: unknown }).messageId ||
        '',
    ).trim();
    const emoji = String(
      (body.payload as { emoji?: unknown } | undefined)?.emoji ||
        (body as { emoji?: unknown }).emoji ||
        '',
    ).trim();
    if (!messageId || !emoji) {
      return NextResponse.json({ error: 'invalid_react' }, { status: 400 });
    }
    const { applyMessageReaction } = await import(
      '../../../chat/_lib/chat-presence-persist'
    );
    const result = await applyMessageReaction({
      conversationId,
      comercioId: access.comercioId,
      messageId,
      party: 'staff',
      emoji,
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({ ok: true, reactions: result.reactions });
  }

  if (action === 'message') {
    const text = String(body.text || '').trim();
    const payload =
      body.payload && typeof body.payload === 'object' && !Array.isArray(body.payload)
        ? body.payload
        : {};
    const hasMedia = Array.isArray(payload.attachments)
      ? payload.attachments.length > 0
      : Boolean(payload.voiceUrl || payload.location);
    if (!text && !hasMedia) {
      return NextResponse.json({ error: 'empty_message' }, { status: 400 });
    }
    let payloadJson = '{}';
    try {
      payloadJson = JSON.stringify(payload);
    } catch {
      return NextResponse.json({ error: 'invalid_payload' }, { status: 400 });
    }
    // Data-URL media lives in jsonb; keep a hard ceiling for serverless/DB.
    if (payloadJson.length > 1_400_000) {
      return NextResponse.json({ error: 'payload_too_large' }, { status: 413 });
    }
    if (String(conversation.status) !== 'human_handling') {
      return NextResponse.json({ error: 'not_in_human_mode' }, { status: 409 });
    }
    if (
      !canSendStaffMessage({
        assignedUserId: conversation.assigned_user_id
          ? String(conversation.assigned_user_id)
          : null,
        actorUserId: access.user.id,
        role: access.role,
      })
    ) {
      return NextResponse.json({ error: 'not_assignee' }, { status: 403 });
    }
    const saved = await persistAssistantOrStaffMessage({
      conversationId,
      comercioId: access.comercioId,
      role: 'staff',
      text: text || '📎 Adjunto',
      senderUserId: access.user.id,
      payload,
    });
    if (!saved.ok) {
      return NextResponse.json({ error: 'send_failed' }, { status: 503 });
    }
    return NextResponse.json({ ok: true, messageId: saved.messageId });
  }

  return NextResponse.json({ error: 'unknown_action' }, { status: 400 });
}
