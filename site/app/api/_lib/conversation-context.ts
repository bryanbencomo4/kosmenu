/**
 * Shared conversation context schema for WA ↔ web handoffs.
 * Non-sensitive only — never phones, passwords, or auth tokens.
 */

export type ConversationProfile = 'consumer_discovery' | 'commerce' | 'business';

export type ConversationContextSource =
  | 'wa_platform'
  | 'wa_restaurant_inbox'
  | 'discovery'
  | 'direct';

export type ConversationContextItem = {
  name: string;
  qty?: number;
  size?: string | null;
  notes?: string | null;
};

export type ConversationContext = {
  profile?: ConversationProfile | null;
  comercioId?: string | null;
  slug?: string | null;
  intent?: string | null;
  summary?: string | null;
  query?: string | null;
  zone?: string | null;
  pendingOperation?: string | null;
  candidateComercioId?: string | null;
  businessNameDraft?: string | null;
  conversationHint?: string | null;
  items?: ConversationContextItem[] | null;
  preferences?: string | null;
  openQuestions?: string[] | null;
  transcriptExcerpt?: string | null;
  source?: ConversationContextSource | null;
  originConversationId?: string | null;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function clip(v: string | null | undefined, n: number): string | null {
  const s = (v ?? '').trim();
  if (!s) return null;
  return s.slice(0, n);
}

function sanitizeItems(
  items: ConversationContextItem[] | null | undefined,
): ConversationContextItem[] | null {
  if (!Array.isArray(items) || items.length === 0) return null;
  const out: ConversationContextItem[] = [];
  for (const raw of items.slice(0, 12)) {
    if (!raw || typeof raw !== 'object') continue;
    const name = clip(String((raw as ConversationContextItem).name || ''), 80);
    if (!name) continue;
    const qtyRaw = Number((raw as ConversationContextItem).qty);
    const qty =
      Number.isFinite(qtyRaw) && qtyRaw > 0 ? Math.min(99, Math.round(qtyRaw)) : undefined;
    out.push({
      name,
      qty,
      size: clip((raw as ConversationContextItem).size, 40),
      notes: clip((raw as ConversationContextItem).notes, 80),
    });
  }
  return out.length ? out : null;
}

function sanitizeOpenQuestions(
  qs: string[] | null | undefined,
): string[] | null {
  if (!Array.isArray(qs) || qs.length === 0) return null;
  const out = qs
    .map((q) => clip(String(q || ''), 120))
    .filter((q): q is string => Boolean(q))
    .slice(0, 6);
  return out.length ? out : null;
}

/** Sanitize any handoff / continuity payload into ConversationContext. */
export function sanitizeConversationContext(
  raw: Partial<ConversationContext> | null | undefined,
): ConversationContext {
  const comercioId = clip(raw?.comercioId, 64);
  const candidateComercioId = clip(raw?.candidateComercioId, 64);
  const id =
    comercioId && UUID_RE.test(comercioId)
      ? comercioId
      : candidateComercioId && UUID_RE.test(candidateComercioId)
        ? candidateComercioId
        : null;
  const profile = raw?.profile;
  const source = raw?.source;
  return {
    profile:
      profile === 'consumer_discovery' ||
      profile === 'commerce' ||
      profile === 'business'
        ? profile
        : null,
    comercioId: id,
    slug: clip(raw?.slug, 80),
    intent: clip(raw?.intent, 64),
    summary: clip(raw?.summary, 400),
    query: clip(raw?.query, 120),
    zone: clip(raw?.zone, 80),
    pendingOperation: clip(raw?.pendingOperation, 80),
    candidateComercioId:
      candidateComercioId && UUID_RE.test(candidateComercioId)
        ? candidateComercioId
        : id,
    businessNameDraft: clip(raw?.businessNameDraft, 80),
    conversationHint: clip(raw?.conversationHint, 200),
    items: sanitizeItems(raw?.items),
    preferences: clip(raw?.preferences, 160),
    openQuestions: sanitizeOpenQuestions(raw?.openQuestions),
    transcriptExcerpt: clip(raw?.transcriptExcerpt, 500),
    source:
      source === 'wa_platform' ||
      source === 'wa_restaurant_inbox' ||
      source === 'discovery' ||
      source === 'direct'
        ? source
        : null,
    originConversationId: clip(raw?.originConversationId, 80),
  };
}

/** Build the first assistant line when commerce handoff has order context. */
export function buildCommerceHandoffGreeting(ctx: ConversationContext): string {
  const shop = ctx.businessNameDraft || 'tu restaurante';
  const items = ctx.items || [];
  if (items.length) {
    const list = items
      .map((it) => {
        const qty = it.qty && it.qty > 1 ? `${it.qty} ` : '';
        const size = it.size ? ` ${it.size}` : '';
        return `${qty}${it.name}${size}`.trim();
      })
      .join(', ');
    const open =
      ctx.openQuestions && ctx.openQuestions.length
        ? ` ${ctx.openQuestions[0]}`
        : ' ¿Me confirmas tu dirección para el delivery?';
    return `¡Hola! 👋 Ya tengo tu solicitud de *${shop}*. Vamos con ${list}.${open}`;
  }
  if (ctx.summary) {
    return `¡Hola! 👋 Ya traigo el contexto de *${shop}*: ${ctx.summary}. ¿Seguimos?`;
  }
  if (ctx.transcriptExcerpt || ctx.conversationHint) {
    const hint = ctx.transcriptExcerpt || ctx.conversationHint;
    return `¡Hola! 👋 Continuamos desde WhatsApp con *${shop}*. Apunté: “${hint}”. ¿Lo armamos?`;
  }
  return `¡Hola! 👋 Te conecté con el asistente de *${shop}*. ¿Qué deseas pedir?`;
}

export const COMMERCE_HANDOFF_SESSION_PREFIX = 'elmenuxfa:commerce-handoff-v1:';
export const BUSINESS_HANDOFF_SESSION_KEY = 'elmenuxfa:business-handoff-v1';
export const DISCOVERY_HANDOFF_SESSION_KEY = 'elmenuxfa:discovery-handoff-v1';
