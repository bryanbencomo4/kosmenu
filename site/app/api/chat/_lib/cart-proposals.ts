/**
 * Server-side cart proposal builder for Phase 3.
 * Gemini may suggest intent; this module alone decides valid product/options/prices
 * using the same contracts as PublicMenuPage.
 */
import {
  buildCartLineKey,
  parseProductMenuOptions,
  resolveCartLineUnitPrice,
  resolveCombinedUnitPrice,
  validateCustomizationSelection,
  validateOptionGroupSelection,
  type CartLineSelection,
} from '../../../_lib/menu-product-options';
import { foldSearchText, fuzzyIncludes } from '../../../_lib/search-text';
import type { LoadedPublicMenu } from '../../menu/_lib/load-public-menu';
import { resolveCatalogProduct } from './catalog-search';
import {
  buildCombinationSelection,
  canCombineProducts,
  combinationDisplayName,
  type PendingCombinationConfig,
} from './chat-combination';
import { formatChatMoney, resolveMenuCurrency } from './chat-currency';

export type ChatCartSnapshotLine = {
  productId: string;
  quantity: number;
  selection: CartLineSelection;
};

export type ChatProductCard = {
  product_id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  currency: string;
  price_base: number | null;
  price_unit: number | null;
  price_label: string | null;
  line_total?: number | null;
  line_total_label?: string | null;
  available: boolean;
  requires_configuration: boolean;
  option_hints: string[];
  /** Human labels for selected options (size, extras, exclusions). */
  selected_options?: string[];
  quantity?: number;
};

type ProposalMeta = {
  /** Stable id for anti-double-confirm on the client. */
  proposal_id: string;
  /** Catalog fingerprint; null when not product-bound (e.g. checkout). */
  catalog_fingerprint: string | null;
};

export type ChatCartAction =
  | ({
      type: 'propose_add';
      requires_confirmation: true;
      cart_key: string;
      product_id: string;
      quantity: number;
      selection: CartLineSelection;
      unit_price: number;
      line_total: number;
      currency: string;
      label: string;
      product_card: ChatProductCard;
    } & ProposalMeta)
  | ({
      type: 'propose_update_qty';
      requires_confirmation: true;
      cart_key: string;
      product_id: string;
      quantity: number;
      selection: CartLineSelection;
      unit_price: number;
      line_total: number;
      currency: string;
      label: string;
    } & ProposalMeta)
  | ({
      type: 'propose_remove';
      requires_confirmation: true;
      cart_key: string;
      product_id: string;
      label: string;
    } & ProposalMeta)
  | ({
      type: 'open_checkout';
      requires_confirmation: true;
      label: string;
    } & ProposalMeta);

type ProductRow = {
  id: string;
  categoria_id?: string | null;
  nombre?: string | null;
  descripcion?: string | null;
  precio?: number | null;
  disponible?: boolean | null;
  opciones_menu?: unknown;
  imagen_url?: string | null;
};

type CategoryRow = { id: string; nombre?: string | null; opciones_menu?: unknown };

function norm(s: string) {
  return s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .trim();
}

function moneyLabel(amount: number, currency: string) {
  return formatChatMoney(amount, currency);
}

export function catalogFingerprint(product: {
  id: string;
  precio?: number | null;
  disponible?: boolean | null;
  opciones_menu?: unknown;
}): string {
  let optionsKey = '';
  try {
    optionsKey = JSON.stringify(product.opciones_menu ?? null);
  } catch {
    optionsKey = '';
  }
  return `${product.id}|${product.precio ?? ''}|${product.disponible !== false ? 1 : 0}|${optionsKey.length}:${optionsKey.slice(0, 120)}`;
}

function newProposalId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function describeSelection(
  product: ProductRow,
  selection: CartLineSelection,
): string[] {
  const labels: string[] = [];
  const options = parseProductMenuOptions(product.opciones_menu);
  for (const g of options?.grupos || []) {
    const ids = selection.grupos?.[g.id] || [];
    for (const id of ids) {
      const o = (g.opciones || []).find((x) => x.id === id);
      if (o) labels.push(`${g.nombre}: ${o.nombre}`);
    }
  }
  for (const exId of selection.exclusionesIds || []) {
    const ing = options?.personalizacion?.exclusiones?.ingredientes.find(
      (i) => i.id === exId,
    );
    if (ing) labels.push(`Sin ${ing.nombre}`);
  }
  return labels;
}

function asProducts(menu: LoadedPublicMenu): ProductRow[] {
  return (menu.productos as ProductRow[]) || [];
}

function findProduct(
  menu: LoadedPublicMenu,
  productId?: string | null,
  productName?: string | null,
): ProductRow | null {
  return resolveCatalogProduct(menu, productId, productName)?.product ?? null;
}

/** Ranked resolve — includes suggested option labels from option-value matches. */
function resolveProductWithHints(
  menu: LoadedPublicMenu,
  productId?: string | null,
  productName?: string | null,
) {
  return resolveCatalogProduct(menu, productId, productName);
}

function categoryFor(menu: LoadedPublicMenu, product: ProductRow) {
  const cats = (menu.categorias as CategoryRow[]) || [];
  return cats.find((c) => c.id === product.categoria_id) || null;
}

function optionLabelMatches(optionName: string, want: string): boolean {
  const have = norm(optionName);
  if (!want || !have) return false;
  if (have === want || have.includes(want) || want.includes(have)) return true;
  // cocacola ↔ coca-cola / CocaCola
  const compactHave = have.replace(/\s+/g, '');
  const compactWant = want.replace(/\s+/g, '');
  if (compactHave === compactWant) return true;
  if (fuzzyIncludes(have, want) || fuzzyIncludes(want, have)) return true;
  // "coca" vs "coca-cola"
  if (want.length >= 4 && (have.startsWith(want) || have.includes(want))) return true;
  return false;
}

function findOptionIdByLabel(
  product: ProductRow,
  groupNameHint: string | null,
  optionLabel: string,
): { groupId: string; optionId: string; groupName: string; optionName: string } | null {
  const options = parseProductMenuOptions(product.opciones_menu);
  if (!options?.grupos?.length) return null;
  const want = norm(optionLabel);
  const groupHint = groupNameHint ? norm(groupNameHint) : '';
  for (const g of options.grupos) {
    if (groupHint && !norm(g.nombre || '').includes(groupHint)) continue;
    for (const o of g.opciones || []) {
      if (optionLabelMatches(o.nombre || '', want)) {
        return {
          groupId: g.id,
          optionId: o.id,
          groupName: g.nombre,
          optionName: o.nombre,
        };
      }
    }
  }
  if (groupHint) {
    return findOptionIdByLabel(product, null, optionLabel);
  }
  return null;
}

function findExclusionId(product: ProductRow, ingredientLabel: string): string | null {
  const options = parseProductMenuOptions(product.opciones_menu);
  const list = options?.personalizacion?.exclusiones?.ingredientes || [];
  const want = norm(ingredientLabel);
  const hit = list.find(
    (i) => norm(i.nombre || '') === want || norm(i.nombre || '').includes(want),
  );
  return hit?.id || null;
}

export function buildProductCard(
  menu: LoadedPublicMenu,
  product: ProductRow,
  extras?: {
    unitPrice?: number | null;
    quantity?: number;
    selection?: CartLineSelection;
    lineTotal?: number | null;
  },
): ChatProductCard {
  const currency = resolveMenuCurrency(menu);
  const base = Number(product.precio);
  const unit = extras?.unitPrice ?? (Number.isFinite(base) ? base : null);
  const qty = extras?.quantity && extras.quantity > 0 ? extras.quantity : 1;
  const lineTotal =
    extras?.lineTotal ??
    (unit != null ? Math.round(unit * qty * 100) / 100 : null);
  const options = parseProductMenuOptions(product.opciones_menu);
  const hints = (options?.grupos || []).slice(0, 4).map((g) => {
    const choices = (g.opciones || [])
      .slice(0, 4)
      .map((o) => o.nombre)
      .join('/');
    return `${g.nombre}: ${choices}${g.obligatorio ? ' (obligatorio)' : ''}`;
  });
  const selected = extras?.selection
    ? describeSelection(product, extras.selection)
    : [];
  return {
    product_id: product.id,
    name: product.nombre || '',
    description: (product.descripcion || '').slice(0, 160) || null,
    image_url: (product.imagen_url || '').trim() || null,
    currency,
    price_base: Number.isFinite(base) && base > 0 ? base : null,
    price_unit: unit,
    price_label: unit != null ? moneyLabel(unit, currency) : null,
    line_total: lineTotal,
    line_total_label: lineTotal != null ? moneyLabel(lineTotal, currency) : null,
    available: product.disponible !== false,
    requires_configuration: Boolean(
      (options?.grupos || []).some((g) => g.obligatorio || g.min > 0),
    ),
    option_hints: hints,
    selected_options: selected,
    quantity: extras?.quantity,
  };
}

export type PrepareCartLineInput = {
  product_id?: string;
  product_name?: string;
  quantity?: number;
  /** Option labels the customer asked for, e.g. ["Grande"] */
  option_labels?: string[];
  /** Group-scoped choices: [{ group: "Tamaños", option: "Grande" }] */
  option_choices?: Array<{ group?: string; option: string }>;
  /** Ingredients to exclude if the product allows it */
  exclude_ingredients?: string[];
  /** Second half for traditional-menu combinación (one cart line, MAX price). */
  combine_with_product_id?: string;
  combine_with_product_name?: string;
  /** Client-supplied absolute price — always rejected */
  client_unit_price?: number;
};

export type PrepareCartLineResult =
  | {
      status: 'ready';
      action: Extract<ChatCartAction, { type: 'propose_add' }>;
      missing_groups: [];
      message: string;
      pending_configuration?: undefined;
    }
  | {
      status: 'needs_options';
      product_card: ChatProductCard;
      missing_groups: Array<{
        id: string;
        name: string;
        required: boolean;
        choices: string[];
      }>;
      message: string;
      /** Structured pending op so the client can complete size without re-searching. */
      pending_configuration?: PendingCombinationConfig | null;
      /** When true, UI must NOT show a product browse carousel — only attribute chips. */
      ask_attribute_only?: boolean;
    }
  | {
      status:
        | 'unavailable'
        | 'not_found'
        | 'foreign_product'
        | 'invalid_options'
        | 'price_tamper'
        | 'combination_not_allowed';
      message: string;
      product_card?: ChatProductCard;
    };

export function prepareCartLineProposal(
  menu: LoadedPublicMenu,
  commerceId: string,
  input: PrepareCartLineInput,
): PrepareCartLineResult {
  if (menu.resolvedComercioId !== commerceId) {
    return { status: 'foreign_product', message: 'Producto de otro restaurante.' };
  }

  if (
    input.client_unit_price != null &&
    Number.isFinite(input.client_unit_price)
  ) {
    return {
      status: 'price_tamper',
      message:
        'El precio lo calcula el servidor. No se aceptan precios enviados por el cliente o el modelo.',
    };
  }

  const resolved = resolveProductWithHints(
    menu,
    input.product_id,
    input.product_name,
  );
  const product = resolved?.product ?? null;
  if (!product) {
    return { status: 'not_found', message: 'Producto no encontrado en este menú.' };
  }
  if (!asProducts(menu).some((p) => p.id === product.id)) {
    return { status: 'foreign_product', message: 'Producto no autorizado.' };
  }
  if (product.disponible === false) {
    return {
      status: 'unavailable',
      message: `${product.nombre || 'Producto'} no está disponible ahora.`,
      product_card: buildProductCard(menu, product),
    };
  }

  const qtyRaw = Number(input.quantity);
  const quantity =
    Number.isFinite(qtyRaw) && qtyRaw > 0 ? Math.min(99, Math.floor(qtyRaw)) : 1;

  // Resolve optional combination partner (traditional-menu combinación).
  let partner: ProductRow | null = null;
  const wantCombine =
    Boolean(input.combine_with_product_id?.trim()) ||
    Boolean(input.combine_with_product_name?.trim());
  if (wantCombine) {
    partner =
      resolveProductWithHints(
        menu,
        input.combine_with_product_id,
        input.combine_with_product_name,
      )?.product ?? null;
    if (!partner) {
      return {
        status: 'not_found',
        message: `No encontré la segunda mitad «${input.combine_with_product_name || input.combine_with_product_id}» en este menú.`,
      };
    }
    const allowed = canCombineProducts(product, partner);
    if (allowed.ok === false) {
      return {
        status: 'combination_not_allowed',
        message: allowed.reason,
        product_card: buildProductCard(menu, product),
      };
    }
  }

  let selection: CartLineSelection = { grupos: {}, exclusionesIds: [] };
  // option_choices first; then explicit labels; then labels inferred when the
  // product was resolved via an option value (e.g. “Coca-Cola” → refresco).
  const choices: Array<{ group?: string; option: string }> = [
    ...(input.option_choices || []),
  ];
  for (const option of [
    ...(input.option_labels || []),
    // For combinations, do NOT auto-apply option labels from name resolution
    // of the partner (avoids flavor confusion). Only use primary suggested.
    ...(!partner ? resolved?.suggested_option_labels || [] : []),
  ]) {
    if (
      choices.some((c) =>
        optionLabelMatches(c.option, foldSearchText(option)),
      )
    ) {
      continue;
    }
    choices.push({ option });
  }

  for (const choice of choices) {
    const hit = findOptionIdByLabel(product, choice.group || null, choice.option);
    if (!hit) {
      return {
        status: 'invalid_options',
        message: `La opción «${choice.option}» no existe para ${product.nombre}.`,
        product_card: buildProductCard(menu, product),
      };
    }
    selection.grupos = selection.grupos || {};
    selection.grupos[hit.groupId] = [hit.optionId];
  }

  for (const ing of input.exclude_ingredients || []) {
    const exId = findExclusionId(product, ing);
    if (!exId) {
      return {
        status: 'invalid_options',
        message: `No se puede quitar «${ing}» en ${product.nombre}: el restaurante no ofrece esa personalización.`,
        product_card: buildProductCard(menu, product),
      };
    }
    selection.exclusionesIds = [...(selection.exclusionesIds || []), exId];
  }

  const optionsParsed = parseProductMenuOptions(product.opciones_menu);
  const missing_groups = (optionsParsed?.grupos || [])
    .filter((g) => g.obligatorio || g.min > 0)
    .filter((g) => (selection.grupos?.[g.id]?.length || 0) < g.min)
    .map((g) => ({
      id: g.id,
      name: g.nombre,
      required: true,
      choices: (g.opciones || []).map((o) => o.nombre),
    }));
  if (missing_groups.length > 0) {
    const sizeGroup = missing_groups.find((g) =>
      /tamano|tamaño|size/i.test(g.name),
    );
    const pending_configuration: PendingCombinationConfig | null =
      partner
        ? {
            product_id: product.id,
            product_name: product.nombre || '',
            combine_with_product_id: partner.id,
            combine_with_product_name: partner.nombre || '',
            quantity,
            option_labels: (input.option_labels || []).slice(),
            exclude_ingredients: (input.exclude_ingredients || []).slice(),
            missing_attribute: sizeGroup ? 'size' : 'options',
            size_choices: sizeGroup?.choices ?? missing_groups[0]?.choices ?? [],
          }
        : null;
    const comboHint = partner
      ? ` pizza combinada ${product.nombre} + ${partner.nombre}`
      : ` ${product.nombre}`;
    return {
      status: 'needs_options',
      product_card: buildProductCard(menu, product),
      missing_groups,
      ask_attribute_only: true,
      pending_configuration,
      message: partner
        ? `¡Dale! ¿Qué tamaño prefieres para tu${comboHint}? ${missing_groups.map((g) => g.choices.join(' o ')).join(' / ')}.`
        : `Falta elegir: ${missing_groups.map((g) => g.name).join(', ')}.`,
    };
  }

  if (partner) {
    selection = buildCombinationSelection(product, partner, selection);
  }

  const issues = partner
    ? [
        ...validateCustomizationSelection(product, selection),
        ...validateCustomizationSelection(
          partner,
          selection.combinacion!.seleccion,
        ),
      ]
    : validateOptionGroupSelection(product, selection).map((i) => i.message);
  if (issues.length > 0) {
    return {
      status: 'invalid_options',
      message: issues.join(' ') || 'Selección inválida.',
      product_card: buildProductCard(menu, product),
    };
  }

  const category = categoryFor(menu, product);
  const partnerCategory = partner ? categoryFor(menu, partner) : null;
  const unit_price = partner
    ? resolveCombinedUnitPrice(
        product,
        category,
        selection,
        partner,
        partnerCategory,
      )
    : resolveCartLineUnitPrice(product, category, selection);
  if (!(unit_price > 0)) {
    return {
      status: 'invalid_options',
      message: 'No se pudo calcular un precio válido para esta selección.',
      product_card: buildProductCard(menu, product),
    };
  }

  const currency = resolveMenuCurrency(menu);
  const cart_key = buildCartLineKey(product.id, selection);
  const selectedLabels = describeSelection(product, selection);
  const displayName = partner
    ? combinationDisplayName(product, partner)
    : product.nombre || 'Producto';
  const label = `${quantity}× ${displayName}${
    selectedLabels.length
      ? ` (${selectedLabels.join(', ')})`
      : choices.length
        ? ` (${choices.map((c) => c.option).join(', ')})`
        : ''
  }`;
  const line_total = Math.round(unit_price * quantity * 100) / 100;
  const product_card = buildProductCard(menu, product, {
    unitPrice: unit_price,
    quantity,
    selection,
    lineTotal: line_total,
  });
  if (partner) {
    product_card.name = displayName;
    product_card.selected_options = [
      ...(product_card.selected_options || []),
      `Mitad 2: ${partner.nombre}`,
    ];
  }
  const fingerprint = catalogFingerprint(product);

  return {
    status: 'ready',
    missing_groups: [],
    message: `Propuesta lista: ${label} — ${moneyLabel(line_total, currency)}. Confirma para agregar al carrito.`,
    action: {
      type: 'propose_add',
      requires_confirmation: true,
      proposal_id: newProposalId('add'),
      catalog_fingerprint: fingerprint,
      cart_key,
      product_id: product.id,
      quantity,
      selection,
      unit_price,
      line_total,
      currency,
      label,
      product_card,
    },
  };
}

/**
 * Build a propose_add from an already-chosen sheet selection (chat in-flow).
 * Prices always come from resolveCartLineUnitPrice — never from the client.
 */
export function buildProposeAddFromSelection(params: {
  menu: LoadedPublicMenu;
  commerceId: string;
  productId: string;
  selection: CartLineSelection;
  quantity: number;
}): PrepareCartLineResult {
  if (params.menu.resolvedComercioId !== params.commerceId) {
    return { status: 'foreign_product', message: 'Producto de otro restaurante.' };
  }
  const product = findProduct(params.menu, params.productId, null);
  if (!product) {
    return { status: 'not_found', message: 'Producto no encontrado en este menú.' };
  }
  if (product.disponible === false) {
    return {
      status: 'unavailable',
      message: `${product.nombre} no está disponible ahora.`,
      product_card: buildProductCard(params.menu, product),
    };
  }
  const qty = Math.min(99, Math.max(1, Math.floor(Number(params.quantity) || 1)));
  const partnerId = params.selection.combinacion?.productId;
  const partner = partnerId
    ? findProduct(params.menu, partnerId, null)
    : null;
  if (params.selection.combinacion && !partner) {
    return {
      status: 'combination_not_allowed',
      message: 'Esta combinación no está permitida.',
      product_card: buildProductCard(params.menu, product),
    };
  }
  if (partner) {
    const allowed = canCombineProducts(product, partner);
    if (allowed.ok === false) {
      return {
        status: 'combination_not_allowed',
        message: allowed.reason,
        product_card: buildProductCard(params.menu, product),
      };
    }
  }
  const issues = partner
    ? [
        ...validateCustomizationSelection(product, params.selection),
        ...validateCustomizationSelection(
          partner,
          params.selection.combinacion!.seleccion,
        ),
      ]
    : validateOptionGroupSelection(product, params.selection).map(
        (i) => i.message,
      );
  if (issues.length) {
    return {
      status: 'invalid_options',
      message: issues.join(' '),
      product_card: buildProductCard(params.menu, product),
    };
  }
  const category = categoryFor(params.menu, product);
  const unit_price = partner
    ? resolveCombinedUnitPrice(
        product,
        category,
        params.selection,
        partner,
        categoryFor(params.menu, partner),
      )
    : resolveCartLineUnitPrice(product, category, params.selection);
  if (!(unit_price > 0)) {
    return {
      status: 'invalid_options',
      message: 'No se pudo calcular un precio válido.',
      product_card: buildProductCard(params.menu, product),
    };
  }
  const currency = resolveMenuCurrency(params.menu);
  const cart_key = buildCartLineKey(product.id, params.selection);
  const selectedLabels = describeSelection(product, params.selection);
  const displayName = partner
    ? combinationDisplayName(product, partner)
    : product.nombre || 'Producto';
  const line_total = Math.round(unit_price * qty * 100) / 100;
  const label = `${qty}× ${displayName}${
    selectedLabels.length ? ` (${selectedLabels.join(', ')})` : ''
  }`;
  const product_card = buildProductCard(params.menu, product, {
    unitPrice: unit_price,
    quantity: qty,
    selection: params.selection,
    lineTotal: line_total,
  });
  if (partner) {
    product_card.name = displayName;
  }
  return {
    status: 'ready',
    missing_groups: [],
    message: `Propuesta lista: ${label} — ${moneyLabel(line_total, currency)}.`,
    action: {
      type: 'propose_add',
      requires_confirmation: true,
      proposal_id: newProposalId('add'),
      catalog_fingerprint: catalogFingerprint(product),
      cart_key,
      product_id: product.id,
      quantity: qty,
      selection: params.selection,
      unit_price,
      line_total,
      currency,
      label,
      product_card,
    },
  };
}

/** Re-check a propose_add against the live catalog before applying. */
export function revalidateProposeAdd(
  menu: LoadedPublicMenu,
  commerceId: string,
  action: Extract<ChatCartAction, { type: 'propose_add' }>,
):
  | { ok: true; action: Extract<ChatCartAction, { type: 'propose_add' }> }
  | { ok: false; reason: 'stale' | 'invalid' | 'unavailable' | 'foreign'; message: string } {
  if (menu.resolvedComercioId !== commerceId) {
    return { ok: false, reason: 'foreign', message: 'Comercio no autorizado.' };
  }
  const product = findProduct(menu, action.product_id, null);
  if (!product) {
    return { ok: false, reason: 'invalid', message: 'Producto ya no existe.' };
  }
  if (product.disponible === false) {
    return { ok: false, reason: 'unavailable', message: 'Producto no disponible.' };
  }
  const fp = catalogFingerprint(product);
  if (
    action.catalog_fingerprint &&
    action.catalog_fingerprint !== fp
  ) {
    return {
      ok: false,
      reason: 'stale',
      message: 'El catálogo cambió. Vuelve a confirmar la selección.',
    };
  }
  const issues = validateOptionGroupSelection(product, action.selection);
  if (issues.length) {
    return { ok: false, reason: 'invalid', message: issues[0].message };
  }
  const unit_price = resolveCartLineUnitPrice(
    product,
    categoryFor(menu, product),
    action.selection,
  );
  if (!(unit_price > 0)) {
    return { ok: false, reason: 'invalid', message: 'Precio inválido.' };
  }
  // Ignore any client-claimed unit_price — server wins (Fase 0).
  const quantity = Math.min(99, Math.max(1, Math.floor(action.quantity || 1)));
  const line_total = Math.round(unit_price * quantity * 100) / 100;
  const currency = resolveMenuCurrency(menu);
  const cart_key = buildCartLineKey(product.id, action.selection);
  return {
    ok: true,
    action: {
      ...action,
      cart_key,
      unit_price,
      line_total,
      quantity,
      currency,
      catalog_fingerprint: fp,
      product_card: buildProductCard(menu, product, {
        unitPrice: unit_price,
        quantity,
        selection: action.selection,
        lineTotal: line_total,
      }),
    },
  };
}

export function summarizeCartSnapshot(
  menu: LoadedPublicMenu,
  commerceId: string,
  lines: ChatCartSnapshotLine[],
): {
  ok: boolean;
  currency: string;
  item_count: number;
  subtotal: number;
  subtotal_label: string;
  lines: Array<{
    cart_key: string;
    product_id: string;
    name: string;
    quantity: number;
    unit_price: number;
    line_total: number;
    label: string;
  }>;
  errors: string[];
} {
  const currency = resolveMenuCurrency(menu);
  if (menu.resolvedComercioId !== commerceId) {
    return {
      ok: false,
      currency,
      item_count: 0,
      subtotal: 0,
      subtotal_label: moneyLabel(0, currency),
      lines: [],
      errors: ['Tenant mismatch'],
    };
  }

  const errors: string[] = [];
  const out: Array<{
    cart_key: string;
    product_id: string;
    name: string;
    quantity: number;
    unit_price: number;
    line_total: number;
    label: string;
  }> = [];

  for (const line of lines) {
    const product = asProducts(menu).find((p) => p.id === line.productId);
    if (!product) {
      errors.push(`Producto ausente del catálogo: ${line.productId}`);
      continue;
    }
    const selection = line.selection || {};
    const issues = validateOptionGroupSelection(product, selection);
    if (issues.length) {
      errors.push(
        `${product.nombre}: ${issues.map((i) => i.message).join('; ')}`,
      );
      continue;
    }
    const unit_price = resolveCartLineUnitPrice(
      product,
      categoryFor(menu, product),
      selection,
    );
    const quantity = Math.max(0, Number(line.quantity) || 0);
    if (!(unit_price > 0) || !(quantity > 0)) continue;
    const cart_key = buildCartLineKey(product.id, selection);
    const selected = describeSelection(product, selection);
    out.push({
      cart_key,
      product_id: product.id,
      name: product.nombre || '',
      quantity,
      unit_price,
      line_total: Math.round(unit_price * quantity * 100) / 100,
      label: `${quantity}× ${product.nombre}${
        selected.length ? ` (${selected.join(', ')})` : ''
      }`,
    });
  }

  const subtotal = Math.round(out.reduce((s, l) => s + l.line_total, 0) * 100) / 100;
  return {
    ok: errors.length === 0,
    currency,
    item_count: out.reduce((s, l) => s + l.quantity, 0),
    subtotal,
    subtotal_label: moneyLabel(subtotal, currency),
    lines: out,
    errors,
  };
}

export function proposeRemoveFromSnapshot(
  menu: LoadedPublicMenu,
  commerceId: string,
  lines: ChatCartSnapshotLine[],
  productNameOrId: string,
): Extract<ChatCartAction, { type: 'propose_remove' }> | { error: string } {
  const summary = summarizeCartSnapshot(menu, commerceId, lines);
  const n = norm(productNameOrId);
  const hit =
    summary.lines.find((l) => l.product_id === productNameOrId) ||
    summary.lines.find(
      (l) => norm(l.name) === n || norm(l.name).includes(n),
    );
  if (!hit) return { error: 'No encontré ese producto en el carrito actual.' };
  return {
    type: 'propose_remove',
    requires_confirmation: true,
    proposal_id: newProposalId('rm'),
    catalog_fingerprint: null,
    cart_key: hit.cart_key,
    product_id: hit.product_id,
    label: `Quitar ${hit.label}`,
  };
}

export function proposeUpdateQtyInSnapshot(
  menu: LoadedPublicMenu,
  commerceId: string,
  lines: ChatCartSnapshotLine[],
  productNameOrId: string,
  quantity: number,
):
  | Extract<ChatCartAction, { type: 'propose_update_qty' }>
  | Extract<ChatCartAction, { type: 'propose_remove' }>
  | { error: string } {
  const summary = summarizeCartSnapshot(menu, commerceId, lines);
  const n = norm(productNameOrId);
  const hit =
    summary.lines.find((l) => l.product_id === productNameOrId) ||
    summary.lines.find(
      (l) => norm(l.name) === n || norm(l.name).includes(n),
    );
  if (!hit) return { error: 'No encontré ese producto en el carrito actual.' };
  const qty = Math.min(99, Math.max(0, Math.floor(Number(quantity) || 0)));
  if (qty <= 0) {
    return {
      type: 'propose_remove',
      requires_confirmation: true,
      proposal_id: newProposalId('rm'),
      catalog_fingerprint: null,
      cart_key: hit.cart_key,
      product_id: hit.product_id,
      label: `Quitar ${hit.name}`,
    };
  }
  return {
    type: 'propose_update_qty',
    requires_confirmation: true,
    proposal_id: newProposalId('qty'),
    catalog_fingerprint: null,
    cart_key: hit.cart_key,
    product_id: hit.product_id,
    quantity: qty,
    selection:
      lines.find((l) => buildCartLineKey(l.productId, l.selection) === hit.cart_key)
        ?.selection || {},
    unit_price: hit.unit_price,
    line_total: Math.round(hit.unit_price * qty * 100) / 100,
    currency: summary.currency,
    label: `${qty}× ${hit.name}`,
  };
}
