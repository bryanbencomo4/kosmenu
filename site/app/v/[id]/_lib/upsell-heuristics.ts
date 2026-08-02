/** Demo heuristics for upselling UI until merchants can configure these. */

export type UpsellProduct = {
  id: string;
  categoria_id: string;
  nombre: string;
  descripcion?: string | null;
  precio?: number | null;
  imagen_url?: string | null;
  disponible?: boolean | null;
};

export type UpsellCategory = {
  id: string;
  nombre: string;
  orden?: number | null;
};

const COMBO_KEYWORDS = ['combo', 'combos', 'promo', 'promocion', 'promoción', 'recomendado', 'recomendados', 'oferta'];
const DRINK_KEYWORDS = ['bebida', 'bebidas', 'drink', 'refresco', 'jugo', 'soda', 'cerveza', 'agua', 'cafe', 'café'];
const SIDE_KEYWORDS = ['adicional', 'adicionales', 'extra', 'extras', 'postre', 'postres', 'salsa', 'acompan', 'guarnicion'];
const MAIN_KEYWORDS = ['pizza', 'pizzas', 'burger', 'hamburgues', 'plato', 'platos', 'principal', 'fuertes'];

function normalize(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function matchesKeywords(name: string, keywords: string[]) {
  const n = normalize(name);
  return keywords.some((k) => n.includes(normalize(k)));
}

function isAvailable(product: UpsellProduct) {
  return product.disponible !== false && (product.precio ?? 0) > 0;
}

/** Real product photo only — null when empty or identical to the commerce logo. */
export function productImageUrl(imageUrl: string | null | undefined, logoUrl?: string | null) {
  const raw = (imageUrl ?? '').trim();
  if (!raw) return null;
  const logo = (logoUrl ?? '').trim();
  if (logo && raw === logo) return null;
  return raw;
}

/** Display helper: product photo, else commerce logo (matches previous public menu fallback). */
export function displayProductImage(imageUrl: string | null | undefined, logoUrl?: string | null) {
  return productImageUrl(imageUrl, logoUrl) || (logoUrl ?? '').trim() || null;
}

export function categoryIdsByKind(categories: UpsellCategory[]) {
  const comboIds = new Set<string>();
  const drinkIds = new Set<string>();
  const sideIds = new Set<string>();
  const mainIds = new Set<string>();

  for (const categoria of categories) {
    const name = categoria.nombre ?? '';
    if (matchesKeywords(name, COMBO_KEYWORDS)) comboIds.add(categoria.id);
    if (matchesKeywords(name, DRINK_KEYWORDS)) drinkIds.add(categoria.id);
    if (matchesKeywords(name, SIDE_KEYWORDS)) sideIds.add(categoria.id);
    if (matchesKeywords(name, MAIN_KEYWORDS)) mainIds.add(categoria.id);
  }

  return { comboIds, drinkIds, sideIds, mainIds };
}

export type ComboRailItem = {
  product: UpsellProduct;
  badge: 'mas_pedido' | 'mejor_valor' | 'ahorra';
  badgeLabel: string;
  compareAtPrice: number;
  imageUrl: string | null;
};

const BADGES: Array<ComboRailItem['badge']> = ['mas_pedido', 'mejor_valor', 'ahorra'];
const BADGE_LABELS: Record<ComboRailItem['badge'], string> = {
  mas_pedido: 'Más pedido',
  mejor_valor: 'Mejor valor',
  ahorra: 'Ahorra',
};

/** Horizontal "Combos recomendados" rail — prefers combo categories, else top mains. */
export function buildComboRail(
  categories: UpsellCategory[],
  products: UpsellProduct[],
  logoUrl?: string | null,
  limit = 6,
): ComboRailItem[] {
  const { comboIds, mainIds } = categoryIdsByKind(categories);
  const available = products.filter(isAvailable);

  let pool = available.filter((p) => comboIds.has(p.categoria_id));
  if (pool.length < 2) {
    pool = available.filter((p) => mainIds.has(p.categoria_id) || comboIds.has(p.categoria_id));
  }
  if (pool.length < 2) {
    pool = [...available].sort((a, b) => (b.precio ?? 0) - (a.precio ?? 0));
  }

  const withImageFirst = [...pool].sort((a, b) => {
    const ai = productImageUrl(a.imagen_url, logoUrl) ? 0 : 1;
    const bi = productImageUrl(b.imagen_url, logoUrl) ? 0 : 1;
    return ai - bi;
  });

  return withImageFirst.slice(0, limit).map((product, index) => {
    const price = Number(product.precio ?? 0);
    const badge = BADGES[index % BADGES.length];
    return {
      product,
      badge,
      badgeLabel: BADGE_LABELS[badge],
      // Demo compare-at: ~12–18% above current price for visual savings cue.
      compareAtPrice: Math.round(price * (badge === 'ahorra' ? 1.18 : 1.12) * 100) / 100,
      imageUrl: displayProductImage(product.imagen_url, logoUrl),
    };
  });
}

export type CrossSellItem = {
  product: UpsellProduct;
  imageUrl: string | null;
};

/** "Clientes también agregan" — drinks/sides first. */
export function buildCrossSellItems(
  categories: UpsellCategory[],
  products: UpsellProduct[],
  logoUrl?: string | null,
  excludeIds: Set<string> = new Set(),
  limit = 8,
): CrossSellItem[] {
  const { drinkIds, sideIds } = categoryIdsByKind(categories);
  const available = products.filter((p) => isAvailable(p) && !excludeIds.has(p.id));

  let pool = available.filter((p) => drinkIds.has(p.categoria_id) || sideIds.has(p.categoria_id));
  if (pool.length < 3) {
    pool = available.filter((p) => !excludeIds.has(p.id));
  }

  return pool.slice(0, limit).map((product) => ({
    product,
    imageUrl: displayProductImage(product.imagen_url, logoUrl),
  }));
}

export type ProductNudge = {
  kind: 'drink' | 'combo' | 'extra';
  label: string;
  accent: 'green' | 'orange' | 'primary';
};

/** Bottom nudge on product cards — demo copy tied to catalog kinds. */
export function buildProductNudge(
  product: UpsellProduct,
  categories: UpsellCategory[],
  index: number,
): ProductNudge | null {
  const { drinkIds, comboIds, mainIds, sideIds } = categoryIdsByKind(categories);
  if (drinkIds.has(product.categoria_id) || sideIds.has(product.categoria_id)) {
    return null;
  }

  if (comboIds.size > 0 && mainIds.has(product.categoria_id) && index % 3 === 1) {
    return {
      kind: 'combo',
      label: 'Sube a combo por +US$1.50',
      accent: 'orange',
    };
  }

  if (drinkIds.size > 0 && index % 3 === 0) {
    return {
      kind: 'drink',
      label: 'Añade bebida por US$0.99',
      accent: 'green',
    };
  }

  if (index % 3 === 2) {
    return {
      kind: 'extra',
      label: 'Extra recomendado disponible',
      accent: 'green',
    };
  }

  return null;
}

/** Demo free-delivery threshold in business base currency units. */
export const DEMO_FREE_DELIVERY_THRESHOLD = 15;

export function freeDeliveryProgress(subtotalBase: number, threshold = DEMO_FREE_DELIVERY_THRESHOLD) {
  const safeSubtotal = Math.max(0, Number(subtotalBase) || 0);
  const remaining = Math.max(0, threshold - safeSubtotal);
  const ratio = Math.min(1, safeSubtotal / threshold);
  return {
    threshold,
    remaining,
    ratio,
    unlocked: remaining <= 0,
  };
}

export function resolveHeroCover(
  products: UpsellProduct[],
  logoUrl?: string | null,
): string | null {
  for (const product of products) {
    const url = productImageUrl(product.imagen_url, logoUrl);
    if (url) return url;
  }
  return (logoUrl ?? '').trim() || null;
}
