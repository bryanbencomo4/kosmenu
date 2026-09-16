export type MenuSizeOption = {
  id: string;
  label: string;
  precio: number;
};

export type MenuAdjustmentOption = {
  id: string;
  label: string;
  precio: number;
  tipo?: 'toggle' | 'checkbox';
};

export type ProductMenuOptions = {
  tamanos?: MenuSizeOption[];
  ajustes?: MenuAdjustmentOption[];
};

export type CategoryMenuOptions = {
  servicio_adicional?: {
    label?: string;
    precios_por_tamano?: Record<string, number>;
  };
};

export type CartLineSelection = {
  tamanoId?: string;
  tamanoLabel?: string;
  servicioAdicional?: boolean;
  ajusteIds?: string[];
};

type ProductLike = {
  id?: string;
  nombre?: string | null;
  precio?: number | null;
  opciones_menu?: unknown;
};

type CategoryLike = {
  nombre?: string | null;
  opciones_menu?: unknown;
};

const SERVICIO_ADICIONAL_PATTERN = /servicio\s*adicional/i;

export function isServicioAdicionalName(value: string) {
  return SERVICIO_ADICIONAL_PATTERN.test(value.trim());
}

export function parseProductMenuOptions(raw: unknown): ProductMenuOptions | null {
  if (!raw || typeof raw !== 'object') return null;

  const record = raw as Record<string, unknown>;
  const tamanosRaw = Array.isArray(record.tamanos) ? record.tamanos : [];
  const ajustesRaw = Array.isArray(record.ajustes) ? record.ajustes : [];

  const tamanos = tamanosRaw
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;
      const row = entry as Record<string, unknown>;
      const id = (row.id ?? '').toString().trim();
      const label = (row.label ?? '').toString().trim();
      const precio = toNumber(row.precio);
      if (!id || !label || precio === null || precio < 0) return null;
      return { id, label, precio };
    })
    .filter(Boolean) as MenuSizeOption[];

  const ajustes = ajustesRaw
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;
      const row = entry as Record<string, unknown>;
      const id = (row.id ?? '').toString().trim();
      const label = (row.label ?? '').toString().trim();
      const precio = toNumber(row.precio) ?? 0;
      if (!id || !label) return null;
      const tipoRaw = (row.tipo ?? 'checkbox').toString();
      const tipo = tipoRaw === 'toggle' ? 'toggle' : 'checkbox';
      return { id, label, precio, tipo };
    })
    .filter(Boolean) as MenuAdjustmentOption[];

  if (tamanos.length === 0 && ajustes.length === 0) {
    return null;
  }

  return {
    ...(tamanos.length > 0 ? { tamanos } : {}),
    ...(ajustes.length > 0 ? { ajustes } : {}),
  };
}

export function parseCategoryMenuOptions(raw: unknown): CategoryMenuOptions | null {
  if (!raw || typeof raw !== 'object') return null;

  const record = raw as Record<string, unknown>;
  const servicioRaw = record.servicio_adicional;
  if (!servicioRaw || typeof servicioRaw !== 'object') return null;

  const servicio = servicioRaw as Record<string, unknown>;
  const preciosRaw = servicio.precios_por_tamano;
  const precios_por_tamano: Record<string, number> = {};

  if (preciosRaw && typeof preciosRaw === 'object') {
    for (const [key, value] of Object.entries(preciosRaw)) {
      const normalizedKey = key.trim().toLowerCase();
      const precio = toNumber(value);
      if (!normalizedKey || precio === null || precio < 0) continue;
      precios_por_tamano[normalizedKey] = precio;
    }
  }

  if (Object.keys(precios_por_tamano).length === 0) {
    return null;
  }

  return {
    servicio_adicional: {
      label: (servicio.label ?? 'Servicio adicional').toString().trim() || 'Servicio adicional',
      precios_por_tamano,
    },
  };
}

export function productRequiresConfiguration(product: ProductLike, category?: CategoryLike | null) {
  const options = parseProductMenuOptions(product.opciones_menu);
  const categoryOptions = parseCategoryMenuOptions(category?.opciones_menu ?? null);
  const hasSizes = (options?.tamanos?.length ?? 0) > 0;
  const hasAdjustments = (options?.ajustes?.length ?? 0) > 0;
  const hasCategoryAddon = Boolean(categoryOptions?.servicio_adicional?.precios_por_tamano);
  return hasSizes || hasAdjustments || hasCategoryAddon;
}

export function getProductMinimumPrice(product: ProductLike) {
  const options = parseProductMenuOptions(product.opciones_menu);
  const sizePrices = (options?.tamanos ?? [])
    .map((entry) => entry.precio)
    .filter((value) => Number.isFinite(value) && value > 0);

  if (sizePrices.length > 0) {
    return Math.min(...sizePrices);
  }

  const base = toNumber(product.precio);
  return base !== null && base > 0 ? base : 0;
}

export function getProductMaximumPrice(product: ProductLike) {
  const options = parseProductMenuOptions(product.opciones_menu);
  const sizePrices = (options?.tamanos ?? [])
    .map((entry) => entry.precio)
    .filter((value) => Number.isFinite(value) && value > 0);

  if (sizePrices.length > 0) {
    return Math.max(...sizePrices);
  }

  return getProductMinimumPrice(product);
}

export function formatProductPriceLabel(product: ProductLike, formatPrice: (amount: number) => string) {
  const minPrice = getProductMinimumPrice(product);
  const maxPrice = getProductMaximumPrice(product);

  if (minPrice <= 0) {
    return 'Consultar';
  }

  if (maxPrice > minPrice) {
    return `Desde ${formatPrice(minPrice)}`;
  }

  return formatPrice(minPrice);
}

export function buildCartLineKey(productId: string, selection: CartLineSelection) {
  const tamanoId = (selection.tamanoId ?? '').trim();
  const ajusteIds = [...(selection.ajusteIds ?? [])].sort().join(',');
  const servicio = selection.servicioAdicional ? '1' : '0';
  return `${productId}::${tamanoId}::${servicio}::${ajusteIds}`;
}

export function parseCartLineKey(key: string): { productId: string; selection: CartLineSelection } {
  if (!key.includes('::')) {
    return { productId: key, selection: {} };
  }

  const [productId = '', tamanoId = '', servicio = '0', ajusteIdsRaw = ''] = key.split('::');
  const ajusteIds = ajusteIdsRaw
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

  return {
    productId,
    selection: {
      ...(tamanoId ? { tamanoId, tamanoLabel: tamanoId } : {}),
      servicioAdicional: servicio === '1',
      ...(ajusteIds.length > 0 ? { ajusteIds } : {}),
    },
  };
}

export function resolveCartLineUnitPrice(
  product: ProductLike,
  category: CategoryLike | null | undefined,
  selection: CartLineSelection,
) {
  const options = parseProductMenuOptions(product.opciones_menu);
  const categoryOptions = parseCategoryMenuOptions(category?.opciones_menu ?? null);
  let unitPrice = getProductMinimumPrice(product);

  if (options?.tamanos?.length) {
    const selectedSize =
      options.tamanos.find((entry) => entry.id === selection.tamanoId) ?? options.tamanos[0];
    unitPrice = selectedSize?.precio ?? unitPrice;
  } else {
    const base = toNumber(product.precio);
    if (base !== null && base > 0) {
      unitPrice = base;
    }
  }

  for (const ajusteId of selection.ajusteIds ?? []) {
    const ajuste = options?.ajustes?.find((entry) => entry.id === ajusteId);
    if (ajuste) {
      unitPrice += ajuste.precio;
    }
  }

  if (selection.servicioAdicional && categoryOptions?.servicio_adicional?.precios_por_tamano) {
    const tamanoKey = (selection.tamanoId ?? '').trim().toLowerCase();
    const addonPrice = categoryOptions.servicio_adicional.precios_por_tamano[tamanoKey];
    if (typeof addonPrice === 'number' && addonPrice >= 0) {
      unitPrice += addonPrice;
    }
  }

  return unitPrice;
}

export function buildOrderLineLabel(
  product: ProductLike,
  selection: CartLineSelection,
  category?: CategoryLike | null,
) {
  const parts = [((product.nombre ?? '').toString().trim() || 'Producto')];
  const options = parseProductMenuOptions(product.opciones_menu);
  const categoryOptions = parseCategoryMenuOptions(category?.opciones_menu ?? null);

  if (selection.tamanoLabel || selection.tamanoId) {
    const sizeLabel =
      options?.tamanos?.find((entry) => entry.id === selection.tamanoId)?.label ??
      selection.tamanoLabel ??
      selection.tamanoId;
    if (sizeLabel) {
      parts.push(String(sizeLabel));
    }
  }

  for (const ajusteId of selection.ajusteIds ?? []) {
    const ajuste = options?.ajustes?.find((entry) => entry.id === ajusteId);
    if (ajuste?.label) {
      parts.push(ajuste.label);
    }
  }

  if (selection.servicioAdicional) {
    parts.push(categoryOptions?.servicio_adicional?.label ?? 'Servicio adicional');
  }

  return parts.join(' · ');
}

export function summarizeCartLineSelection(
  product: ProductLike,
  selection: CartLineSelection,
  category?: CategoryLike | null,
) {
  const options = parseProductMenuOptions(product.opciones_menu);
  const categoryOptions = parseCategoryMenuOptions(category?.opciones_menu ?? null);
  const chunks: string[] = [];

  const sizeLabel =
    options?.tamanos?.find((entry) => entry.id === selection.tamanoId)?.label ??
    selection.tamanoLabel;
  if (sizeLabel) {
    chunks.push(String(sizeLabel));
  }

  for (const ajusteId of selection.ajusteIds ?? []) {
    const ajuste = options?.ajustes?.find((entry) => entry.id === ajusteId);
    if (ajuste?.label) {
      chunks.push(ajuste.label);
    }
  }

  if (selection.servicioAdicional) {
    chunks.push(categoryOptions?.servicio_adicional?.label ?? 'Servicio adicional');
  }

  return chunks.join(' · ');
}

function toNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number(value.trim().replaceAll(',', '.'));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}
