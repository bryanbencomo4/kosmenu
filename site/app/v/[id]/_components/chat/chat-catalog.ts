import type { ChatCatalogCategory, ChatProductCardData } from './chat-types';

export type { ChatCatalogCategory } from './chat-types';

export type ChatCatalogProduct = {
  id: string;
  categoryId: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  price: number;
  currency: string;
  available: boolean;
  requiresConfiguration: boolean;
};

export type ChatCatalogSnapshot = {
  currency: string;
  categories: ChatCatalogCategory[];
  products: ChatCatalogProduct[];
};

export const CHAT_CATALOG_PAGE_SIZE = 24;

function moneyLabel(amount: number, currency: string) {
  const n = Math.round(Math.max(0, amount) * 100) / 100;
  return `${n} ${(currency || 'USD').trim() || 'USD'}`;
}

/** Lowercase + strip diacritics for forgiving search / heuristics. */
export function normalizeCatalogText(value: string | null | undefined): string {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function toChatProductCard(p: ChatCatalogProduct): ChatProductCardData {
  const price = Number.isFinite(p.price) ? p.price : 0;
  return {
    product_id: p.id,
    name: p.name,
    description: p.description,
    image_url: p.imageUrl,
    currency: p.currency,
    price_base: price > 0 ? price : null,
    price_unit: price > 0 ? price : null,
    price_label: price > 0 ? moneyLabel(price, p.currency) : null,
    available: p.available,
    requires_configuration: p.requiresConfiguration,
    option_hints: [],
  };
}

export function productsInCategory(
  catalog: ChatCatalogSnapshot,
  categoryId: string,
): ChatCatalogProduct[] {
  return catalog.products.filter((p) => p.categoryId === categoryId);
}

export type ChatCatalogFilter = {
  categoryId?: string | null;
  query?: string | null;
  offset?: number;
  limit?: number;
};

export type ChatCatalogPage = {
  items: ChatCatalogProduct[];
  total: number;
  hasMore: boolean;
};

export function filterCatalogProducts(
  catalog: ChatCatalogSnapshot,
  opts: ChatCatalogFilter = {},
): ChatCatalogPage {
  const offset = Math.max(0, Math.floor(opts.offset ?? 0) || 0);
  const rawLimit = Math.floor(opts.limit ?? CHAT_CATALOG_PAGE_SIZE);
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : CHAT_CATALOG_PAGE_SIZE;

  const terms = normalizeCatalogText(opts.query)
    .split(/\s+/)
    .filter(Boolean);

  const categoryNames = new Map<string, string>();
  if (terms.length > 0) {
    for (const c of catalog.categories) {
      categoryNames.set(c.id, normalizeCatalogText(c.name));
    }
  }

  const matched = catalog.products.filter((p) => {
    if (opts.categoryId && p.categoryId !== opts.categoryId) return false;
    if (terms.length === 0) return true;
    const haystack = `${normalizeCatalogText(p.name)} ${normalizeCatalogText(
      p.description,
    )} ${categoryNames.get(p.categoryId) ?? ''}`;
    return terms.every((t) => haystack.includes(t));
  });

  const items = matched.slice(offset, offset + limit);
  return {
    items,
    total: matched.length,
    hasMore: offset + items.length < matched.length,
  };
}

/* ------------------------------------------------------------------ */
/* Deterministic catalog intents (no Gemini)                           */
/* ------------------------------------------------------------------ */

export type CatalogIntent =
  | { kind: 'categories' }
  | { kind: 'category'; categoryId: string };

/** "categorías", "ver menú", "qué hay/tienen", "mostrar menú" (checked on accent-stripped text). */
export const CATEGORIES_INTENT_RE =
  /categorias|ver (el )?menu|que (hay|tienen)|mostrar (el )?menu|lista(do)? (del )?menu|opciones del menu/i;
/** Common category keywords worth resolving straight to a category carousel. */
const CATEGORY_KEYWORD_RE = /bebidas|pizzas|postres|hamburguesas/g;
/** Long free-form messages go to the model even if they mention "menú". */
const CATEGORIES_INTENT_MAX_WORDS = 8;

/**
 * Cheap, deterministic routing for "show me the menu / a category" messages so
 * the UI can answer with a carousel without spending a Gemini call.
 * Returns `null` when the text should go to the assistant as usual.
 */
export function matchCatalogIntent(
  text: string | null | undefined,
  catalog: ChatCatalogSnapshot | null | undefined,
): CatalogIntent | null {
  if (!catalog || catalog.categories.length === 0) return null;
  const norm = normalizeCatalogText(text).replace(/[¿?¡!.,;:]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!norm) return null;
  const words = norm.split(' ').length;
  if (words > CATEGORIES_INTENT_MAX_WORDS) return null;

  const keywords = norm.match(CATEGORY_KEYWORD_RE);
  if (keywords) {
    for (const kw of keywords) {
      const stem = kw.replace(/s$/, '');
      const hit = catalog.categories.find((c) =>
        normalizeCatalogText(c.name).includes(stem),
      );
      if (hit) return { kind: 'category', categoryId: hit.id };
    }
  }

  if (CATEGORIES_INTENT_RE.test(norm)) return { kind: 'categories' };
  return null;
}

/* ------------------------------------------------------------------ */
/* Complement suggestions                                              */
/* ------------------------------------------------------------------ */

type CategoryKind = 'drink' | 'dessert' | 'side' | 'food';

const DRINK_RE =
  /\b(?:bebid|refresc|jugo|zumo|cervez|licor|vino|trago|coctel|cafe|soda|gaseos|batido|malteada|smoothie|limonada|drink|beverage|beer|wine|cocktail|coffee|juice|infusion)|\b(?:agua|aguas|te|tea|tes)\b/;
const DESSERT_RE =
  /\b(?:postre|helado|dulce|pastel|tarta|flan|brownie|dessert|sweet|cake|churro)/;
const SIDE_RE =
  /\b(?:entrad|acompa|guarnici|extra|adicion|salsa|aderez|side|starter|appetizer|topping|complement)/;

export function classifyCategoryName(name: string | null | undefined): CategoryKind {
  const n = normalizeCatalogText(name);
  if (DRINK_RE.test(n)) return 'drink';
  if (DESSERT_RE.test(n)) return 'dessert';
  if (SIDE_RE.test(n)) return 'side';
  return 'food';
}

export type SuggestComplementOptions = {
  /** Max items (clamped to 3–6). Default 4. */
  limit?: number;
  declinedCategoryIds?: string[];
};

const SUGGEST_MIN = 3;
const SUGGEST_MAX = 6;

export function suggestComplementProducts(
  catalog: ChatCatalogSnapshot,
  cartProductIds: string[],
  opts: SuggestComplementOptions = {},
): ChatCatalogProduct[] {
  const limit = Math.min(
    SUGGEST_MAX,
    Math.max(SUGGEST_MIN, Math.floor(opts.limit ?? 4) || SUGGEST_MIN),
  );
  const inCart = new Set(cartProductIds);
  if (inCart.size === 0) return [];
  const declined = new Set(opts.declinedCategoryIds ?? []);

  const kindByCategory = new Map<string, CategoryKind>();
  for (const c of catalog.categories) {
    kindByCategory.set(c.id, classifyCategoryName(c.name));
  }

  const cartKinds = new Set<CategoryKind>();
  for (const p of catalog.products) {
    if (!inCart.has(p.id)) continue;
    const kind = kindByCategory.get(p.categoryId);
    if (kind) cartKinds.add(kind);
  }
  if (cartKinds.size === 0) return [];

  // Ordered list of kinds worth proposing next.
  const wanted: CategoryKind[] = [];
  const push = (k: CategoryKind) => {
    if (!cartKinds.has(k) && !wanted.includes(k)) wanted.push(k);
  };
  if (cartKinds.has('food') || cartKinds.has('side')) {
    push('drink');
    push('dessert');
    push('side');
  } else if (cartKinds.has('drink')) {
    wanted.push('food');
    push('dessert');
    push('side');
  } else {
    // only dessert
    push('drink');
    push('food');
  }
  if (wanted.length === 0) return [];

  // Buckets per kind -> per category (catalog order), available & not in cart.
  const buckets: ChatCatalogProduct[][] = [];
  for (const kind of wanted) {
    const perCategory: ChatCatalogProduct[][] = [];
    for (const c of catalog.categories) {
      if (kindByCategory.get(c.id) !== kind || declined.has(c.id)) continue;
      const items = catalog.products.filter(
        (p) => p.categoryId === c.id && p.available && !inCart.has(p.id),
      );
      if (items.length > 0) perCategory.push(items);
    }
    // interleave categories of the same kind
    const merged: ChatCatalogProduct[] = [];
    for (let i = 0; perCategory.some((l) => i < l.length); i += 1) {
      for (const l of perCategory) if (i < l.length) merged.push(l[i]);
    }
    if (merged.length > 0) buckets.push(merged);
  }

  // Round-robin across kinds so suggestions are varied (drink, dessert, ...).
  const out: ChatCatalogProduct[] = [];
  const seen = new Set<string>();
  for (let i = 0; out.length < limit && buckets.some((b) => i < b.length); i += 1) {
    for (const b of buckets) {
      if (out.length >= limit) break;
      const item = b[i];
      if (item && !seen.has(item.id)) {
        seen.add(item.id);
        out.push(item);
      }
    }
  }
  return out;
}
