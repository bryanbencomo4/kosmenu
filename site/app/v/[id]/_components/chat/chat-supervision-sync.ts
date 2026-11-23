import {
  ensureChatSessionId,
  saveSupervisionFeedToken,
} from '../../../../_lib/chatbot-session';
import type { ChatMessage } from './chat-types';
import { chatMessageToSupervisionPayload } from './chat-supervision-payload';

export type SupervisionSyncRefs = {
  feedTokenRef: { current: string | null };
  conversationIdRef: { current: string | null };
};

/**
 * Best-effort mirror of a local (non-Gemini) turn into merchant supervision.
 * Never throws; safe to fire-and-forget from UI handlers.
 */
export async function syncLocalSupervisionTurn(input: {
  comercioId: string;
  businessName: string;
  refs: SupervisionSyncRefs;
  consumerText?: string;
  consumerMessageId?: string;
  assistant: ChatMessage;
  onWatch?: () => void;
}): Promise<void> {
  try {
    const sessionId = ensureChatSessionId(input.comercioId);
    const token = input.refs.feedTokenRef.current;
    const turns: Array<{
      role: string;
      text: string;
      clientMessageId: string;
      payload?: Record<string, unknown>;
    }> = [];

    if (input.consumerText?.trim()) {
      turns.push({
        role: 'consumer',
        text: input.consumerText.trim(),
        clientMessageId:
          input.consumerMessageId || `c_${input.assistant.id}`,
      });
    }

    turns.push({
      role: 'assistant',
      text: input.assistant.text || ' ',
      clientMessageId: input.assistant.id,
      payload: chatMessageToSupervisionPayload(input.assistant),
    });

    const res = await fetch(
      `/api/chat/${encodeURIComponent(input.comercioId)}/supervision-sync`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'X-Chat-Supervision-Feed-Token': token } : {}),
        },
        body: JSON.stringify({
          sessionId,
          commerceName: input.businessName,
          turns,
        }),
        cache: 'no-store',
      },
    );
    const data = (await res.json().catch(() => null)) as {
      feedToken?: string | null;
      conversationId?: string | null;
      enabled?: boolean;
    } | null;
    if (!data || data.enabled === false) return;
    if (data.feedToken) {
      input.refs.feedTokenRef.current = data.feedToken;
      saveSupervisionFeedToken(input.comercioId, data.feedToken);
    }
    if (data.conversationId) {
      input.refs.conversationIdRef.current = data.conversationId;
      input.onWatch?.();
    }
  } catch {
    /* supervision optional */
  }
}
