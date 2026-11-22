import { NextResponse } from 'next/server';

import { getServiceSupabaseClient } from '../../../_lib/supabase-server';
import { consumeRateLimit, getClientIp } from '../../../_lib/rate-limit';
import { requireMerchantConversationAccess } from '../_lib/auth';
import { isSupervisionEnabledForCommerce } from '../../../chat/_lib/supervision-config';
import {
  persistAssistantOrStaffMessage,
  publishConversationEvent,
} from '../../../chat/_lib/supervision';

export const runtime = 'nodejs';

async function loadConversation(conversationId: string) {
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
  const rl = consumeRateLimit(`panel:chat:get:${ip}`, 90, 60_000);
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

  return NextResponse.json({
    ok: true,
    conversation,
    messages: messages || [],
  });
}

/**
 * POST actions: take | return | close | message
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

  let body: { action?: string; text?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  const action = String(body.action || '').trim();
  const sb = getServiceSupabaseClient();

  if (action === 'take') {
    const { data, error } = await sb.rpc('chat_take_conversation', {
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
    const { data, error } = await sb.rpc('chat_return_to_assistant', {
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
    const { data, error } = await sb
      .from('chat_conversations')
      .update({
        status: 'closed',
        closed_at: new Date().toISOString(),
        attention_version: Number(conversation.attention_version || 1) + 1,
        updated_at: new Date().toISOString(),
      })
      .eq('id', conversationId)
      .eq('comercio_id', access.comercioId)
      .select('*')
      .single();
    if (error) {
      return NextResponse.json({ error: 'close_failed' }, { status: 503 });
    }
    void publishConversationEvent(access.comercioId, conversationId, {
      type: 'status_changed',
      status: 'closed',
    });
    return NextResponse.json({ ok: true, conversation: data });
  }

  if (action === 'message') {
    const text = String(body.text || '').trim();
    if (!text) {
      return NextResponse.json({ error: 'empty_message' }, { status: 400 });
    }
    if (String(conversation.status) !== 'human_handling') {
      return NextResponse.json({ error: 'not_in_human_mode' }, { status: 409 });
    }
    if (
      conversation.assigned_user_id &&
      String(conversation.assigned_user_id) !== access.user.id
    ) {
      // Allow other admins to send if assigned; soft allow for administrador.
      if (access.role !== 'administrador') {
        return NextResponse.json({ error: 'not_assignee' }, { status: 403 });
      }
    }
    const saved = await persistAssistantOrStaffMessage({
      conversationId,
      comercioId: access.comercioId,
      role: 'staff',
      text,
      senderUserId: access.user.id,
    });
    if (!saved.ok) {
      return NextResponse.json({ error: 'send_failed' }, { status: 503 });
    }
    return NextResponse.json({ ok: true, messageId: saved.messageId });
  }

  return NextResponse.json({ error: 'unknown_action' }, { status: 400 });
}
