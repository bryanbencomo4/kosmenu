import type { BusinessShop } from './auth';

export type BusinessMenuProduct = {
  id: string;
  name: string;
  description: string | null;
  price: number | null;
  currency: string;
  available: boolean;
  categoryId: string | null;
  imageUrl: string | null;
};

export type BusinessMenuCategory = {
  id: string;
  name: string;
  imageUrl: string | null;
  productCount: number;
  availableCount: number;
};

export type BusinessMenuView = {
  currency: string;
  categories: BusinessMenuCategory[];
  products: BusinessMenuProduct[];
};

export function buildMenuView(
  shop: BusinessShop,
  categoriesRaw: Array<{ id: unknown; nombre: unknown; imagen_url?: unknown }>,
  productsRaw: Array<{
    id: unknown;
    nombre: unknown;
    descripcion?: unknown;
    precio: unknown;
    disponible: unknown;
    categoria_id?: unknown;
    imagen_url?: unknown;
  }>,
): BusinessMenuView {
  const currency = (shop.moneda || 'USD').trim() || 'USD';
  const products: BusinessMenuProduct[] = productsRaw.map((p) => {
    const priceNum = Number(p.precio);
    return {
      id: String(p.id),
      name: String(p.nombre || 'Producto'),
      description: p.descripcion != null ? String(p.descripcion) : null,
      price: Number.isFinite(priceNum) ? priceNum : null,
      currency,
      available: p.disponible !== false,
      categoryId: p.categoria_id != null ? String(p.categoria_id) : null,
      imageUrl: p.imagen_url ? String(p.imagen_url) : null,
    };
  });

  const byCat = new Map<string, BusinessMenuProduct[]>();
  const uncategorized: BusinessMenuProduct[] = [];
  for (const p of products) {
    if (!p.categoryId) {
      uncategorized.push(p);
      continue;
    }
    const list = byCat.get(p.categoryId) || [];
    list.push(p);
    byCat.set(p.categoryId, list);
  }

  const categories: BusinessMenuCategory[] = [];
  for (const c of categoriesRaw) {
    const id = String(c.id);
    const inCat = byCat.get(id) || [];
    if (inCat.length === 0) continue;
    categories.push({
      id,
      name: String(c.nombre || 'Categoría'),
      imageUrl:
        (c.imagen_url ? String(c.imagen_url) : null) ||
        inCat.find((p) => p.imageUrl)?.imageUrl ||
        null,
      productCount: inCat.length,
      availableCount: inCat.filter((p) => p.available).length,
    });
  }
  if (uncategorized.length) {
    categories.push({
      id: '_none',
      name: 'Sin categoría',
      imageUrl: uncategorized.find((p) => p.imageUrl)?.imageUrl || null,
      productCount: uncategorized.length,
      availableCount: uncategorized.filter((p) => p.available).length,
    });
  }

  return { currency, categories, products };
}
