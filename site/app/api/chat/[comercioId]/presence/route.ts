import { NextResponse } from 'next/server';

import { loadPublicMenuByIdentifier } from '../../../menu/_lib/load-public-menu';
import { getServiceSupabaseClient } from '../../../_lib/supabase-server';
import { consumeRateLimit, getClientIp } from '../../../_lib/rate-limit';
import {
  hashConsumerSession,
  updateConversationConsumerLabel,
  verifySupervisionFeedToken,
} from '../../_lib/supervision';
import { isSupervisionEnabledForCommerce } from '../../_lib/supervision-config';
import {
  applyConversationPresence,
  loadConversationPresence,
} from '../../_lib/chat-presence-persist';
import { isPeerTyping } from '../../_lib/chat-presence';
import {
  isSupervisionMemoryEnabled,
  memoryGetBySession,
} from '../../_lib/supervision-memory';

export const runtime = 'nodejs';

/**
 * Consumer typing + read receipts for supervised chats.
 * Auth: X-Chat-Supervision-Feed-Token (same as feed).
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ comercioId: string }> },
) {
  const ip = getClientIp(request);
  const rl = consumeRateLimit(`chat:presence:${ip}`, 60, 60_000);
  if (!rl.ok) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  }

  const { comercioId: raw } = await context.params;
  const pathId = decodeURIComponent(raw || '').trim();
  const menu = await loadPublicMenuByIdentifier(pathId);
  if (!menu) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  const commerceId = menu.resolvedComercioId;
  if (!isSupervisionEnabledForCommerce(commerceId)) {
    return NextResponse.json({ ok: true, enabled: false });
  }

  const headerToken = (
    request.headers.get('x-chat-supervision-feed-token') || ''
  ).trim();
  let sessionId = '';
  let typing: boolean | undefined;
  let readUpToSeq: number | undefined;
  let consumerLabel: string | undefined;
  try {
    const body = (await request.json()) as {
      typing?: boolean;
      readUpToSeq?: number;
      sessionId?: string;
      consumerLabel?: string;
    };
    if (typeof body.typing === 'boolean') typing = body.typing;
    if (
      typeof body.readUpToSeq === 'number' &&
      Number.isFinite(body.readUpToSeq)
    ) {
      readUpToSeq = body.readUpToSeq;
    }
    sessionId = String(body.sessionId || '').trim();
    const label = String(body.consumerLabel || '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 120);
    if (label) consumerLabel = label;
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }
  if (headerToken) {
    const verified = verifySupervisionFeedToken(headerToken, commerceId);
    if (!verified.ok) {
      return NextResponse.json({ error: 'invalid_feed_token' }, { status: 401 });
    }
    sessionId = verified.sessionId;
  }
  if (!sessionId || sessionId.length > 80) {
    return NextResponse.json({ error: 'missing_session' }, { status: 400 });
  }

  let conversationId: string | null = null;
  if (isSupervisionMemoryEnabled()) {
    conversationId = memoryGetBySession(commerceId, sessionId)?.id || null;
  } else {
    const sb = getServiceSupabaseClient();
    const hash = hashConsumerSession(commerceId, sessionId);
    const { data } = await sb
      .from('chat_conversations')
      .select('id')
      .eq('comercio_id', commerceId)
      .eq('consumer_session_hash', hash)
      .maybeSingle();
    conversationId = data?.id ? String(data.id) : null;
  }
  if (consumerLabel && sessionId) {
    await updateConversationConsumerLabel({
      comercioId: commerceId,
      sessionId,
      consumerLabel,
    });
  }

  if (!conversationId) {
    return NextResponse.json({ ok: true, enabled: true, conversation: null });
  }

  const state = await applyConversationPresence({
    conversationId,
    comercioId: commerceId,
    party: 'consumer',
    typing,
    readUpToSeq,
  });

  return NextResponse.json({
    ok: true,
    enabled: true,
    peerTyping: isPeerTyping(state, 'consumer'),
    staffLastReadSeq: state.staffLastReadSeq,
    consumerLastReadSeq: state.consumerLastReadSeq,
  });
}

export async function GET(
  request: Request,
  context: { params: Promise<{ comercioId: string }> },
) {
  const ip = getClientIp(request);
  const rl = consumeRateLimit(`chat:presence-get:${ip}`, 40, 60_000);
  if (!rl.ok) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  }

  const { comercioId: raw } = await context.params;
  const pathId = decodeURIComponent(raw || '').trim();
  const menu = await loadPublicMenuByIdentifier(pathId);
  if (!menu) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  const commerceId = menu.resolvedComercioId;
  if (!isSupervisionEnabledForCommerce(commerceId)) {
    return NextResponse.json({ ok: true, enabled: false });
  }

  const headerToken = (
    request.headers.get('x-chat-supervision-feed-token') || ''
  ).trim();
  if (!headerToken) {
    return NextResponse.json({ error: 'missing_feed_token' }, { status: 401 });
  }
  const verified = verifySupervisionFeedToken(headerToken, commerceId);
  if (!verified.ok) {
    return NextResponse.json({ error: 'invalid_feed_token' }, { status: 401 });
  }

  let conversationId: string | null = null;
  if (isSupervisionMemoryEnabled()) {
    conversationId =
      memoryGetBySession(commerceId, verified.sessionId)?.id || null;
  } else {
    const sb = getServiceSupabaseClient();
    const hash = hashConsumerSession(commerceId, verified.sessionId);
    const { data } = await sb
      .from('chat_conversations')
      .select('id')
      .eq('comercio_id', commerceId)
      .eq('consumer_session_hash', hash)
      .maybeSingle();
    conversationId = data?.id ? String(data.id) : null;
  }
  if (!conversationId) {
    return NextResponse.json({ ok: true, enabled: true, peerTyping: false });
  }
  const state = await loadConversationPresence({
    conversationId,
    comercioId: commerceId,
  });
  return NextResponse.json({
    ok: true,
    enabled: true,
    peerTyping: isPeerTyping(state, 'consumer'),
    staffLastReadSeq: state.staffLastReadSeq,
    consumerLastReadSeq: state.consumerLastReadSeq,
  });
}
