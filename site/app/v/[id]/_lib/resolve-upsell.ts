import {
  BADGE_LABELS,
  buildComboRail,
  buildCrossSellItems,
  buildProductNudge,
  DEMO_FREE_DELIVERY_THRESHOLD,
  displayProductImage,
  freeDeliveryProgress,
  type ComboRailItem,
  type CrossSellItem,
  type ProductNudge,
  type UpsellCategory,
  type UpsellProduct,
} from './upsell-heuristics';

export type UpsellMode = 'auto' | 'custom' | 'off';

export type UpsellConfig = {
  schema_version?: number | null;
  mode?: UpsellMode | string | null;
  combo_product_ids?: string[] | null;
  cross_sell_product_ids?: string[] | null;
  free_delivery_threshold?: number | null;
  show_product_nudges?: boolean | null;
};

export type ConfigurableUpsellProduct = UpsellProduct & {
  upsell_badge?: string | null;
  precio_comparacion?: number | null;
};

const VALID_BADGES = new Set(['mas_pedido', 'mejor_valor', 'ahorra'] as const);

export function parseUpsellConfig(raw: unknown): UpsellConfig | null {
  if (raw == null) return null;
  if (typeof raw === 'string') {
    try {
      return parseUpsellConfig(JSON.parse(raw));
    } catch {
      return null;
    }
  }
  if (typeof raw !== 'object') return null;
  return raw as UpsellConfig;
}

export function resolveUpsellMode(config: UpsellConfig | null | undefined): UpsellMode {
  if (!config) return 'auto';
  const mode = (config.mode ?? 'auto').toString().trim().toLowerCase();
  if (mode === 'off' || mode === 'custom' || mode === 'auto') return mode;
  return 'auto';
}

function asIdList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of value) {
    const id = String(item ?? '').trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function productById(products: ConfigurableUpsellProduct[]) {
  const map = new Map<string, ConfigurableUpsellProduct>();
  for (const product of products) {
    if (product?.id) map.set(product.id, product);
  }
  return map;
}

function isAvailable(product: ConfigurableUpsellProduct) {
  return product.disponible !== false && (product.precio ?? 0) > 0;
}

function normalizeBadge(value: string | null | undefined, fallbackIndex: number): ComboRailItem['badge'] {
  const raw = (value ?? '').trim().toLowerCase();
  if (VALID_BADGES.has(raw as ComboRailItem['badge'])) {
    return raw as ComboRailItem['badge'];
  }
  const order: ComboRailItem['badge'][] = ['mas_pedido', 'mejor_valor', 'ahorra'];
  return order[fallbackIndex % order.length];
}

function buildCustomComboRail(
  products: ConfigurableUpsellProduct[],
  ids: string[],
  logoUrl?: string | null,
): ComboRailItem[] {
  const byId = productById(products);
  const items: ComboRailItem[] = [];
  ids.forEach((id, index) => {
    const product = byId.get(id);
    if (!product || !isAvailable(product)) return;
    const price = Number(product.precio ?? 0);
    const badge = normalizeBadge(product.upsell_badge, index);
    const compareRaw = Number(product.precio_comparacion);
    const compareAtPrice =
      Number.isFinite(compareRaw) && compareRaw > price
        ? Math.round(compareRaw * 100) / 100
        : Math.round(price * (badge === 'ahorra' ? 1.18 : 1.12) * 100) / 100;
    items.push({
      product,
      badge,
      badgeLabel: BADGE_LABELS[badge],
      compareAtPrice,
      imageUrl: displayProductImage(product.imagen_url, logoUrl),
    });
  });
  return items;
}

function buildCustomCrossSell(
  products: ConfigurableUpsellProduct[],
  ids: string[],
  logoUrl?: string | null,
  excludeIds: Set<string> = new Set(),
): CrossSellItem[] {
  const byId = productById(products);
  const items: CrossSellItem[] = [];
  for (const id of ids) {
    if (excludeIds.has(id)) continue;
    const product = byId.get(id);
    if (!product || !isAvailable(product)) continue;
    items.push({
      product,
      imageUrl: displayProductImage(product.imagen_url, logoUrl),
    });
  }
  return items;
}

export type ResolvedUpsell = {
  mode: UpsellMode;
  showDemoLabel: boolean;
  comboItems: ComboRailItem[];
  crossSellItems: CrossSellItem[];
  showProductNudges: boolean;
  freeDeliveryThreshold: number | null;
  showDeliveryProgress: boolean;
};

export function resolveUpsell(options: {
  config: UpsellConfig | null | undefined;
  categories: UpsellCategory[];
  products: ConfigurableUpsellProduct[];
  logoUrl?: string | null;
  excludeCrossSellIds?: Set<string>;
}): ResolvedUpsell {
  const mode = resolveUpsellMode(options.config);
  const exclude = options.excludeCrossSellIds ?? new Set<string>();

  if (mode === 'off') {
    return {
      mode,
      showDemoLabel: false,
      comboItems: [],
      crossSellItems: [],
      showProductNudges: false,
      freeDeliveryThreshold: null,
      showDeliveryProgress: false,
    };
  }

  if (mode === 'custom' && options.config) {
    const comboIds = asIdList(options.config.combo_product_ids);
    const crossIds = asIdList(options.config.cross_sell_product_ids);
    const thresholdRaw = options.config.free_delivery_threshold;
    const threshold = thresholdRaw == null ? null : Number(thresholdRaw);
    const freeDeliveryThreshold =
      threshold != null && Number.isFinite(threshold) && threshold > 0 ? threshold : null;
    const showProductNudges = options.config.show_product_nudges !== false;

    return {
      mode,
      showDemoLabel: false,
      comboItems: buildCustomComboRail(options.products, comboIds, options.logoUrl),
      crossSellItems: buildCustomCrossSell(options.products, crossIds, options.logoUrl, exclude),
      showProductNudges,
      freeDeliveryThreshold,
      showDeliveryProgress: freeDeliveryThreshold != null,
    };
  }

  // auto / null config → heuristics
  return {
    mode: 'auto',
    showDemoLabel: true,
    comboItems: buildComboRail(options.categories, options.products, options.logoUrl),
    crossSellItems: buildCrossSellItems(
      options.categories,
      options.products,
      options.logoUrl,
      exclude,
    ),
    showProductNudges: true,
    freeDeliveryThreshold: DEMO_FREE_DELIVERY_THRESHOLD,
    showDeliveryProgress: true,
  };
}

export function resolveProductNudge(
  product: ConfigurableUpsellProduct,
  categories: UpsellCategory[],
  index: number,
  showProductNudges: boolean,
): ProductNudge | null {
  if (!showProductNudges) return null;
  return buildProductNudge(product, categories, index);
}

export function resolveFreeDeliveryProgress(
  subtotalBase: number,
  threshold: number | null,
) {
  if (threshold == null || threshold <= 0) {
    return {
      threshold: 0,
      remaining: 0,
      ratio: 0,
      unlocked: false,
      enabled: false,
    };
  }
  return { ...freeDeliveryProgress(subtotalBase, threshold), enabled: true };
}

// Re-export badge labels for tests/UI.
export { BADGE_LABELS };
