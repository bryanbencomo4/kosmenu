export type ParsedSize = {
  codigo: string;
  etiqueta: string;
  precio: number;
};

export type ParsedAdjustment = {
  nombre: string;
  precio?: number;
};

export type ParsedProduct = {
  nombre: string;
  descripcion: string;
  precio?: number;
  tamanos?: ParsedSize[];
  ajustes?: ParsedAdjustment[];
};

export type ParsedCategory = {
  nombre: string;
  servicio_adicional?: { precios: Record<string, number> } | null;
  productos: ParsedProduct[];
};

export type ParsedMenu = {
  categorias: ParsedCategory[];
};

const SERVICIO_ADICIONAL_PATTERN = /servicio\s*adicional/i;

export function isServicioAdicionalName(value: string) {
  return SERVICIO_ADICIONAL_PATTERN.test(value.trim());
}

export function normalizeSizeCode(value: string) {
  const normalized = value.trim().toLowerCase();
  if (normalized === 'normal' || normalized === 'mediano' || normalized === 'm') {
    return 'n';
  }
  if (normalized === 'grande' || normalized === 'g') {
    return 'g';
  }
  return normalized.replace(/[^a-z0-9_-]/g, '').slice(0, 12) || 'n';
}

export function normalizeSizeLabel(code: string, explicit?: string) {
  const label = (explicit ?? '').trim();
  if (label) return label;
  if (code === 'n') return 'Normal (N)';
  if (code === 'g') return 'Grande (G)';
  return code.toUpperCase();
}

export function slugifyOptionId(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

export function toProductOptionsJson(product: ParsedProduct) {
  const tamanos = (product.tamanos ?? [])
    .map((entry) => {
      const id = normalizeSizeCode(entry.codigo || entry.etiqueta);
      const label = normalizeSizeLabel(id, entry.etiqueta);
      const precio = normalizePrice(entry.precio);
      if (!label || precio <= 0) return null;
      return { id, label, precio };
    })
    .filter(Boolean) as Array<{ id: string; label: string; precio: number }>;

  const ajustes = (product.ajustes ?? [])
    .map((entry) => {
      const label = (entry.nombre ?? '').trim();
      if (!label) return null;
      return {
        id: slugifyOptionId(label),
        label,
        precio: normalizePrice(entry.precio),
        tipo: 'checkbox' as const,
      };
    })
    .filter(Boolean);

  if (tamanos.length === 0 && ajustes.length === 0) {
    return null;
  }

  return {
    ...(tamanos.length > 0 ? { tamanos } : {}),
    ...(ajustes.length > 0 ? { ajustes } : {}),
  };
}

export function toCategoryOptionsJson(category: ParsedCategory) {
  const precios = category.servicio_adicional?.precios ?? {};
  const precios_por_tamano: Record<string, number> = {};

  for (const [key, value] of Object.entries(precios)) {
    const normalizedKey = normalizeSizeCode(key);
    const precio = normalizePrice(value);
    if (precio >= 0) {
      precios_por_tamano[normalizedKey] = precio;
    }
  }

  if (Object.keys(precios_por_tamano).length === 0) {
    return null;
  }

  return {
    servicio_adicional: {
      label: 'Servicio adicional',
      precios_por_tamano,
    },
  };
}

export function extractServicioAdicionalFromProducts(products: ParsedProduct[]) {
  const servicioProducts = products.filter((product) => isServicioAdicionalName(product.nombre));
  if (servicioProducts.length === 0) {
    return { remainingProducts: products, servicio: null as Record<string, number> | null };
  }

  const precios: Record<string, number> = {};
  for (const product of servicioProducts) {
    for (const size of product.tamanos ?? []) {
      const code = normalizeSizeCode(size.codigo || size.etiqueta);
      precios[code] = normalizePrice(size.precio);
    }
    if ((product.tamanos ?? []).length === 0) {
      precios.n = normalizePrice(product.precio);
    }
  }

  const remainingProducts = products.filter((product) => !isServicioAdicionalName(product.nombre));
  return {
    remainingProducts,
    servicio: Object.keys(precios).length > 0 ? precios : null,
  };
}

function normalizeCategoryKey(name: string) {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

export function mergeParsedMenus(target: ParsedMenu, incoming: ParsedMenu): ParsedMenu {
  const categoriesByKey = new Map<string, ParsedCategory>();

  for (const category of target.categorias ?? []) {
    categoriesByKey.set(normalizeCategoryKey(category.nombre), {
      ...category,
      productos: [...(category.productos ?? [])],
    });
  }

  for (const category of incoming.categorias ?? []) {
    const key = normalizeCategoryKey(category.nombre);
    const existing = categoriesByKey.get(key);

    if (!existing) {
      categoriesByKey.set(key, {
        ...category,
        productos: [...(category.productos ?? [])],
      });
      continue;
    }

    categoriesByKey.set(key, {
      nombre: existing.nombre || category.nombre,
      servicio_adicional: category.servicio_adicional ?? existing.servicio_adicional ?? null,
      productos: dedupeProducts([
        ...(existing.productos ?? []),
        ...(category.productos ?? []),
      ]),
    });
  }

  return {
    categorias: [...categoriesByKey.values()],
  };
}

export function postProcessParsedMenu(parsed: ParsedMenu): ParsedCategory[] {
  const output: ParsedCategory[] = [];
  let pendingServicio: Record<string, number> | null = null;

  for (const category of parsed.categorias ?? []) {
    const categoryName = (category?.nombre ?? 'Categoria').toString();
    let products = Array.isArray(category?.productos) ? category.productos : [];

    if (isServicioAdicionalName(categoryName)) {
      const extracted = extractServicioAdicionalFromProducts(products);
      pendingServicio = extracted.servicio ?? pendingServicio;
      continue;
    }

    const extractedFromProducts = extractServicioAdicionalFromProducts(products);
    products = extractedFromProducts.remainingProducts;

    const servicioFromCategory = category.servicio_adicional?.precios ?? null;
    const servicio =
      servicioFromCategory ??
      extractedFromProducts.servicio ??
      pendingServicio;

    pendingServicio = null;

    output.push({
      nombre: categoryName,
      servicio_adicional: servicio ? { precios: servicio } : null,
      productos: products.map((product) => ({
        nombre: (product?.nombre ?? 'Producto').toString(),
        descripcion: (product?.descripcion ?? '').toString(),
        precio: normalizePrice(product?.precio),
        tamanos: Array.isArray(product?.tamanos) ? product.tamanos : [],
        ajustes: Array.isArray(product?.ajustes) ? product.ajustes : [],
      })),
    });
  }

  return output.filter((category) => category.productos.length > 0);
}

export function resolveBaseProductPrice(product: ParsedProduct) {
  const sizePrices = (product.tamanos ?? [])
    .map((entry) => normalizePrice(entry.precio))
    .filter((value) => value > 0);

  if (sizePrices.length > 0) {
    return Math.min(...sizePrices);
  }

  return normalizePrice(product.precio);
}

export function normalizePrice(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;

  if (typeof value === 'string') {
    const normalized = value.trim().replaceAll(',', '.');
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

export function dedupeProducts(products: ParsedProduct[]): ParsedProduct[] {
  const seen = new Set<string>();
  const unique: ParsedProduct[] = [];

  for (const product of products) {
    const normalizedName = product.nombre.trim().toLowerCase();
    const normalizedDescription = product.descripcion.trim().toLowerCase();
    const basePrice = resolveBaseProductPrice(product);
    const key = `${normalizedName}|${normalizedDescription}|${basePrice}|${(product.tamanos ?? []).length}`;

    if (!normalizedName || seen.has(key)) {
      continue;
    }

    seen.add(key);
    unique.push(product);
  }

  return unique;
}
