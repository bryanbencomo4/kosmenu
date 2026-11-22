import { NextResponse } from 'next/server';

import { loadPublicMenuByIdentifier } from '../../../menu/_lib/load-public-menu';
import { getServiceSupabaseClient } from '../../../_lib/supabase-server';
import { consumeRateLimit, getClientIp } from '../../../_lib/rate-limit';
import { hashConsumerSession } from '../../_lib/supervision';
import { isSupervisionEnabledForCommerce } from '../../_lib/supervision-config';
import {
  isSupervisionMemoryEnabled,
  memoryGetBySession,
  memoryListMessages,
} from '../../_lib/supervision-memory';

export const runtime = 'nodejs';

/**
 * Consumer-scoped feed of new messages for an active supervised conversation.
 * Auth: knowledge of sessionId (HMAC-hashed); never lists other sessions.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ comercioId: string }> },
) {
  const ip = getClientIp(request);
  const rl = consumeRateLimit(`chat:sup-feed:${ip}`, 40, 60_000);
  if (!rl.ok) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  }

  const { comercioId: raw } = await context.params;
  const pathId = decodeURIComponent(raw || '').trim();
  const url = new URL(request.url);
  const sessionId = (url.searchParams.get('sessionId') || '').trim();
  const afterSeq = Number(url.searchParams.get('afterSeq') || 0);
  if (!sessionId || sessionId.length > 80) {
    return NextResponse.json({ error: 'missing_session' }, { status: 400 });
  }

  const menu = await loadPublicMenuByIdentifier(pathId);
  if (!menu) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  const commerceId = menu.resolvedComercioId;
  if (!isSupervisionEnabledForCommerce(commerceId)) {
    return NextResponse.json({ ok: true, enabled: false, messages: [] });
  }

  if (isSupervisionMemoryEnabled()) {
    const conversation = memoryGetBySession(commerceId, sessionId);
    if (!conversation) {
      return NextResponse.json({
        ok: true,
        enabled: true,
        conversation: null,
        messages: [],
        memory: true,
      });
    }
    const messages = memoryListMessages(
      conversation.id,
      Number.isFinite(afterSeq) ? afterSeq : 0,
      ['staff', 'system', 'assistant'],
    ).slice(0, 50);
    return NextResponse.json({
      ok: true,
      enabled: true,
      conversation: {
        id: conversation.id,
        status: conversation.status,
        attention_version: conversation.attention_version,
      },
      messages,
      memory: true,
    });
  }

  const sb = getServiceSupabaseClient();
  const hash = hashConsumerSession(commerceId, sessionId);
  const { data: conversation } = await sb
    .from('chat_conversations')
    .select('id,status,attention_version')
    .eq('comercio_id', commerceId)
    .eq('consumer_session_hash', hash)
    .maybeSingle();

  if (!conversation) {
    return NextResponse.json({
      ok: true,
      enabled: true,
      conversation: null,
      messages: [],
    });
  }

  let q = sb
    .from('chat_messages')
    .select('id,seq,role,body,created_at,payload')
    .eq('conversation_id', conversation.id)
    .in('role', ['staff', 'system', 'assistant'])
    .order('seq', { ascending: true })
    .limit(50);
  if (Number.isFinite(afterSeq) && afterSeq > 0) q = q.gt('seq', afterSeq);
  const { data: messages } = await q;

  return NextResponse.json({
    ok: true,
    enabled: true,
    conversation: {
      id: conversation.id,
      status: conversation.status,
      attention_version: conversation.attention_version,
    },
    messages: messages || [],
  });
}
