/**
 * Mirror local (client-side) chat UI turns into merchant supervision.
 * Used for deterministic carousels / hours / payments that never hit Gemini.
 *
 * Auth: X-Chat-Supervision-Feed-Token (preferred) or sessionId body.
 */
import { NextResponse } from 'next/server';

import { loadPublicMenuByIdentifier } from '../../../menu/_lib/load-public-menu';
import { consumeRateLimit, getClientIp } from '../../../_lib/rate-limit';
import {
  getConversationBySession,
  mintSupervisionFeedToken,
  persistAssistantOrStaffMessage,
  persistConsumerTurn,
  verifySupervisionFeedToken,
} from '../../_lib/supervision';
import { isSupervisionEnabledForCommerce } from '../../_lib/supervision-config';

export const runtime = 'nodejs';

type SyncTurn = {
  clientMessageId?: string;
  role?: string;
  text?: string;
  payload?: Record<string, unknown>;
};

const PAYLOAD_MAX = 1_400_000;

export async function POST(
  request: Request,
  context: { params: Promise<{ comercioId: string }> },
) {
  const ip = getClientIp(request);
  const rl = consumeRateLimit(`chat:sup-sync:${ip}`, 60, 60_000);
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
  const comercio = menu.comercio as {
    nombre?: string;
    whatsapp?: string | null;
  };

  let body: {
    sessionId?: string;
    turns?: SyncTurn[];
    commerceName?: string;
    consumerLabel?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }
  const consumerLabel =
    String(body.consumerLabel || '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 120) || null;

  const headerToken = (
    request.headers.get('x-chat-supervision-feed-token') || ''
  ).trim();

  let sessionId = '';
  if (headerToken) {
    const verified = verifySupervisionFeedToken(headerToken, commerceId);
    if (!verified.ok) {
      return NextResponse.json(
        { error: 'invalid_feed_token' },
        { status: 401 },
      );
    }
    sessionId = verified.sessionId;
  } else {
    // Local UI turns often run before Gemini mints a feed token.
    sessionId = String(body.sessionId || '').trim();
  }
  if (!sessionId || sessionId.length > 80) {
    return NextResponse.json({ error: 'missing_session' }, { status: 400 });
  }

  const turns = Array.isArray(body.turns) ? body.turns.slice(0, 8) : [];
  if (turns.length === 0) {
    return NextResponse.json({ error: 'empty_turns' }, { status: 400 });
  }

  const commerceName =
    String(body.commerceName || comercio.nombre || '').trim() || 'Comercio';

  let conversation = await getConversationBySession(commerceId, sessionId);
  let conversationId = conversation?.id || null;
  let attentionVersion = conversation?.attention_version ?? null;
  const saved: string[] = [];

  for (const turn of turns) {
    const role = String(turn.role || '').trim();
    const text = String(turn.text || '').trim();
    const clientMessageId = String(turn.clientMessageId || '').trim() || null;
    const payload =
      turn.payload &&
      typeof turn.payload === 'object' &&
      !Array.isArray(turn.payload)
        ? turn.payload
        : {};
    let payloadJson = '{}';
    try {
      payloadJson = JSON.stringify(payload);
    } catch {
      return NextResponse.json({ error: 'invalid_payload' }, { status: 400 });
    }
    if (payloadJson.length > PAYLOAD_MAX) {
      return NextResponse.json({ error: 'payload_too_large' }, { status: 413 });
    }

    if (role === 'consumer') {
      if (!text) continue;
      const persisted = await persistConsumerTurn({
        comercioId: commerceId,
        commerceName,
        sessionId,
        text,
        clientMessageId,
        payload,
        publicWhatsapp: comercio.whatsapp || null,
        consumerLabel,
      });
      if (persisted.ok && persisted.conversationId) {
        conversationId = persisted.conversationId;
        attentionVersion = persisted.attentionVersion ?? attentionVersion;
        if (persisted.messageId) saved.push(persisted.messageId);
      }
      continue;
    }

    if (role === 'assistant') {
      if (!text && Object.keys(payload).length === 0) continue;
      if (!conversationId) {
        conversation = await getConversationBySession(commerceId, sessionId);
        conversationId = conversation?.id || null;
        attentionVersion = conversation?.attention_version ?? attentionVersion;
      }
      if (!conversationId) {
        // No conversation yet — skip assistant until a consumer turn opens it.
        continue;
      }
      const result = await persistAssistantOrStaffMessage({
        conversationId,
        comercioId: commerceId,
        role: 'assistant',
        text: text || ' ',
        clientMessageId,
        payload,
        attentionVersionAtStart: attentionVersion,
      });
      if (result.ok && result.messageId) saved.push(result.messageId);
    }
  }

  const feedToken = mintSupervisionFeedToken(commerceId, sessionId);
  return NextResponse.json({
    ok: true,
    enabled: true,
    conversationId,
    feedToken,
    saved: saved.length,
  });
}
