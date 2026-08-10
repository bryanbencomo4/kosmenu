/**
 * Real upsell/cross-sell resolver.
 *
 * Answers "what offer makes sense right now, given what the customer just
 * did" — not "what products does the merchant want to highlight". Driven
 * entirely by merchant-authored rules (`upsell_rules` / `upsell_rule_targets`)
 * and settings (`upsell_settings`). No invented popularity, ratings, or
 * social proof: if there are no rules, there are no suggestions.
 */

export type EngineOrderType = 'delivery' | 'pickup';
export type EngineSurface = 'add_to_cart' | 'cart' | 'checkout';
export type EngineTriggerType = 'product' | 'category' | 'cart';
export type EngineTargetType = 'product' | 'category';
export type EnginePriority = 'low' | 'normal' | 'high';

export type EngineProduct = {
  id: string;
  categoria_id: string;
  nombre?: string | null;
  precio?: number | null;
  disponible?: boolean | null;
  upsell_enabled?: boolean | null;
  orden?: number | null;
};

export type EngineRuleTarget = {
  target_type: EngineTargetType;
  product_id?: string | null;
  category_id?: string | null;
  position?: number | null;
  enabled?: boolean | null;
};

export type EngineRule = {
  id: string;
  enabled?: boolean | null;
  trigger_type: EngineTriggerType;
  trigger_product_id?: string | null;
  trigger_category_id?: string | null;
  trigger_min_qty?: number | null;
  surface: EngineSurface;
  priority?: EnginePriority | null;
  min_cart_amount?: number | null;
  max_cart_amount?: number | null;
  order_type?: EngineOrderType | null;
  max_suggestions?: number | null;
  targets: EngineRuleTarget[];
};

export type EngineSettings = {
  enabled?: boolean | null;
  show_add_to_cart?: boolean | null;
  show_cart?: boolean | null;
  show_checkout?: boolean | null;
  max_add_suggestions?: number | null;
  max_cart_suggestions?: number | null;
  max_checkout_suggestions?: number | null;
};

export type CartLine = { productId: string; categoryId: string; quantity: number };

export type Suggestion = { productId: string; ruleId: string };

const PRIORITY_WEIGHT: Record<EnginePriority, number> = { high: 2, normal: 1, low: 0 };

function triggerWeight(type: EngineTriggerType): number {
  if (type === 'product') return 2;
  if (type === 'category') return 1;
  return 0;
}

function targetWeight(rule: EngineRule): number {
  const hasProductTarget = rule.targets.some((t) => t.target_type === 'product');
  return hasProductTarget ? 2 : 1;
}

function ruleSpecificity(rule: EngineRule): number {
  return triggerWeight(rule.trigger_type) * 10 + targetWeight(rule);
}

function isEligibleProduct(
  product: EngineProduct | undefined,
  excludeIds: Set<string>,
  dismissedIds: Set<string>,
): product is EngineProduct {
  if (!product) return false;
  if (product.disponible === false) return false;
  if ((product.precio ?? 0) <= 0) return false;
  if (product.upsell_enabled === false) return false;
  if (excludeIds.has(product.id)) return false;
  if (dismissedIds.has(product.id)) return false;
  return true;
}

function surfaceEnabled(settings: EngineSettings, surface: EngineSurface): boolean {
  if (surface === 'add_to_cart') return settings.show_add_to_cart !== false;
  if (surface === 'cart') return settings.show_cart !== false;
  return settings.show_checkout !== false;
}

function surfaceMaxSuggestions(settings: EngineSettings, surface: EngineSurface): number {
  if (surface === 'add_to_cart') return settings.max_add_suggestions ?? 2;
  if (surface === 'cart') return settings.max_cart_suggestions ?? 3;
  return settings.max_checkout_suggestions ?? 2;
}

function ruleTriggerMatches(
  rule: EngineRule,
  params: {
    productQtyInCart: Map<string, number>;
    categoryQtyInCart: Map<string, number>;
    justAddedProductId?: string | null;
    justAddedCategoryId?: string | null;
    surface: EngineSurface;
  },
): boolean {
  const minQty = rule.trigger_min_qty ?? 1;
  const { productQtyInCart, categoryQtyInCart, justAddedProductId, justAddedCategoryId, surface } = params;

  if (rule.trigger_type === 'product') {
    const productId = rule.trigger_product_id ?? '';
    if (!productId) return false;
    if (surface === 'add_to_cart' && justAddedProductId !== productId) return false;
    return (productQtyInCart.get(productId) ?? 0) >= minQty;
  }

  if (rule.trigger_type === 'category') {
    const categoryId = rule.trigger_category_id ?? '';
    if (!categoryId) return false;
    if (surface === 'add_to_cart' && justAddedCategoryId !== categoryId) return false;
    return (categoryQtyInCart.get(categoryId) ?? 0) >= minQty;
  }

  // trigger_type === 'cart': evaluated against the whole cart regardless of surface.
  if (rule.trigger_product_id) {
    return (productQtyInCart.get(rule.trigger_product_id) ?? 0) >= minQty;
  }
  if (rule.trigger_category_id) {
    return (categoryQtyInCart.get(rule.trigger_category_id) ?? 0) >= minQty;
  }
  return false;
}

export function resolveUpsellSuggestions(options: {
  settings: EngineSettings | null | undefined;
  rules: EngineRule[];
  products: Map<string, EngineProduct>;
  cart: CartLine[];
  cartTotal: number;
  surface: EngineSurface;
  orderType: EngineOrderType;
  justAddedProductId?: string | null;
  dismissedProductIds?: Set<string>;
}): Suggestion[] {
  const settings = options.settings ?? {};
  if (settings.enabled === false) return [];
  if (!surfaceEnabled(settings, options.surface)) return [];

  const dismissedIds = options.dismissedProductIds ?? new Set<string>();
  const cartProductIds = new Set(options.cart.map((line) => line.productId));

  const productQtyInCart = new Map<string, number>();
  const categoryQtyInCart = new Map<string, number>();
  for (const line of options.cart) {
    productQtyInCart.set(line.productId, (productQtyInCart.get(line.productId) ?? 0) + line.quantity);
    categoryQtyInCart.set(line.categoryId, (categoryQtyInCart.get(line.categoryId) ?? 0) + line.quantity);
  }

  const justAddedCategoryId = options.justAddedProductId
    ? options.products.get(options.justAddedProductId)?.categoria_id ?? null
    : null;

  const candidateRules = options.rules.filter((rule) => {
    if (rule.enabled === false) return false;
    if (rule.surface !== options.surface) return false;
    if (rule.order_type && rule.order_type !== options.orderType) return false;
    if (rule.min_cart_amount != null && options.cartTotal < rule.min_cart_amount) return false;
    if (rule.max_cart_amount != null && options.cartTotal > rule.max_cart_amount) return false;
    return ruleTriggerMatches(rule, {
      productQtyInCart,
      categoryQtyInCart,
      justAddedProductId: options.justAddedProductId,
      justAddedCategoryId,
      surface: options.surface,
    });
  });

  const sortedRules = [...candidateRules].sort((a, b) => {
    const specDelta = ruleSpecificity(b) - ruleSpecificity(a);
    if (specDelta !== 0) return specDelta;
    const priorityDelta = PRIORITY_WEIGHT[b.priority ?? 'normal'] - PRIORITY_WEIGHT[a.priority ?? 'normal'];
    if (priorityDelta !== 0) return priorityDelta;
    return 0;
  });

  const excludeFromSuggestions = new Set<string>(cartProductIds);
  if (options.justAddedProductId) excludeFromSuggestions.add(options.justAddedProductId);

  const flat: Suggestion[] = [];
  for (const rule of sortedRules) {
    const ruleBudget = rule.max_suggestions ?? 2;
    let takenForRule = 0;
    const sortedTargets = [...rule.targets]
      .filter((t) => t.enabled !== false)
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

    for (const target of sortedTargets) {
      if (takenForRule >= ruleBudget) break;
      if (target.target_type === 'product') {
        const product = options.products.get(target.product_id ?? '');
        if (isEligibleProduct(product, excludeFromSuggestions, dismissedIds)) {
          flat.push({ productId: product.id, ruleId: rule.id });
          takenForRule++;
        }
      } else {
        const categoryProducts = [...options.products.values()]
          .filter((p) => p.categoria_id === target.category_id)
          .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
        for (const product of categoryProducts) {
          if (takenForRule >= ruleBudget) break;
          if (isEligibleProduct(product, excludeFromSuggestions, dismissedIds)) {
            flat.push({ productId: product.id, ruleId: rule.id });
            takenForRule++;
          }
        }
      }
    }
  }

  const seen = new Set<string>();
  const deduped: Suggestion[] = [];
  for (const suggestion of flat) {
    if (seen.has(suggestion.productId)) continue;
    seen.add(suggestion.productId);
    deduped.push(suggestion);
  }

  return deduped.slice(0, surfaceMaxSuggestions(settings, options.surface));
}

export type FreeDeliveryGoal = {
  threshold: number;
  remaining: number;
  ratio: number;
  unlocked: boolean;
  enabled: boolean;
};

/**
 * Only ever real: `threshold` must come from merchant settings, and the goal
 * is gated by which order types the merchant opted in (delivery vs pickup).
 */
export function resolveFreeDeliveryGoal(params: {
  subtotal: number;
  threshold: number | null | undefined;
  orderType: EngineOrderType;
  applicableOrderTypes: string[] | null | undefined;
}): FreeDeliveryGoal {
  const threshold = params.threshold;
  const applicable = params.applicableOrderTypes ?? ['delivery'];
  if (threshold == null || threshold <= 0 || !applicable.includes(params.orderType)) {
    return { threshold: 0, remaining: 0, ratio: 0, unlocked: false, enabled: false };
  }
  const subtotal = Math.max(0, params.subtotal);
  const remaining = Math.max(0, threshold - subtotal);
  const ratio = Math.min(1, subtotal / threshold);
  return { threshold, remaining, ratio, unlocked: remaining <= 0, enabled: true };
}
