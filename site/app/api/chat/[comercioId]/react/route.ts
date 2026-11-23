import { NextResponse } from 'next/server';

import { loadPublicMenuByIdentifier } from '../../../menu/_lib/load-public-menu';
import { getServiceSupabaseClient } from '../../../_lib/supabase-server';
import { consumeRateLimit, getClientIp } from '../../../_lib/rate-limit';
import {
  hashConsumerSession,
  verifySupervisionFeedToken,
} from '../../_lib/supervision';
import { isSupervisionEnabledForCommerce } from '../../_lib/supervision-config';
import { applyMessageReaction } from '../../_lib/chat-presence-persist';
import {
  isSupervisionMemoryEnabled,
  memoryGetBySession,
} from '../../_lib/supervision-memory';

export const runtime = 'nodejs';

/**
 * Consumer emoji reaction on a supervised message.
 * Auth: X-Chat-Supervision-Feed-Token.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ comercioId: string }> },
) {
  const ip = getClientIp(request);
  const rl = consumeRateLimit(`chat:react:${ip}`, 40, 60_000);
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

  let messageId = '';
  let emoji = '';
  try {
    const body = (await request.json()) as {
      messageId?: string;
      emoji?: string;
    };
    messageId = String(body.messageId || '').trim();
    emoji = String(body.emoji || '').trim();
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }
  if (!messageId || !emoji) {
    return NextResponse.json({ error: 'invalid_react' }, { status: 400 });
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
    return NextResponse.json({ error: 'no_conversation' }, { status: 404 });
  }

  const result = await applyMessageReaction({
    conversationId,
    comercioId: commerceId,
    messageId,
    party: 'consumer',
    emoji,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true, reactions: result.reactions });
}
