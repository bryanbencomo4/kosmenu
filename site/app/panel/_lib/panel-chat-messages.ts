import { recoverReplyToFromPrefixedBody } from '../../v/[id]/_components/chat/chat-gestures';
import type {
  ChatAttachment,
  ChatCartActionData,
  ChatCatalogCategory,
  ChatMessage,
  ChatProductCardData,
  ChatReaction,
  ChatReplyRef,
} from '../../v/[id]/_components/chat/chat-types';
import type { ChatContactCardData } from '../../v/[id]/_components/chat/chat-contact';
import type { ChatHoursSnapshot } from '../../v/[id]/_components/chat/chat-hours';
import type { ChatPaymentMethod } from '../../v/[id]/_components/chat/chat-payments';

export type PanelMessageRow = {
  id: string;
  seq: number;
  role: string;
  body: string;
  created_at: string;
  payload?: Record<string, unknown> | null;
};

/** Max JSON size for staff media payload (data URLs). */
export const PANEL_MESSAGE_PAYLOAD_MAX_CHARS = 1_400_000;

function asProductCards(value: unknown): ChatProductCardData[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (c): c is ChatProductCardData =>
      Boolean(c) &&
      typeof c === 'object' &&
      typeof (c as ChatProductCardData).product_id === 'string' &&
      typeof (c as ChatProductCardData).name === 'string',
  );
}

function asCartActions(value: unknown): ChatCartActionData[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (a): a is ChatCartActionData =>
      Boolean(a) &&
      typeof a === 'object' &&
      typeof (a as { type?: unknown }).type === 'string',
  );
}

function asCategoryCards(value: unknown): ChatCatalogCategory[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (c): c is ChatCatalogCategory =>
      Boolean(c) &&
      typeof c === 'object' &&
      typeof (c as ChatCatalogCategory).id === 'string' &&
      typeof (c as ChatCatalogCategory).name === 'string',
  );
}

function asAttachments(value: unknown): ChatAttachment[] {
  if (!Array.isArray(value)) return [];
  return value.filter((a): a is ChatAttachment => {
    if (!a || typeof a !== 'object') return false;
    const row = a as ChatAttachment;
    return (
      typeof row.id === 'string' &&
      (row.kind === 'image' || row.kind === 'file' || row.kind === 'audio') &&
      typeof row.url === 'string' &&
      row.url.length > 0
    );
  });
}

function asLocation(
  value: unknown,
): ChatMessage['location'] | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const loc = value as Record<string, unknown>;
  const lat = Number(loc.lat);
  const lng = Number(loc.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return undefined;
  return {
    lat,
    lng,
    label: typeof loc.label === 'string' ? loc.label : undefined,
    kind:
      loc.kind === 'business' || loc.kind === 'customer' ? loc.kind : undefined,
    address: typeof loc.address === 'string' ? loc.address : null,
    mapsUrl: typeof loc.mapsUrl === 'string' ? loc.mapsUrl : null,
    directionsUrl:
      typeof loc.directionsUrl === 'string' ? loc.directionsUrl : null,
  };
}

/**
 * Structured UI fields stored on supervision `chat_messages.payload`
 * (products, media, location) → ChatMessage options.
 */
function asReplyTo(value: unknown): ChatReplyRef | null {
  if (!value || typeof value !== 'object') return null;
  const r = value as Record<string, unknown>;
  const messageId = typeof r.messageId === 'string' ? r.messageId.trim() : '';
  const preview = typeof r.preview === 'string' ? r.preview.trim() : '';
  const role = r.role;
  if (!messageId || !preview) return null;
  if (role !== 'user' && role !== 'assistant' && role !== 'system') return null;
  const kindRaw = typeof r.kind === 'string' ? r.kind : undefined;
  const kind =
    kindRaw === 'text' ||
    kindRaw === 'image' ||
    kindRaw === 'audio' ||
    kindRaw === 'file' ||
    kindRaw === 'location'
      ? kindRaw
      : undefined;
  const thumbUrl =
    typeof r.thumbUrl === 'string' && r.thumbUrl.trim()
      ? r.thumbUrl.trim()
      : null;
  const authorLabel =
    typeof r.authorLabel === 'string' && r.authorLabel.trim()
      ? r.authorLabel.trim()
      : null;
  return {
    messageId,
    role,
    preview,
    ...(kind ? { kind } : {}),
    ...(thumbUrl ? { thumbUrl } : {}),
    ...(authorLabel ? { authorLabel } : {}),
  };
}

function asReactions(value: unknown): ChatReaction[] {
  if (!Array.isArray(value)) return [];
  const out: ChatReaction[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const r = item as Record<string, unknown>;
    const emoji = typeof r.emoji === 'string' ? r.emoji.trim() : '';
    const party = r.party;
    const at = Number(r.at);
    if (!emoji) continue;
    if (party !== 'consumer' && party !== 'staff' && party !== 'assistant') {
      continue;
    }
    out.push({
      emoji: emoji.slice(0, 8),
      party,
      at: Number.isFinite(at) ? at : Date.now(),
    });
  }
  return out;
}

export function chatRichFieldsFromPayload(
  payload?: Record<string, unknown> | null,
): Partial<
  Pick<
    ChatMessage,
    | 'productCards'
    | 'cartActions'
    | 'catalogCategories'
    | 'catalogProducts'
    | 'catalogCategoryId'
    | 'attachments'
    | 'voiceUrl'
    | 'voiceDurationMs'
    | 'location'
    | 'paymentMethods'
    | 'hoursSchedule'
    | 'contactCard'
    | 'replyTo'
    | 'reactions'
  >
> {
  if (!payload || typeof payload !== 'object') return {};
  const productCards = asProductCards(
    payload.product_cards ?? payload.productCards,
  );
  const cartActions = asCartActions(
    payload.cart_actions ?? payload.cartActions,
  );
  const catalogCategories = asCategoryCards(
    payload.category_cards ?? payload.catalogCategories,
  );
  const catalogProducts = asProductCards(
    payload.catalog_products ?? payload.catalogProducts,
  );
  const attachments = asAttachments(payload.attachments);
  const voiceUrl =
    typeof payload.voiceUrl === 'string' && payload.voiceUrl
      ? payload.voiceUrl
      : attachments.find((a) => a.kind === 'audio')?.url || undefined;
  const voiceDurationMs = Number(payload.voiceDurationMs);
  const location = asLocation(payload.location);
  const replyTo = asReplyTo(payload.replyTo ?? payload.reply_to);
  const reactions = asReactions(payload.reactions);
  const paymentRaw = payload.payment_methods ?? payload.paymentMethods;
  const paymentMethods = Array.isArray(paymentRaw)
    ? (paymentRaw as ChatPaymentMethod[])
    : [];
  const hoursSchedule =
    (payload.hours_schedule as ChatHoursSnapshot | null | undefined) ??
    (payload.hoursSchedule as ChatHoursSnapshot | null | undefined) ??
    null;
  const contactCard =
    (payload.contact_card as ChatContactCardData | null | undefined) ??
    (payload.contactCard as ChatContactCardData | null | undefined) ??
    null;
  const catalogCategoryId =
    typeof payload.catalog_category_id === 'string'
      ? payload.catalog_category_id
      : typeof payload.catalogCategoryId === 'string'
        ? payload.catalogCategoryId
        : undefined;
  return {
    ...(productCards.length ? { productCards } : {}),
    ...(cartActions.length ? { cartActions } : {}),
    ...(catalogCategories.length ? { catalogCategories } : {}),
    ...(catalogProducts.length ? { catalogProducts } : {}),
    ...(catalogCategoryId != null ? { catalogCategoryId } : {}),
    ...(attachments.length ? { attachments } : {}),
    ...(voiceUrl ? { voiceUrl } : {}),
    ...(Number.isFinite(voiceDurationMs) && voiceDurationMs > 0
      ? { voiceDurationMs }
      : {}),
    ...(location ? { location } : {}),
    ...(replyTo ? { replyTo } : {}),
    ...(reactions.length ? { reactions } : {}),
    ...(paymentMethods.length ? { paymentMethods } : {}),
    ...(hoursSchedule ? { hoursSchedule } : {}),
    ...(contactCard ? { contactCard } : {}),
  };
}

/** How much structured UI a row carries (for merge preference). */
export function panelMessageRichness(row: PanelMessageRow): number {
  const p = row.payload;
  if (!p || typeof p !== 'object') return 0;
  let n = 0;
  for (const key of [
    'product_cards',
    'productCards',
    'cart_actions',
    'cartActions',
    'category_cards',
    'catalogCategories',
    'catalog_products',
    'catalogProducts',
    'attachments',
    'reactions',
  ]) {
    const v = p[key];
    if (Array.isArray(v)) n += v.length;
  }
  if (typeof p.voiceUrl === 'string' && p.voiceUrl) n += 1;
  if (p.location && typeof p.location === 'object') n += 1;
  if (p.replyTo || p.reply_to) n += 1;
  return n;
}

/**
 * Merge incremental rows into the open thread.
 * Prefer the richer payload when the same id arrives twice (Realtime lean vs REST).
 * Reactions are an exception: if incoming defines `reactions` (even `[]`), take it
 * so a cleared/toggled reaction is not stuck behind a richer stale payload.
 */
export function mergePanelMessages(
  prev: PanelMessageRow[],
  incoming: PanelMessageRow[],
): PanelMessageRow[] {
  if (incoming.length === 0) return prev;
  const byId = new Map<string, PanelMessageRow>();
  for (const m of prev) byId.set(m.id, m);
  for (const m of incoming) {
    const existing = byId.get(m.id);
    if (!existing) {
      byId.set(m.id, m);
      continue;
    }
    const preferIncoming =
      panelMessageRichness(m) >= panelMessageRichness(existing);
    let chosen = preferIncoming ? m : existing;
    const inPayload =
      m.payload && typeof m.payload === 'object' && !Array.isArray(m.payload)
        ? (m.payload as Record<string, unknown>)
        : null;
    if (inPayload && Array.isArray(inPayload.reactions)) {
      const basePayload =
        chosen.payload &&
        typeof chosen.payload === 'object' &&
        !Array.isArray(chosen.payload)
          ? (chosen.payload as Record<string, unknown>)
          : {};
      chosen = {
        ...chosen,
        payload: { ...basePayload, reactions: inPayload.reactions },
      };
    }
    byId.set(m.id, chosen);
  }
  const merged = Array.from(byId.values());
  merged.sort((a, b) => (a.seq || 0) - (b.seq || 0));
  return merged;
}

/** Map supervision rows → consumer ChatMessage shape (same bubbles/list). */
export function toPanelChatMessages(rows: PanelMessageRow[]): ChatMessage[] {
  return rows.map((m) => {
    const createdAt = Date.parse(m.created_at) || Date.now();
    const rich = chatRichFieldsFromPayload(m.payload);
    if (m.role === 'system') {
      return {
        id: m.id,
        role: 'system' as const,
        text: m.body,
        createdAt,
        ...rich,
      };
    }
    if (m.role === 'staff') {
      return {
        id: m.id,
        role: 'user' as const,
        text: m.body,
        createdAt,
        // Start as delivered; blue ticks advance when consumer_last_read catches up.
        deliveryStatus: 'delivered' as const,
        ...rich,
      };
    }
    if (m.role === 'consumer') {
      // Older turns leaked the model reply-prefix into body — recover quote UI.
      const recovered =
        !rich.replyTo
          ? recoverReplyToFromPrefixedBody(m.body)
          : { cleanText: m.body, replyTo: null };
      return {
        id: m.id,
        role: 'assistant' as const,
        text: recovered.cleanText,
        createdAt,
        senderLabel: 'Cliente',
        ...rich,
        ...(recovered.replyTo && !rich.replyTo
          ? { replyTo: recovered.replyTo }
          : {}),
      };
    }
    return {
      id: m.id,
      role: 'assistant' as const,
      text: m.body,
      createdAt,
      senderLabel: 'Asistente',
      ...rich,
    };
  });
}
