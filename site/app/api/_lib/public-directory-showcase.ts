import { foldSearchText } from '../../_lib/search-text';
import { parseCategoryUpsellKind } from '../../_lib/pre-checkout-upsell';

export type ShowcaseDishCandidate = {
  name: string;
  imageUrl: string;
  price: number;
  compareAtPrice: number | null;
  categoryName?: string | null;
  categoryRole?: string | null;
};

/** Category labels that are drink menus (not cafe restaurants named "Café"). */
const BEVERAGE_CATEGORY_RE =
  /\b(bebida|bebidas|refresco|refrescos|jugo|jugos|merengada|merengadas|gaseosa|gaseosas|soda|sodas|drink|drinks|smoothie|smoothies|batido|batidos)\b/i;

/** Product names that are clearly beverage SKUs. */
const BEVERAGE_PRODUCT_RE =
  /\b(bebida|refresco|jugo|merengada|malta|gaseosa|soda|smoothie|milkshake|batido|cappuccino|latte|espresso|agua mineral|agua embotellada|cocacola|coca[\s-]?cola|pepsi|sprite|fanta|hit|frescolita)\b/i;

export function isBeverageShowcaseDish(input: {
  name: string;
  categoryName?: string | null;
  categoryRole?: string | null;
}): boolean {
  const roleKind = parseCategoryUpsellKind(input.categoryRole);
  if (roleKind === 'bebida') return true;

  const category = foldSearchText(input.categoryName ?? '');
  if (category && (parseCategoryUpsellKind(category) === 'bebida' || BEVERAGE_CATEGORY_RE.test(category))) {
    return true;
  }

  return BEVERAGE_PRODUCT_RE.test(foldSearchText(input.name));
}

export function showcaseRotationBucket(nowMs = Date.now()) {
  // Rotate every 3 hours so cards feel fresh without thrashing the CDN cache.
  return Math.floor(nowMs / (3 * 60 * 60 * 1000));
}

function seededShuffle<T>(items: T[], seed: string): T[] {
  const copy = [...items];
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  for (let i = copy.length - 1; i > 0; i -= 1) {
    hash = (hash * 1664525 + 1013904223) >>> 0;
    const j = hash % (i + 1);
    const tmp = copy[i]!;
    copy[i] = copy[j]!;
    copy[j] = tmp;
  }
  return copy;
}

export type ShowcaseDishPick = {
  name: string;
  imageUrl: string;
  price: number;
  compareAtPrice: number | null;
  categoryName: string | null;
};

function toShowcasePick(item: ShowcaseDishCandidate): ShowcaseDishPick {
  return {
    name: item.name,
    imageUrl: item.imageUrl,
    price: item.price,
    compareAtPrice: item.compareAtPrice,
    categoryName: item.categoryName?.trim() || null,
  };
}

export function pickRotatedShowcaseDishes<T extends ShowcaseDishCandidate>(
  candidates: T[],
  businessId: string,
  limit: number,
  nowMs = Date.now(),
): ShowcaseDishPick[] {
  const food = candidates.filter((item) => !isBeverageShowcaseDish(item));
  const pool = food.length > 0 ? food : candidates;
  const rotated = seededShuffle(pool, `${businessId}:${showcaseRotationBucket(nowMs)}`);
  return rotated.slice(0, Math.max(0, limit)).map(toShowcasePick);
}

/**
 * Prefer dishes whose name OR menu category matches a discovery chip,
 * with fair rotation so every matching SKU can surface over time.
 */
export function pickCategoryMatchedDishes<T extends ShowcaseDishCandidate>(
  candidates: T[],
  businessId: string,
  chipId: string,
  matchesChip: (dish: ShowcaseDishCandidate, chipId: string) => boolean,
  limit: number,
  nowMs = Date.now(),
): ShowcaseDishPick[] {
  const matched = candidates.filter(
    (item) => !isBeverageShowcaseDish(item) && matchesChip(item, chipId),
  );
  if (matched.length === 0) return [];
  const rotated = seededShuffle(
    matched,
    `${businessId}:${chipId}:${showcaseRotationBucket(nowMs)}`,
  );
  return rotated.slice(0, Math.max(0, limit)).map(toShowcasePick);
}
