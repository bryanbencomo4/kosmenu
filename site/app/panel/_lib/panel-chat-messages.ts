import type {
  ChatAttachment,
  ChatCartActionData,
  ChatCatalogCategory,
  ChatMessage,
  ChatProductCardData,
} from '../../v/[id]/_components/chat/chat-types';

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
export function chatRichFieldsFromPayload(
  payload?: Record<string, unknown> | null,
): Partial<
  Pick<
    ChatMessage,
    | 'productCards'
    | 'cartActions'
    | 'catalogCategories'
    | 'catalogProducts'
    | 'attachments'
    | 'voiceUrl'
    | 'voiceDurationMs'
    | 'location'
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
  return {
    ...(productCards.length ? { productCards } : {}),
    ...(cartActions.length ? { cartActions } : {}),
    ...(catalogCategories.length ? { catalogCategories } : {}),
    ...(catalogProducts.length ? { catalogProducts } : {}),
    ...(attachments.length ? { attachments } : {}),
    ...(voiceUrl ? { voiceUrl } : {}),
    ...(Number.isFinite(voiceDurationMs) && voiceDurationMs > 0
      ? { voiceDurationMs }
      : {}),
    ...(location ? { location } : {}),
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
  ]) {
    const v = p[key];
    if (Array.isArray(v)) n += v.length;
  }
  if (typeof p.voiceUrl === 'string' && p.voiceUrl) n += 1;
  if (p.location && typeof p.location === 'object') n += 1;
  return n;
}

/**
 * Merge incremental rows into the open thread.
 * Prefer the richer payload when the same id arrives twice (Realtime lean vs REST).
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
    byId.set(
      m.id,
      panelMessageRichness(m) >= panelMessageRichness(existing) ? m : existing,
    );
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
        deliveryStatus: 'read' as const,
        ...rich,
      };
    }
    if (m.role === 'consumer') {
      return {
        id: m.id,
        role: 'assistant' as const,
        text: m.body,
        createdAt,
        senderLabel: 'Cliente',
        ...rich,
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
