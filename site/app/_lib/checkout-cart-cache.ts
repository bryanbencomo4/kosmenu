import {
  sanitizeCartLineSelection,
  type CartLineSelection,
} from './menu-product-options';

export const CHECKOUT_CART_CACHE_PREFIX = 'elmenuxfa:checkout-cart-v1:';

export type CachedCartLine = {
  productId: string;
  quantity: number;
  selection: CartLineSelection;
};

export type CachedCheckoutCart = {
  items: CachedCartLine[];
  fulfillment?: 'dine_in' | 'takeaway' | 'delivery';
  savedAt?: string;
};

function storageKey(commerceId: string) {
  return `${CHECKOUT_CART_CACHE_PREFIX}${commerceId.trim()}`;
}

function normalizeFulfillment(value: unknown): CachedCheckoutCart['fulfillment'] {
  return value === 'dine_in' || value === 'takeaway' || value === 'delivery' ? value : undefined;
}

function normalizeItems(raw: unknown): CachedCartLine[] {
  if (!Array.isArray(raw)) return [];
  const items: CachedCartLine[] = [];
  for (const entry of raw.slice(0, 60)) {
    if (!entry || typeof entry !== 'object') continue;
    const row = entry as Record<string, unknown>;
    const productId = (row.productId ?? '').toString().trim();
    const quantity = Math.round(Number(row.quantity));
    if (!productId || !Number.isFinite(quantity) || quantity <= 0) continue;
    items.push({
      productId,
      quantity: Math.min(99, quantity),
      selection: sanitizeCartLineSelection(row.selection),
    });
  }
  return items;
}

export function readCachedCheckoutCart(commerceId: string): CachedCheckoutCart | null {
  if (typeof window === 'undefined') return null;
  const id = commerceId.trim();
  if (!id) return null;
  try {
    const raw = window.localStorage.getItem(storageKey(id));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CachedCheckoutCart>;
    const items = normalizeItems(parsed.items);
    if (items.length === 0) return null;
    return {
      items,
      fulfillment: normalizeFulfillment(parsed.fulfillment),
      savedAt: typeof parsed.savedAt === 'string' ? parsed.savedAt : undefined,
    };
  } catch {
    return null;
  }
}

export function writeCachedCheckoutCart(
  commerceId: string,
  input: {
    items: CachedCartLine[];
    fulfillment?: CachedCheckoutCart['fulfillment'] | null;
  },
): void {
  if (typeof window === 'undefined') return;
  const id = commerceId.trim();
  if (!id) return;
  const items = normalizeItems(input.items);
  if (items.length === 0) {
    clearCachedCheckoutCart(id);
    return;
  }
  const payload: CachedCheckoutCart = {
    items,
    fulfillment: normalizeFulfillment(input.fulfillment),
    savedAt: new Date().toISOString(),
  };
  try {
    window.localStorage.setItem(storageKey(id), JSON.stringify(payload));
  } catch {
    // Private mode / quota — ignore.
  }
}

export function clearCachedCheckoutCart(commerceId: string): void {
  if (typeof window === 'undefined') return;
  const id = commerceId.trim();
  if (!id) return;
  try {
    window.localStorage.removeItem(storageKey(id));
  } catch {
    // ignore
  }
}
