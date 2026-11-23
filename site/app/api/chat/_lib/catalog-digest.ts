/**
 * Compact, tenant-bound catalog digest for the system prompt.
 * Never ships the full catalog — only counts, category names, and a few cheapest items.
 */
import type { LoadedPublicMenu } from '../../menu/_lib/load-public-menu';
import {
  getProductMaximumPrice,
  getProductMinimumPrice,
} from '../../../_lib/menu-product-options';
import { formatChatMoney, resolveMenuCurrency } from './chat-currency';

type ProductRow = {
  id: string;
  categoria_id?: string | null;
  nombre?: string | null;
  descripcion?: string | null;
  precio?: number | null;
  disponible?: boolean | null;
  opciones_menu?: unknown;
};

type CategoryRow = { id: string; nombre?: string | null };

const DIGEST_CHEAPEST_LIMIT = 6;
const DIGEST_CATEGORY_LIMIT = 12;
const DIGEST_MAX_CHARS = 1200;

export function buildCatalogDigest(menu: LoadedPublicMenu): string {
  const products = (menu.productos as ProductRow[]) || [];
  const categories = (menu.categorias as CategoryRow[]) || [];
  const currency = resolveMenuCurrency(menu);

  const available = products.filter((p) => p.disponible !== false);
  const priced = available
    .map((p) => ({
      name: (p.nombre || '').trim(),
      category:
        categories.find((c) => c.id === p.categoria_id)?.nombre?.trim() || null,
      price_min: getProductMinimumPrice(p),
      price_max: getProductMaximumPrice(p),
      base_price: Number(p.precio) || 0,
    }))
    .filter((p) => p.name && p.price_min > 0)
    .sort((a, b) => a.price_min - b.price_min || a.name.localeCompare(b.name));

  const cheapest = priced.slice(0, DIGEST_CHEAPEST_LIMIT);
  const catLines = categories.slice(0, DIGEST_CATEGORY_LIMIT).map((c) => {
    const n = available.filter((p) => p.categoria_id === c.id).length;
    return `- ${c.nombre || 'Sin nombre'} (${n} disponibles)`;
  });

  const cheapLines = cheapest.map((p) => {
    const range =
      p.price_max > p.price_min
        ? `${p.price_min}–${p.price_max}`
        : String(p.price_min);
    const cat = p.category ? ` [${p.category}]` : '';
    return `- ${p.name}${cat}: desde ${formatChatMoney(p.price_min, currency)} (base ${formatChatMoney(p.base_price, currency)})`;
  });

  const text = [
    'Resumen del catálogo real (no inventes fuera de esto; usa herramientas para detalles/precios exactos):',
    `Productos disponibles: ${available.length} de ${products.length}.`,
    'Categorías:',
    ...catLines,
    'Más económicos (precio mínimo configurado, incl. opciones obligatorias):',
    ...cheapLines,
    'Para “más económico” usa SIEMPRE la herramienta find_cheapest_products (no compares de memoria).',
  ].join('\n');

  return text.length > DIGEST_MAX_CHARS
    ? `${text.slice(0, DIGEST_MAX_CHARS - 1)}…`
    : text;
}
