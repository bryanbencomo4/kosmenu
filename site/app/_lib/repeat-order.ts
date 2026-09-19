export type RepeatOrderSelection = {
  tamanoId?: string;
  tamanoLabel?: string;
  servicioAdicional?: boolean;
  ajusteIds?: string[];
};

export type RepeatOrderLine = {
  productId: string;
  quantity: number;
  selection?: RepeatOrderSelection;
};

export type RepeatOrderPayload = {
  items: RepeatOrderLine[];
  fulfillment?: 'dine_in' | 'takeaway' | 'delivery';
};

const STORAGE_PREFIX = 'elmenuxfa-repeat-cart:';

function storageKey(slug: string) {
  return `${STORAGE_PREFIX}${slug.trim()}`;
}

export function writeRepeatOrder(slug: string, payload: RepeatOrderPayload) {
  if (typeof window === 'undefined') return;
  const normalized = slug.trim();
  if (!normalized || payload.items.length === 0) return;
  window.sessionStorage.setItem(storageKey(normalized), JSON.stringify(payload));
}

export function consumeRepeatOrder(slug: string): RepeatOrderPayload | null {
  if (typeof window === 'undefined') return null;
  const normalized = slug.trim();
  if (!normalized) return null;

  const raw = window.sessionStorage.getItem(storageKey(normalized));
  if (!raw) return null;
  window.sessionStorage.removeItem(storageKey(normalized));

  try {
    const parsed = JSON.parse(raw) as RepeatOrderPayload;
    const items = Array.isArray(parsed?.items)
      ? parsed.items
          .map((item) => {
            const productId = (item?.productId ?? '').toString().trim();
            const quantity = Number(item?.quantity);
            if (!productId || !Number.isFinite(quantity) || quantity <= 0) return null;
            const selection = item.selection && typeof item.selection === 'object'
              ? {
                  tamanoId: (item.selection.tamanoId ?? '').toString().trim() || undefined,
                  tamanoLabel: (item.selection.tamanoLabel ?? '').toString().trim() || undefined,
                  servicioAdicional: item.selection.servicioAdicional === true,
                  ajusteIds: Array.isArray(item.selection.ajusteIds)
                    ? item.selection.ajusteIds.map((entry) => entry.toString().trim()).filter(Boolean)
                    : undefined,
                }
              : undefined;
            return { productId, quantity: Math.min(99, Math.round(quantity)), selection };
          })
          .filter(Boolean) as RepeatOrderLine[]
      : [];
    if (items.length === 0) return null;
    const fulfillment = parsed.fulfillment;
    return {
      items,
      fulfillment:
        fulfillment === 'dine_in' || fulfillment === 'takeaway' || fulfillment === 'delivery'
          ? fulfillment
          : undefined,
    };
  } catch {
    return null;
  }
}
