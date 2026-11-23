import type {
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

function richFieldsFromPayload(payload?: Record<string, unknown> | null): {
  productCards?: ChatProductCardData[];
  cartActions?: ChatCartActionData[];
  catalogCategories?: ChatCatalogCategory[];
  catalogProducts?: ChatProductCardData[];
} {
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
  return {
    ...(productCards.length ? { productCards } : {}),
    ...(cartActions.length ? { cartActions } : {}),
    ...(catalogCategories.length ? { catalogCategories } : {}),
    ...(catalogProducts.length ? { catalogProducts } : {}),
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
  ]) {
    const v = p[key];
    if (Array.isArray(v)) n += v.length;
  }
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
    const rich = richFieldsFromPayload(m.payload);
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
