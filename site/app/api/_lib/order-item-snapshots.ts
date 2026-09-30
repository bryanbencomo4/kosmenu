import {
  buildOrderLineSnapshot,
  parseProductMenuOptions,
  resolveCartLineUnitPrice,
  validateOptionGroupSelection,
  type CartLineSelection,
  type OrderLineOptionSnapshot,
} from '../../_lib/menu-product-options';

export type OrderItemInput = {
  product_id: string;
  nombre: string;
  cantidad: number;
  precio: number;
};

export type StoredOrderItem = OrderItemInput & {
  producto?: string;
  precio_base?: number;
  selecciones?: OrderLineOptionSnapshot[];
  precio_final?: number;
  seleccion?: CartLineSelection;
};

export type SnapshotProductRow = {
  id: string;
  categoria_id?: string | null;
  nombre?: string | null;
  precio?: number | null;
  opciones_menu?: unknown;
};

export type SnapshotCategoryRow = {
  id: string;
  nombre?: string | null;
  opciones_menu?: unknown;
};

export type OrderItemSnapshotResult =
  | { ok: true; items: StoredOrderItem[] }
  | { ok: false; status: 400 | 409; code: 'INVALID_OPTIONS' | 'PRICE_CHANGED' | 'PRODUCT_UNAVAILABLE'; message: string };

const PRICE_TOLERANCE = 0.01;

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function hasAnySelection(selection: CartLineSelection) {
  return Boolean(
    selection.tamanoId ||
      selection.servicioAdicional ||
      (selection.ajusteIds?.length ?? 0) > 0 ||
      Object.keys(selection.grupos ?? {}).length > 0,
  );
}

/**
 * Freezes each line's chosen options (names + prices read from the DB at
 * order time) so later menu edits never alter historical orders.
 *
 * Lines whose client didn't send `opciones` (e.g. older app builds) are
 * stored exactly as before. Lines for products with option groups are
 * re-priced server-side and rejected when the rules or the price don't match.
 */
export async function buildOrderItemSnapshots(params: {
  items: OrderItemInput[];
  selections: Array<CartLineSelection | null>;
  loadProducts: (productIds: string[]) => Promise<SnapshotProductRow[]>;
  loadCategories: (categoryIds: string[]) => Promise<SnapshotCategoryRow[]>;
}): Promise<OrderItemSnapshotResult> {
  const { items, selections } = params;
  const idsToLoad = [
    ...new Set(
      items
        .filter((_, index) => selections[index] != null)
        .map((item) => item.product_id),
    ),
  ];
  if (idsToLoad.length === 0) {
    return { ok: true, items: items.map((item) => ({ ...item })) };
  }

  const products = await params.loadProducts(idsToLoad);
  const productById = new Map(products.map((row) => [row.id, row]));

  const needsCategories = selections.some((selection) => selection?.servicioAdicional === true);
  const categoryIds = needsCategories
    ? [
        ...new Set(
          products
            .map((row) => (row.categoria_id ?? '').toString().trim())
            .filter(Boolean),
        ),
      ]
    : [];
  const categories = categoryIds.length > 0 ? await params.loadCategories(categoryIds) : [];
  const categoryById = new Map(categories.map((row) => [row.id, row]));

  const stored: StoredOrderItem[] = [];
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    const selection = selections[index];
    if (selection == null) {
      stored.push({ ...item });
      continue;
    }

    const product = productById.get(item.product_id);
    const selectsGroups = Object.keys(selection.grupos ?? {}).length > 0;
    if (!product) {
      if (selectsGroups) {
        return {
          ok: false,
          status: 409,
          code: 'PRODUCT_UNAVAILABLE',
          message: `"${item.nombre}" ya no está disponible. Actualiza el menú e inténtalo de nuevo.`,
        };
      }
      stored.push({ ...item });
      continue;
    }

    const category = categoryById.get((product.categoria_id ?? '').toString().trim()) ?? null;
    const productName = (product.nombre ?? '').toString().trim() || item.nombre;
    const hasGroups = (parseProductMenuOptions(product.opciones_menu)?.grupos?.length ?? 0) > 0;

    if (hasGroups || selectsGroups) {
      const issues = validateOptionGroupSelection(product, selection);
      if (issues.length > 0) {
        return {
          ok: false,
          status: 400,
          code: 'INVALID_OPTIONS',
          message: `${productName}: ${issues[0].message}`,
        };
      }
      const serverUnitPrice = resolveCartLineUnitPrice(product, category, selection);
      if (Math.abs(serverUnitPrice - item.precio) > PRICE_TOLERANCE) {
        return {
          ok: false,
          status: 409,
          code: 'PRICE_CHANGED',
          message: `El precio de "${productName}" cambió. Actualiza el menú e inténtalo de nuevo.`,
        };
      }
    }

    if (!hasAnySelection(selection)) {
      stored.push({ ...item });
      continue;
    }

    const snapshot = buildOrderLineSnapshot(product, category, selection);
    if (snapshot.selecciones.length === 0) {
      stored.push({ ...item, seleccion: selection });
      continue;
    }

    // Legacy size/adjustment lines keep the price the customer saw; the
    // base is derived so precio_base + sum(selecciones) === precio_final.
    const precioFinal = hasGroups || selectsGroups ? snapshot.precioFinal : roundMoney(item.precio);
    const seleccionesTotal = snapshot.selecciones.reduce((sum, option) => sum + option.precio, 0);
    stored.push({
      ...item,
      producto: snapshot.producto,
      precio_base: roundMoney(precioFinal - seleccionesTotal),
      selecciones: snapshot.selecciones,
      precio_final: precioFinal,
      seleccion: selection,
    });
  }

  return { ok: true, items: stored };
}
