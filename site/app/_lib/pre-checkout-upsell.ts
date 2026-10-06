/**
 * Optional pre-checkout upsell.
 *
 * Driven by category *types* (bebida / postre / acompanamiento / otro), never
 * by category display names. Inactive restaurants keep Cart → Checkout.
 */

export const PRE_CHECKOUT_UPSELL_KINDS = [
  'bebida',
  'postre',
  'acompanamiento',
  'otro',
] as const;

export type PreCheckoutUpsellKind = (typeof PRE_CHECKOUT_UPSELL_KINDS)[number];

export type PreCheckoutUpsellRule = {
  categoria_id?: string | null;
  categoria_origen?: string | null;
  sugerir_tipos: PreCheckoutUpsellKind[];
};

export type PreCheckoutListedCategory = {
  id: string;
  tipo: PreCheckoutUpsellKind;
};

export type PreCheckoutUpsellConfig = {
  activo: boolean;
  tipos: PreCheckoutUpsellKind[];
  max_productos: number;
  reglas: PreCheckoutUpsellRule[];
  categorias: PreCheckoutListedCategory[];
};

export type PublicPreCheckoutUpsell = {
  activo: true;
  tipos: PreCheckoutUpsellKind[];
  max_productos: number;
  reglas: PreCheckoutUpsellRule[];
  categorias: PreCheckoutListedCategory[];
};

export type PreCheckoutCategory = {
  id: string;
  nombre?: string | null;
  icono?: string | null;
  rol?: string | null;
  tipo_upselling?: string | null;
  orden?: number | null;
};

export type PreCheckoutProduct = {
  id: string;
  categoria_id?: string | null;
  nombre?: string | null;
  precio?: number | null;
  imagen_url?: string | null;
  disponible?: boolean | null;
  orden?: number | null;
};

export type PreCheckoutCartLine = {
  productId: string;
  categoryId?: string | null;
};

export type PreCheckoutSuggestedProduct = {
  id: string;
  nombre: string;
  precio: number;
  imagen_url: string | null;
  categoria_id: string;
};

export type PreCheckoutSuggestionGroup = {
  categoryId: string;
  categoryName: string;
  icono: string | null;
  kind: PreCheckoutUpsellKind;
  products: PreCheckoutSuggestedProduct[];
};

export const DEFAULT_PRE_CHECKOUT_UPSELL: PreCheckoutUpsellConfig = {
  activo: false,
  tipos: ['bebida', 'postre', 'acompanamiento'],
  max_productos: 4,
  reglas: [],
  categorias: [],
};

const KIND_SET = new Set<string>(PRE_CHECKOUT_UPSELL_KINDS);

function stripAccents(value: string) {
  return value.normalize('NFD').replace(/\p{M}/gu, '');
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function normalizeName(value: unknown) {
  return stripAccents(String(value ?? '').trim().toLowerCase());
}

export function parseCategoryUpsellKind(raw: unknown): PreCheckoutUpsellKind | null {
  const value = normalizeName(raw);
  if (!value || value === 'ninguno' || value === 'normal' || value === 'main' || value === 'none') {
    return null;
  }
  if (value === 'drink' || value === 'bebida' || value === 'bebidas') return 'bebida';
  if (value === 'dessert' || value === 'postre' || value === 'postres') return 'postre';
  if (
    value === 'side' ||
    value === 'acompanamiento' ||
    value === 'acompanante' ||
    value === 'complemento' ||
    value === 'complementos'
  ) {
    return 'acompanamiento';
  }
  if (value === 'other' || value === 'otro' || value === 'otros') return 'otro';
  return null;
}

function parseKinds(raw: unknown): PreCheckoutUpsellKind[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<PreCheckoutUpsellKind>();
  for (const item of raw) {
    const kind = KIND_SET.has(String(item))
      ? (item as PreCheckoutUpsellKind)
      : parseCategoryUpsellKind(item);
    if (!kind || seen.has(kind)) continue;
    seen.add(kind);
  }
  return [...seen];
}

function parseRules(raw: unknown): PreCheckoutUpsellRule[] {
  if (!Array.isArray(raw)) return [];
  const rules: PreCheckoutUpsellRule[] = [];
  for (const item of raw) {
    const row = asRecord(item);
    if (!row) continue;
    const sugerir = parseKinds(row.sugerir_tipos ?? row.sugerir ?? row.tipos);
    if (sugerir.length === 0) continue;
    const categoriaId = String(row.categoria_id ?? row.id ?? '').trim();
    const categoriaOrigen = String(row.categoria_origen ?? row.nombre ?? '').trim();
    if (!categoriaId && !categoriaOrigen) continue;
    rules.push({
      categoria_id: categoriaId || null,
      categoria_origen: categoriaOrigen || null,
      sugerir_tipos: sugerir,
    });
  }
  return rules;
}

function parseMaxProductos(raw: unknown) {
  const value = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(value)) return DEFAULT_PRE_CHECKOUT_UPSELL.max_productos;
  return Math.min(48, Math.max(1, Math.round(value)));
}

function parseListedCategories(raw: unknown): PreCheckoutListedCategory[] {
  if (!Array.isArray(raw)) return [];
  const listed: PreCheckoutListedCategory[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const row = asRecord(item);
    if (!row) continue;
    const id = String(row.id ?? row.categoria_id ?? '').trim();
    const tipo = parseCategoryUpsellKind(row.tipo ?? row.tipo_upselling ?? row.rol);
    if (!id || !tipo || seen.has(id)) continue;
    seen.add(id);
    listed.push({ id, tipo });
  }
  return listed;
}

function parseConfigObject(row: Record<string, unknown> | null): PreCheckoutUpsellConfig {
  if (!row) return { ...DEFAULT_PRE_CHECKOUT_UPSELL, tipos: [...DEFAULT_PRE_CHECKOUT_UPSELL.tipos] };
  const listed = parseListedCategories(row.categorias);
  const tipos = parseKinds(row.tipos);
  const fromListed = [...new Set(listed.map((item) => item.tipo))];
  return {
    activo: row.activo === true || row.enabled === true || row.upselling === true,
    tipos: tipos.length > 0 ? tipos : fromListed.length > 0 ? fromListed : [...DEFAULT_PRE_CHECKOUT_UPSELL.tipos],
    max_productos: parseMaxProductos(row.max_productos ?? row.maxProductos ?? row.max),
    reglas: parseRules(row.reglas ?? row.rules),
    categorias: listed,
  };
}

/** Accepts comercios.upsell_config, a slim public payload, or { upselling:false }. */
export function parsePreCheckoutUpsell(source: unknown): PreCheckoutUpsellConfig {
  if (source === false || source == null) {
    return { ...DEFAULT_PRE_CHECKOUT_UPSELL };
  }
  if (source === true) {
    return { ...DEFAULT_PRE_CHECKOUT_UPSELL, activo: true };
  }
  const root = asRecord(source);
  if (!root) return { ...DEFAULT_PRE_CHECKOUT_UPSELL };

  if (root.upselling === false && root.pre_checkout == null && root.activo == null) {
    return { ...DEFAULT_PRE_CHECKOUT_UPSELL };
  }

  const nested =
    asRecord(root.pre_checkout) ??
    asRecord(root.upselling) ??
    (root.activo != null || root.tipos != null || root.reglas != null || root.categorias != null
      ? root
      : null);

  return parseConfigObject(nested);
}

export function toPublicPreCheckoutUpsell(
  source: unknown,
): PublicPreCheckoutUpsell | null {
  const config = parsePreCheckoutUpsell(source);
  if (!config.activo) return null;
  return {
    activo: true,
    tipos: config.tipos,
    max_productos: config.max_productos,
    reglas: config.reglas,
    categorias: config.categorias,
  };
}

function categoryKind(
  category: PreCheckoutCategory,
  listedById: Map<string, PreCheckoutUpsellKind>,
) {
  return listedById.get(category.id) ?? parseCategoryUpsellKind(category.tipo_upselling ?? category.rol);
}

function ruleMatchesCart(
  rule: PreCheckoutUpsellRule,
  originIds: Set<string>,
  originNames: Set<string>,
) {
  const id = String(rule.categoria_id ?? '').trim();
  if (id && originIds.has(id)) return true;
  const name = normalizeName(rule.categoria_origen);
  return Boolean(name && originNames.has(name));
}

function resolveSuggestKinds(
  config: PreCheckoutUpsellConfig,
  originIds: Set<string>,
  originNames: Set<string>,
): PreCheckoutUpsellKind[] {
  const matched = config.reglas.filter((rule) => ruleMatchesCart(rule, originIds, originNames));
  if (matched.length === 0) return config.tipos;
  const seen = new Set<PreCheckoutUpsellKind>();
  for (const rule of matched) {
    for (const kind of rule.sugerir_tipos) seen.add(kind);
  }
  return [...seen];
}

function productPrice(product: PreCheckoutProduct) {
  const value = typeof product.precio === 'number' ? product.precio : Number(product.precio);
  return Number.isFinite(value) ? value : 0;
}

export function resolvePreCheckoutSuggestions(input: {
  config: unknown;
  categories: PreCheckoutCategory[];
  products: PreCheckoutProduct[];
  cart: PreCheckoutCartLine[];
}): PreCheckoutSuggestionGroup[] {
  const config = parsePreCheckoutUpsell(input.config);
  if (!config.activo || input.cart.length === 0) return [];

  const listedById = new Map(config.categorias.map((item) => [item.id, item.tipo]));
  const categoryById = new Map(input.categories.map((category) => [category.id, category]));
  const originIds = new Set<string>();
  const originNames = new Set<string>();

  for (const line of input.cart) {
    const categoryId = String(line.categoryId ?? '').trim();
    if (!categoryId) continue;
    originIds.add(categoryId);
    const origin = categoryById.get(categoryId);
    const name = normalizeName(origin?.nombre);
    if (name) originNames.add(name);
  }

  const suggestKinds = new Set(resolveSuggestKinds(config, originIds, originNames));
  if (suggestKinds.size === 0) return [];

  const candidatesByCategory = new Map<string, PreCheckoutSuggestedProduct[]>();
  const perCategoryCap = Math.max(config.max_productos, 4);

  const sortedProducts = [...input.products].sort((a, b) => {
    const orderA = typeof a.orden === 'number' ? a.orden : Number.MAX_SAFE_INTEGER;
    const orderB = typeof b.orden === 'number' ? b.orden : Number.MAX_SAFE_INTEGER;
    if (orderA !== orderB) return orderA - orderB;
    return String(a.nombre ?? '').localeCompare(String(b.nombre ?? ''), 'es');
  });

  for (const product of sortedProducts) {
    if (product.disponible === false) continue;
    const price = productPrice(product);
    if (price <= 0) continue;
    const categoryId = String(product.categoria_id ?? '').trim();
    const category = categoryById.get(categoryId);
    if (!category) continue;
    const kind = categoryKind(category, listedById);
    if (!kind || !suggestKinds.has(kind)) continue;
    if (originIds.has(category.id) && !suggestKinds.has(kind)) continue;

    const list = candidatesByCategory.get(category.id) ?? [];
    if (list.length >= perCategoryCap) continue;
    list.push({
      id: product.id,
      nombre: String(product.nombre ?? '').trim() || 'Producto',
      precio: price,
      imagen_url: product.imagen_url ? String(product.imagen_url) : null,
      categoria_id: category.id,
    });
    candidatesByCategory.set(category.id, list);
  }

  const groups = input.categories
    .filter((category) => {
      const kind = categoryKind(category, listedById);
      return Boolean(kind && suggestKinds.has(kind) && (candidatesByCategory.get(category.id)?.length ?? 0) > 0);
    })
    .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))
    .map((category) => ({
      categoryId: category.id,
      categoryName: String(category.nombre ?? '').trim() || 'Sugeridos',
      icono: category.icono ? String(category.icono) : null,
      kind: categoryKind(category, listedById) as PreCheckoutUpsellKind,
      products: candidatesByCategory.get(category.id) ?? [],
    }));

  if (groups.length === 0) return [];

  const selectedIds = new Set<string>();
  const trimmed: PreCheckoutSuggestionGroup[] = groups.map((group) => ({
    ...group,
    products: [],
  }));

  let added = 0;
  let round = 0;
  while (added < config.max_productos) {
    let progressed = false;
    for (let index = 0; index < groups.length && added < config.max_productos; index += 1) {
      const candidate = groups[index].products[round];
      if (!candidate || selectedIds.has(candidate.id)) continue;
      trimmed[index].products.push(candidate);
      selectedIds.add(candidate.id);
      added += 1;
      progressed = true;
    }
    if (!progressed) break;
    round += 1;
  }

  return trimmed.filter((group) => group.products.length > 0);
}

export function shouldShowPreCheckoutUpsell(input: {
  config: unknown;
  categories: PreCheckoutCategory[];
  products: PreCheckoutProduct[];
  cart: PreCheckoutCartLine[];
}) {
  return resolvePreCheckoutSuggestions(input).length > 0;
}
