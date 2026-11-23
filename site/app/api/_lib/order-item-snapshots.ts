import {
  buildOrderLineSnapshot,
  parseProductMenuOptions,
  resolveCartLineUnitPrice,
  validateOptionGroupSelection,
  validateCustomizationSelection,
  resolveCombinedUnitPrice,
  type CartLineSelection,
  type OrderLineOptionSnapshot,
} from '../../_lib/menu-product-options';

export type OrderItemInput = {
  product_id: string;
  nombre: string;
  cantidad: number;
  precio: number;
  /** Weight-sold lines: precio is per kg, cantidad is kg. */
  unidad?: 'kg';
  venta_por_peso?: boolean;
};

export type StoredOrderItem = OrderItemInput & {
  imagen_url?: string | null;
  categoria_nombre?: string | null;
  producto?: string;
  precio_base?: number;
  selecciones?: OrderLineOptionSnapshot[];
  precio_final?: number;
  seleccion?: CartLineSelection;
  personalizacion?: {
    version: 1;
    regla_precio?: 'max';
    precio_final: number;
    componentes: Array<{
      product_id: string; nombre: string; precio_efectivo: number;
      selecciones: OrderLineOptionSnapshot[];
      exclusiones: Array<{ id: string; nombre: string }>;
    }>;
  };
};

export type SnapshotProductRow = {
  id: string;
  comercio_id?: string;
  disponible?: boolean | null;
  categoria_id?: string | null;
  nombre?: string | null;
  imagen_url?: string | null;
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

function toBaseUnitPrice(product: SnapshotProductRow): number | null {
  const base = Number(product.precio);
  if (!Number.isFinite(base) || base <= 0) return null;
  return roundMoney(base);
}

function productUnavailable(
  productName: string,
): Extract<OrderItemSnapshotResult, { ok: false }> {
  return {
    ok: false,
    status: 409,
    code: 'PRODUCT_UNAVAILABLE',
    message: `"${productName}" ya no está disponible. Actualiza el menú e inténtalo de nuevo.`,
  };
}

function assertProductUsable(
  product: SnapshotProductRow,
  item: OrderItemInput,
  comercioId: string | undefined,
): Extract<OrderItemSnapshotResult, { ok: false }> | null {
  const productName = (product.nombre ?? '').toString().trim() || item.nombre;
  if (product.disponible === false) {
    return productUnavailable(productName);
  }
  if (comercioId && product.comercio_id && product.comercio_id !== comercioId) {
    return productUnavailable(productName);
  }
  if (comercioId && !product.comercio_id) {
    // Scoped loaders always return comercio_id; missing tenant id is unsafe to trust.
    return productUnavailable(productName);
  }
  return null;
}

function priceChanged(productName: string): Extract<OrderItemSnapshotResult, { ok: false }> {
  return {
    ok: false,
    status: 409,
    code: 'PRICE_CHANGED',
    message: `El precio de "${productName}" cambió. Actualiza el menú e inténtalo de nuevo.`,
  };
}

/**
 * Freezes each line's chosen options (names + prices read from the DB at
 * order time) so later menu edits never alter historical orders.
 *
 * Client-supplied `precio` is never trusted when the catalog row exists.
 * Lines without `opciones` (Flutter / older clients) are re-priced from the
 * product's base `precio` column so the request contract stays the same.
 * Lines that send option selections are re-priced with the shared cart engine
 * and rejected when the rules or the quoted unit price don't match.
 */
export async function buildOrderItemSnapshots(params: {
  items: OrderItemInput[];
  selections: Array<CartLineSelection | null>;
  comercioId?: string;
  loadProducts: (productIds: string[]) => Promise<SnapshotProductRow[]>;
  loadCategories: (categoryIds: string[]) => Promise<SnapshotCategoryRow[]>;
}): Promise<OrderItemSnapshotResult> {
  const { items, selections } = params;
  const idsToLoad = [
    ...new Set(
      [...items.map((item) => item.product_id), ...selections.map((selection) => selection?.combinacion?.productId ?? '')].filter(Boolean),
    ),
  ];
  if (idsToLoad.length === 0) {
    return { ok: true, items: items.map((item) => ({ ...item })) };
  }

  const products = await params.loadProducts(idsToLoad);
  const productById = new Map(products.map((row) => [row.id, row]));

  const categoryIds = [
    ...new Set(
      products
        .map((row) => (row.categoria_id ?? '').toString().trim())
        .filter(Boolean),
    ),
  ];
  const categories = categoryIds.length > 0 ? await params.loadCategories(categoryIds) : [];
  const categoryById = new Map(categories.map((row) => [row.id, row]));

  const stored: StoredOrderItem[] = [];
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    const selection = selections[index];
    const product = productById.get(item.product_id);
    if (!product) {
      // Missing / foreign products must not keep a client-forged price.
      return productUnavailable(item.nombre || 'Producto');
    }

    const usabilityError = assertProductUsable(product, item, params.comercioId);
    if (usabilityError) return usabilityError;

    const category = categoryById.get((product.categoria_id ?? '').toString().trim()) ?? null;
    const catalogSnapshot = {
      imagen_url: product.imagen_url ?? null,
      categoria_nombre: category?.nombre ?? null,
    };
    const productName = (product.nombre ?? '').toString().trim() || item.nombre;
    const customization = parseProductMenuOptions(product.opciones_menu)?.personalizacion;
    if (customization || selection?.combinacion || selection?.exclusionesIds?.length) {
      const picked = selection ?? {};
      const errors = validateCustomizationSelection(product, picked);
      let partner: SnapshotProductRow | undefined;
      let partnerCategory: SnapshotCategoryRow | null = null;
      if (picked.combinacion) {
        const partnerId = picked.combinacion.productId;
        partner = productById.get(partnerId);
        if (!customization?.combinacion || !customization.combinacion.productosCompatibles.includes(partnerId) || partnerId === product.id) {
          return { ok: false, status: 400, code: 'INVALID_OPTIONS', message: 'Esta combinación no está permitida.' };
        }
        if (!partner || partner.disponible === false || !product.comercio_id || partner.comercio_id !== product.comercio_id) {
          return { ok: false, status: 409, code: 'PRODUCT_UNAVAILABLE', message: 'El producto compatible ya no está disponible.' };
        }
        errors.push(...validateCustomizationSelection(partner, picked.combinacion.seleccion));
        partnerCategory = categoryById.get(partner.categoria_id ?? '') ?? null;
      }
      if (errors.length) return { ok: false, status: 400, code: 'INVALID_OPTIONS', message: errors[0] };
      const component = (row: SnapshotProductRow, rowCategory: SnapshotCategoryRow | null, rowSelection: CartLineSelection) => {
        const options = parseProductMenuOptions(row.opciones_menu);
        return {
          product_id: row.id,
          nombre: row.nombre?.trim() || 'Producto',
          precio_efectivo: resolveCartLineUnitPrice(row, rowCategory, rowSelection),
          selecciones: buildOrderLineSnapshot(row, rowCategory, rowSelection).selecciones,
          exclusiones: (options?.personalizacion?.exclusiones?.ingredientes ?? []).filter((ingredient) => rowSelection.exclusionesIds?.includes(ingredient.id)),
        };
      };
      const components = [component(product, category, picked)];
      if (partner && picked.combinacion) components.push(component(partner, partnerCategory, picked.combinacion.seleccion));
      if (components.some((entry) => !Number.isFinite(entry.precio_efectivo) || entry.precio_efectivo <= 0)) {
        return { ok: false, status: 409, code: 'PRODUCT_UNAVAILABLE', message: 'Un componente no tiene un precio válido.' };
      }
      const price = resolveCombinedUnitPrice(product, category, picked, partner, partnerCategory);
      const combined = components.length === 2;
      const flat: OrderLineOptionSnapshot[] = combined
        ? [{ grupo: customization!.combinacion!.titulo, opcion: components.map((entry) => entry.nombre).join(' + '), precio: 0 }]
        : [];
      for (const entry of components) {
        flat.push(...entry.selecciones.map((option) => ({ ...option, grupo: combined ? `${entry.nombre} · ${option.grupo}` : option.grupo, precio: combined ? 0 : option.precio })));
        flat.push(...entry.exclusiones.map((ingredient) => ({ grupo: combined ? entry.nombre : '', opcion: `Sin ${ingredient.nombre}`, precio: 0 })));
      }
      const name = components.map((entry) => entry.nombre).join(' + ');
      stored.push({
        ...item, ...catalogSnapshot, nombre: name, producto: name, precio: price,
        precio_base: roundMoney(price - flat.reduce((sum, option) => sum + option.precio, 0)),
        precio_final: price, selecciones: flat, seleccion: picked,
        personalizacion: { version: 1, ...(combined ? { regla_precio: 'max' as const } : {}), precio_final: price, componentes: components },
      });
      continue;
    }

    // Flutter / older clients omit `opciones`. Re-price from the catalog base
    // column so forged unit prices cannot stick, without requiring option groups
    // that those clients never send.
    if (selection == null) {
      const serverPrice = toBaseUnitPrice(product);
      if (serverPrice == null) {
        return productUnavailable(productName);
      }
      stored.push({
        ...item,
        ...catalogSnapshot,
        nombre: productName,
        precio: serverPrice,
      });
      continue;
    }

    const selectsGroups = Object.keys(selection.grupos ?? {}).length > 0;
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
      if (!Number.isFinite(serverUnitPrice) || serverUnitPrice <= 0) {
        return productUnavailable(productName);
      }
      if (Math.abs(serverUnitPrice - item.precio) > PRICE_TOLERANCE) {
        return priceChanged(productName);
      }
    }

    if (!hasAnySelection(selection)) {
      const serverPrice = toBaseUnitPrice(product);
      if (serverPrice == null) {
        return productUnavailable(productName);
      }
      if (Math.abs(serverPrice - item.precio) > PRICE_TOLERANCE) {
        return priceChanged(productName);
      }
      stored.push({
        ...item,
        ...catalogSnapshot,
        nombre: productName,
        precio: serverPrice,
      });
      continue;
    }

    const snapshot = buildOrderLineSnapshot(product, category, selection);
    if (snapshot.selecciones.length === 0) {
      const serverPrice = resolveCartLineUnitPrice(product, category, selection);
      if (!Number.isFinite(serverPrice) || serverPrice <= 0) {
        return productUnavailable(productName);
      }
      if (Math.abs(serverPrice - item.precio) > PRICE_TOLERANCE) {
        return priceChanged(productName);
      }
      stored.push({
        ...item,
        ...catalogSnapshot,
        nombre: productName,
        precio: serverPrice,
        seleccion: selection,
      });
      continue;
    }

    // Size / adjustment / group lines always freeze the server unit price.
    const precioFinal = snapshot.precioFinal;
    if (!Number.isFinite(precioFinal) || precioFinal <= 0) {
      return productUnavailable(productName);
    }
    if (Math.abs(precioFinal - item.precio) > PRICE_TOLERANCE) {
      return priceChanged(productName);
    }
    const seleccionesTotal = snapshot.selecciones.reduce((sum, option) => sum + option.precio, 0);
    stored.push({
      ...item,
      ...catalogSnapshot,
      nombre: productName,
      producto: snapshot.producto,
      precio: precioFinal,
      precio_base: roundMoney(precioFinal - seleccionesTotal),
      selecciones: snapshot.selecciones,
      precio_final: precioFinal,
      seleccion: selection,
    });
  }

  return { ok: true, items: stored };
}
