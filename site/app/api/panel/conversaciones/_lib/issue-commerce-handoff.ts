/**
 * Merchant inbox → consumer commerce chatbot handoff.
 * Issues opaque code + URL. Does not send WhatsApp unless caller opts in later.
 */
import {
  buildWaHandoffUrl,
  WA_HANDOFF_COMMERCE_TTL_MS,
} from '../../../_lib/wa-handoff';
import { resolveWaHandoffStore } from '../../../_lib/wa-handoff-store';
import {
  sanitizeConversationContext,
  type ConversationContext,
  type ConversationContextItem,
} from '../../../_lib/conversation-context';

function extractItemsFromMessages(
  messages: Array<{ role?: string; body?: string | null }>,
): ConversationContextItem[] {
  const items: ConversationContextItem[] = [];
  const re =
    /(\d+)\s*(?:x\s*)?([A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9][\wÁÉÍÓÚÜÑáéíóúüñ\s-]{1,40})/gi;
  for (const m of messages.slice(-12)) {
    if (m.role !== 'consumer' && m.role !== 'user') continue;
    const text = String(m.body || '');
    let match: RegExpExecArray | null;
    re.lastIndex = 0;
    while ((match = re.exec(text)) && items.length < 8) {
      items.push({
        name: match[2].trim(),
        qty: Math.min(99, Number(match[1]) || 1),
      });
    }
  }
  return items;
}

export async function issueCommerceChatbotHandoff(input: {
  comercioId: string;
  conversationId: string;
  slug: string | null;
  businessName: string | null;
  messages: Array<{ role?: string; body?: string | null }>;
  publicSiteBaseUrl?: string;
}): Promise<{
  ok: true;
  url: string;
  code: string;
  expiresAtMs: number;
  payload: ConversationContext;
} | { ok: false; error: string }> {
  const slug = (input.slug || '').trim();
  if (!slug) {
    return { ok: false, error: 'missing_slug' };
  }
  const items = extractItemsFromMessages(input.messages);
  const lastConsumer = [...input.messages]
    .reverse()
    .find((m) => m.role === 'consumer' || m.role === 'user');
  const transcriptExcerpt = String(lastConsumer?.body || '')
    .trim()
    .slice(0, 500);
  const payload = sanitizeConversationContext({
    profile: 'commerce',
    comercioId: input.comercioId,
    candidateComercioId: input.comercioId,
    slug,
    businessNameDraft: input.businessName,
    summary: items.length
      ? `Pedido en curso: ${items.map((i) => `${i.qty || 1} ${i.name}`).join(', ')}`
      : transcriptExcerpt
        ? `Cliente escribió: ${transcriptExcerpt.slice(0, 160)}`
        : 'Continuar pedido desde el chat del restaurante',
    items: items.length ? items : null,
    transcriptExcerpt: transcriptExcerpt || null,
    conversationHint: transcriptExcerpt || null,
    openQuestions: ['¿Me confirmas tu dirección para el delivery?'],
    source: 'wa_restaurant_inbox',
    originConversationId: input.conversationId,
    intent: 'place_order',
  });

  try {
    const store = resolveWaHandoffStore();
    const record = await store.issue({
      destination: 'commerce_chatbot',
      payload,
      ttlMs: WA_HANDOFF_COMMERCE_TTL_MS,
    });
    const site = (
      input.publicSiteBaseUrl ||
      process.env.NEXT_PUBLIC_SITE_URL ||
      'https://elmenuxfa.com'
    ).replace(/\/$/, '');
    const url = buildWaHandoffUrl({
      destination: 'commerce_chatbot',
      code: record.code,
      consumerBaseUrl: `${site}/asistente`,
      businessAssistantBaseUrl: 'https://app.elmenuxfa.com/asistente',
      publicSiteBaseUrl: site,
      slug,
    });
    return {
      ok: true,
      url,
      code: record.code,
      expiresAtMs: record.expiresAtMs,
      payload,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'issue_failed',
    };
  }
}
