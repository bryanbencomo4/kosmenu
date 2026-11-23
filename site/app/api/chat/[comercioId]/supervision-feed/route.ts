import { NextResponse } from 'next/server';

import { loadPublicMenuByIdentifier } from '../../../menu/_lib/load-public-menu';
import { getServiceSupabaseClient } from '../../../_lib/supabase-server';
import { consumeRateLimit, getClientIp } from '../../../_lib/rate-limit';
import {
  hashConsumerSession,
  mintSupervisionFeedToken,
  verifySupervisionFeedToken,
} from '../../_lib/supervision';
import { isSupervisionEnabledForCommerce } from '../../_lib/supervision-config';
import {
  isSupervisionMemoryEnabled,
  memoryGetBySession,
  memoryListMessages,
} from '../../_lib/supervision-memory';

export const runtime = 'nodejs';

/**
 * Mint a fresh HMAC feed token for an existing consumer session.
 * Body: { sessionId } — sessionId stays off the query string.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ comercioId: string }> },
) {
  const ip = getClientIp(request);
  const rl = consumeRateLimit(`chat:sup-feed-token:${ip}`, 20, 60_000);
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
    return NextResponse.json({ ok: true, enabled: false, feedToken: null });
  }

  let sessionId = '';
  try {
    const body = (await request.json()) as { sessionId?: string };
    sessionId = String(body?.sessionId || '').trim();
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }
  if (!sessionId || sessionId.length > 80) {
    return NextResponse.json({ error: 'missing_session' }, { status: 400 });
  }

  if (isSupervisionMemoryEnabled()) {
    const conversation = memoryGetBySession(commerceId, sessionId);
    if (!conversation) {
      return NextResponse.json({ ok: true, enabled: true, feedToken: null });
    }
    return NextResponse.json({
      ok: true,
      enabled: true,
      feedToken: mintSupervisionFeedToken(commerceId, sessionId),
      conversationId: conversation.id,
    });
  }

  const sb = getServiceSupabaseClient();
  const hash = hashConsumerSession(commerceId, sessionId);
  const { data: conversation } = await sb
    .from('chat_conversations')
    .select('id')
    .eq('comercio_id', commerceId)
    .eq('consumer_session_hash', hash)
    .maybeSingle();
  if (!conversation) {
    return NextResponse.json({ ok: true, enabled: true, feedToken: null });
  }
  return NextResponse.json({
    ok: true,
    enabled: true,
    feedToken: mintSupervisionFeedToken(commerceId, sessionId),
    conversationId: conversation.id,
  });
}

/**
 * Consumer-scoped feed of new messages for an active supervised conversation.
 * Prefer X-Chat-Supervision-Feed-Token (HMAC, commerce+session+exp).
 * Legacy sessionId query still accepted for same-turn recovery only.
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
  const afterSeq = Number(url.searchParams.get('afterSeq') || 0);

  const menu = await loadPublicMenuByIdentifier(pathId);
  if (!menu) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  const commerceId = menu.resolvedComercioId;
  if (!isSupervisionEnabledForCommerce(commerceId)) {
    return NextResponse.json({ ok: true, enabled: false, messages: [] });
  }

  const headerToken = (
    request.headers.get('x-chat-supervision-feed-token') || ''
  ).trim();
  const allowSessionQuery =
    isSupervisionMemoryEnabled() ||
    /^(1|true|yes)$/i.test(
      (process.env.CHAT_SUPERVISION_FEED_ALLOW_SESSION_QUERY || '').trim(),
    );
  let sessionId = '';
  if (headerToken) {
    const verified = verifySupervisionFeedToken(headerToken, commerceId);
    if (!verified.ok) {
      return NextResponse.json(
        {
          error: 'invalid_feed_token',
          detail: 'error' in verified ? verified.error : 'invalid',
        },
        { status: 401 },
      );
    }
    sessionId = verified.sessionId;
  } else if (allowSessionQuery) {
    // MEMORY / explicit test only — production requires HMAC feed token.
    sessionId = (url.searchParams.get('sessionId') || '').trim();
  } else {
    return NextResponse.json(
      { error: 'missing_feed_token' },
      { status: 401 },
    );
  }
  if (!sessionId || sessionId.length > 80) {
    return NextResponse.json({ error: 'missing_session' }, { status: 400 });
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
