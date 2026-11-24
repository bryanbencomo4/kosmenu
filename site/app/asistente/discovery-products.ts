import { dishMatchesDirectoryCategory } from '../api/_lib/public-directory-geo';
import {
  isBeverageShowcaseDish,
  showcaseRotationBucket,
} from '../api/_lib/public-directory-showcase';

export type DiscoveryUiDish = {
  name: string;
  imageUrl: string;
  price: number;
  compareAtPrice: number | null;
  /** Menu category label when known (e.g. “Hamburguesas”). */
  categoryName?: string | null;
};

export type DiscoveryUiProduct = {
  id: string;
  name: string;
  imageUrl: string;
  price: number;
  compareAtPrice: number | null;
  priceLabel: string;
  compareAtLabel: string | null;
  restaurantId: string;
  restaurantSlug: string;
  restaurantName: string;
  restaurantLogoUrl: string | null;
  menuUrl: string;
  isOpen: boolean | null;
};

type RestaurantForProducts = {
  id: string;
  slug: string;
  nombre: string;
  logoUrl: string | null;
  menuUrl: string;
  isOpen: boolean | null;
  currencies?: string[];
  showcaseDishes?: DiscoveryUiDish[];
};

export function formatDiscoveryPrice(
  price: number,
  currencies?: string[] | null,
): string {
  if (!Number.isFinite(price) || price <= 0) return '';
  const cur = (currencies || [])
    .map((c) => c.trim().toUpperCase())
    .find((c) => c === 'USD' || c === 'VES' || c === 'COP');

  if (cur === 'USD' || (price < 1000 && !cur)) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 2,
    }).format(price);
  }
  if (cur === 'COP') {
    return `COP ${new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(price)}`;
  }
  // VES / large amounts without currency → Bs
  return `Bs ${new Intl.NumberFormat('es-VE', { maximumFractionDigits: 0 }).format(price)}`;
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

/**
 * Dishes that belong to the chip by product name OR menu category name.
 * Never fall back to unrelated showcase plates (alitas in “hamburguesas”, etc.).
 */
function dishesForCategory(
  restaurant: RestaurantForProducts,
  categoryId?: string,
): DiscoveryUiDish[] {
  const dishes = (restaurant.showcaseDishes || []).filter(
    (d) =>
      d.imageUrl &&
      Number.isFinite(d.price) &&
      d.price > 0 &&
      !isBeverageShowcaseDish({
        name: d.name,
        categoryName: d.categoryName,
      }),
  );
  if (dishes.length === 0) return [];
  if (!categoryId) return dishes;
  return dishes.filter((d) =>
    dishMatchesDirectoryCategory(
      { name: d.name, categoryName: d.categoryName },
      categoryId,
    ),
  );
}

/**
 * Fair product rail: round-robin 1 dish per restaurant so every commerce
 * gets a front-row slot, then rotate lead restaurant every 3h.
 */
export function buildFairDiscoveryProducts(
  restaurants: RestaurantForProducts[],
  options?: { categoryId?: string; limit?: number; nowMs?: number },
): DiscoveryUiProduct[] {
  const limit = Math.min(Math.max(options?.limit ?? 18, 1), 36);
  const nowMs = options?.nowMs ?? Date.now();
  const categoryId = options?.categoryId;
  const bucket = showcaseRotationBucket(nowMs);

  const openFirst = [...restaurants].sort((a, b) => {
    const ao = a.isOpen === true ? 0 : a.isOpen == null ? 1 : 2;
    const bo = b.isOpen === true ? 0 : b.isOpen == null ? 1 : 2;
    if (ao !== bo) return ao - bo;
    return a.nombre.localeCompare(b.nombre, 'es');
  });

  const queues = openFirst
    .map((r) => {
      const pool = dishesForCategory(r, categoryId);
      if (pool.length === 0) return null;
      const rotated = seededShuffle(pool, `${r.id}:${categoryId || 'all'}:${bucket}`);
      return { restaurant: r, dishes: rotated, cursor: 0 };
    })
    .filter(Boolean) as Array<{
    restaurant: RestaurantForProducts;
    dishes: DiscoveryUiDish[];
    cursor: number;
  }>;

  if (queues.length === 0) return [];

  const rotatedQueues = seededShuffle(queues, `lead:${categoryId || 'all'}:${bucket}`);
  const out: DiscoveryUiProduct[] = [];
  let guard = 0;
  while (out.length < limit && guard < limit * 4) {
    guard += 1;
    let progressed = false;
    for (const q of rotatedQueues) {
      if (out.length >= limit) break;
      if (q.cursor >= q.dishes.length) continue;
      const dish = q.dishes[q.cursor]!;
      q.cursor += 1;
      progressed = true;
      const r = q.restaurant;
      out.push({
        id: `${r.id}:${dish.name}:${q.cursor}`,
        name: dish.name,
        imageUrl: dish.imageUrl,
        price: dish.price,
        compareAtPrice: dish.compareAtPrice,
        priceLabel: formatDiscoveryPrice(dish.price, r.currencies),
        compareAtLabel: dish.compareAtPrice
          ? formatDiscoveryPrice(dish.compareAtPrice, r.currencies)
          : null,
        restaurantId: r.id,
        restaurantSlug: r.slug,
        restaurantName: r.nombre,
        restaurantLogoUrl: r.logoUrl,
        menuUrl: r.menuUrl,
        isOpen: r.isOpen,
      });
    }
    if (!progressed) break;
  }
  return out;
}
