/**
 * Deterministic catalog retrieval for chatbot tools.
 * Indexes name, description, category, and option labels (flavors/sizes/extras)
 * without inventing SKUs. Tenant-bound via the LoadedPublicMenu snapshot.
 */
import type { LoadedPublicMenu } from '../../menu/_lib/load-public-menu';
import { parseProductMenuOptions } from '../../../_lib/menu-product-options';
import {
  foldSearchText,
  fuzzyIncludes,
  scoreFoldedMatch,
  tokenizeSearchText,
} from '../../../_lib/search-text';

type ProductRow = {
  id: string;
  categoria_id?: string | null;
  nombre?: string | null;
  descripcion?: string | null;
  precio?: number | null;
  disponible?: boolean | null;
  opciones_menu?: unknown;
  imagen_url?: string | null;
  etiquetas?: unknown;
};

type CategoryRow = { id: string; nombre?: string | null };

export type CatalogMatchField =
  | 'name_exact'
  | 'name'
  | 'category'
  | 'description'
  | 'option_value'
  | 'option_group'
  | 'tag'
  | 'fuzzy';

export type CatalogOptionMatch = {
  group: string;
  option: string;
  group_id?: string;
  option_id?: string;
};

export type CatalogSearchHit = {
  product: ProductRow;
  score: number;
  matched_field: CatalogMatchField;
  matched_option: string | null;
  matched_group: string | null;
  matched_tokens: string[];
  category_name: string | null;
  /** Suggested option labels to pass into prepare_cart_line_proposal */
  suggested_option_labels: string[];
};

export type CatalogSearchResult = {
  count: number;
  hits: CatalogSearchHit[];
  query_normalized: string;
  query_tokens: string[];
  searched_options: boolean;
  ambiguous: boolean;
  note?: string;
};

type IndexedOption = {
  groupName: string;
  groupId: string;
  optionName: string;
  optionId: string;
  foldedOption: string;
  foldedGroup: string;
};

type IndexedProduct = {
  product: ProductRow;
  categoryName: string | null;
  foldedName: string;
  foldedDescription: string;
  foldedCategory: string;
  foldedTags: string;
  nameTokens: string[];
  descTokens: string[];
  options: IndexedOption[];
  /** All searchable folded text (name+desc+category+tags+options) */
  haystack: string;
};

/** Generic commerce stopwords — not restaurant-specific. */
const STOPWORDS = new Set([
  'un',
  'una',
  'unos',
  'unas',
  'el',
  'la',
  'los',
  'las',
  'de',
  'del',
  'al',
  'a',
  'y',
  'o',
  'u',
  'en',
  'con',
  'por',
  'para',
  'que',
  'quiero',
  'quería',
  'queria',
  'quisiera',
  'dame',
  'deme',
  'me',
  'mi',
  'tu',
  'su',
  'hay',
  'tiene',
  'tienen',
  'tienes',
  'hola',
  'buenas',
  'buen',
  'porfa',
  'porfavor',
  'favor',
  'tambien',
  'también',
  'tambien',
  'otro',
  'otra',
  'dos',
  'tres',
  'cuatro',
  'cinco',
  'medio',
  'bastante',
  'mucho',
  'mucha',
  'algo',
  'sabor',
]);

/** Category-ish tokens: keep for filtering/boost, don't require in product name. */
const CATEGORY_HINTS = new Set([
  'pizza',
  'pizzas',
  'bebida',
  'bebidas',
  'refresco',
  'refrescos',
  'jugo',
  'jugos',
  'agua',
  'aguas',
  'postre',
  'postres',
  'hamburguesa',
  'hamburguesas',
  'burger',
  'arepa',
  'arepas',
  'empanada',
  'empanadas',
  'combo',
  'combos',
  'entrada',
  'entradas',
  'plato',
  'platos',
  'sandwich',
  'sandwiches',
  'taco',
  'tacos',
  'sushi',
  'pollo',
  'carne',
  'pasta',
  'pastas',
  'ensalada',
  'ensaladas',
  'cafe',
  'café',
  'te',
  'té',
  'cerveza',
  'cervezas',
  'vino',
  'vinos',
  'licor',
  'licores',
]);

function fold(s: string): string {
  return foldSearchText(s);
}

/** Normalize size / brand glue before tokenization. */
export function normalizeCatalogQuery(raw: string): string {
  let s = fold(raw);
  s = s.replace(/[¿?¡!.,;:()"']/g, ' ');
  // 2l / 2lt / 2lts → 2 lt
  s = s.replace(/\b(\d+(?:[.,]\d+)?)\s*lts?\b/g, '$1 lt');
  s = s.replace(/\b(\d+(?:[.,]\d+)?)l\b/g, '$1 lt');
  s = s.replace(/\b(\d+(?:[.,]\d+)?)\s*litros?\b/g, '$1 lt');
  s = s.replace(/\bdos\s+litros?\b/g, '2 lt');
  s = s.replace(/\bun\s+litro\b/g, '1 lt');
  // Brand glue: cocacola → coca cola (generic pattern for glued soft-drink brands)
  s = s.replace(/\bcocacola\b/g, 'coca cola');
  s = s.replace(/\bpepsi\s*cola\b/g, 'pepsi');
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

export function tokenizeCatalogQuery(raw: string): {
  normalized: string;
  allTokens: string[];
  contentTokens: string[];
  categoryHints: string[];
} {
  const normalized = normalizeCatalogQuery(raw);
  const allTokens = tokenizeSearchText(normalized);
  const categoryHints: string[] = [];
  const contentTokens: string[] = [];
  for (const tok of allTokens) {
    if (STOPWORDS.has(tok)) continue;
    if (CATEGORY_HINTS.has(tok)) {
      categoryHints.push(tok);
      continue;
    }
    contentTokens.push(tok);
  }
  // If only category hints remain (e.g. "refresco"), keep them as content.
  if (contentTokens.length === 0 && categoryHints.length > 0) {
    return {
      normalized,
      allTokens,
      contentTokens: [...categoryHints],
      categoryHints: [],
    };
  }
  return { normalized, allTokens, contentTokens, categoryHints };
}

function parseTags(raw: unknown): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw.map((t) => String(t ?? '').trim()).filter(Boolean);
  }
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return parseTags(parsed);
    } catch {
      return raw
        .split(/[,;|]/)
        .map((t) => t.trim())
        .filter(Boolean);
    }
  }
  return [];
}

function indexProduct(
  product: ProductRow,
  categoryName: string | null,
): IndexedProduct {
  const foldedName = fold(product.nombre || '');
  const foldedDescription = fold(product.descripcion || '');
  const foldedCategory = fold(categoryName || '');
  const tags = parseTags(product.etiquetas);
  const foldedTags = fold(tags.join(' '));
  const parsed = parseProductMenuOptions(product.opciones_menu);
  const options: IndexedOption[] = [];
  for (const g of parsed?.grupos || []) {
    for (const o of g.opciones || []) {
      options.push({
        groupName: g.nombre || '',
        groupId: g.id,
        optionName: o.nombre || '',
        optionId: o.id,
        foldedOption: fold(o.nombre || ''),
        foldedGroup: fold(g.nombre || ''),
      });
    }
  }
  // Size labels from legacy tamanos if present
  for (const t of parsed?.tamanos || []) {
    options.push({
      groupName: 'Tamaños',
      groupId: 'tamanos',
      optionName: t.label || '',
      optionId: t.id,
      foldedOption: fold(t.label || ''),
      foldedGroup: 'tamanos',
    });
  }
  const optionHay = options.map((o) => `${o.foldedGroup} ${o.foldedOption}`).join(' ');
  const haystack = [
    foldedName,
    foldedDescription,
    foldedCategory,
    foldedTags,
    optionHay,
  ]
    .filter(Boolean)
    .join(' ');

  return {
    product,
    categoryName,
    foldedName,
    foldedDescription,
    foldedCategory,
    foldedTags,
    nameTokens: tokenizeSearchText(foldedName),
    descTokens: tokenizeSearchText(foldedDescription),
    options,
    haystack,
  };
}

function buildIndex(menu: LoadedPublicMenu): IndexedProduct[] {
  const products = (menu.productos as ProductRow[]) || [];
  const categories = (menu.categorias as CategoryRow[]) || [];
  const catName = (id: string | null | undefined) =>
    categories.find((c) => c.id === id)?.nombre ?? null;
  return products.map((p) => indexProduct(p, catName(p.categoria_id)));
}

function tokenMatchesHay(hay: string, token: string): boolean {
  if (!token) return true;
  if (hay.includes(token)) return true;
  return fuzzyIncludes(hay, token);
}

function bestOptionMatch(
  indexed: IndexedProduct,
  contentTokens: string[],
): { option: IndexedOption; score: number } | null {
  if (contentTokens.length === 0 || indexed.options.length === 0) return null;
  let best: { option: IndexedOption; score: number } | null = null;
  for (const opt of indexed.options) {
    let score = scoreFoldedMatch(opt.foldedOption, contentTokens.join(' '));
    // Per-token coverage on option name
    let covered = 0;
    for (const tok of contentTokens) {
      if (tokenMatchesHay(opt.foldedOption, tok)) covered += 1;
    }
    if (covered > 0) {
      score = Math.max(score, 40 + covered * 18);
    }
    // Soft-drink brand fragments: "coca" vs "coca-cola" / "cocacola"
    for (const tok of contentTokens) {
      if (tok.length >= 4 && opt.foldedOption.includes(tok)) {
        score = Math.max(score, 70);
      }
      if (
        (tok === 'coca' || tok === 'cola') &&
        (opt.foldedOption.includes('coca') || opt.foldedOption.includes('cola'))
      ) {
        score = Math.max(score, 68);
      }
    }
    if (!best || score > best.score) best = { option: opt, score };
  }
  if (!best || best.score < 40) return null;
  return best;
}

function scoreIndexed(
  indexed: IndexedProduct,
  query: {
    normalized: string;
    contentTokens: string[];
    categoryHints: string[];
  },
): CatalogSearchHit | null {
  const { normalized, contentTokens, categoryHints } = query;
  if (!normalized && contentTokens.length === 0) return null;

  let score = 0;
  let matched_field: CatalogMatchField = 'fuzzy';
  let matched_option: string | null = null;
  let matched_group: string | null = null;
  const suggested_option_labels: string[] = [];
  const matched_tokens: string[] = [];

  const nameScore = scoreFoldedMatch(indexed.foldedName, normalized);
  if (nameScore >= 100) {
    score = 1000;
    matched_field = 'name_exact';
  } else if (nameScore >= 72) {
    score = 850 + nameScore;
    matched_field = 'name';
  } else if (nameScore > 0) {
    score = 700 + nameScore;
    matched_field = 'name';
  }

  // Content token coverage on name (allows "pizza campesina" → campesina)
  if (contentTokens.length > 0) {
    let nameHits = 0;
    for (const tok of contentTokens) {
      if (tokenMatchesHay(indexed.foldedName, tok)) {
        nameHits += 1;
        matched_tokens.push(tok);
      }
    }
    if (nameHits > 0) {
      const ratio = nameHits / contentTokens.length;
      const bump = Math.round(500 + ratio * 200 + nameHits * 40);
      if (bump > score) {
        score = bump;
        matched_field = nameHits === contentTokens.length ? 'name' : 'name';
      }
    }
  }

  // Description / ingredients
  if (contentTokens.length > 0) {
    let descHits = 0;
    for (const tok of contentTokens) {
      if (tokenMatchesHay(indexed.foldedDescription, tok)) {
        descHits += 1;
        if (!matched_tokens.includes(tok)) matched_tokens.push(tok);
      }
    }
    if (descHits > 0) {
      const bump = Math.round(320 + (descHits / contentTokens.length) * 160);
      if (bump > score) {
        score = bump;
        matched_field = 'description';
      } else {
        score += descHits * 15;
      }
    }
  }

  // Tags
  if (indexed.foldedTags && contentTokens.some((t) => tokenMatchesHay(indexed.foldedTags, t))) {
    score = Math.max(score, 360);
    if (matched_field === 'fuzzy') matched_field = 'tag';
  }

  // Options (flavors, sizes, extras)
  const optHit = bestOptionMatch(indexed, contentTokens);
  if (optHit) {
    // Flavor/option + size-in-name (e.g. Coca-Cola + 2 Lt) must beat bare name size hits
    let bump = 600 + optHit.score;
    const flavorish = contentTokens.some(
      (t) =>
        t.length >= 4 &&
        (optHit.option.foldedOption.includes(t) ||
          t === 'coca' ||
          t === 'cola' ||
          t === 'pepsi'),
    );
    if (flavorish) bump += 120;
    if (bump >= score) {
      score = bump;
      matched_field = 'option_value';
      matched_option = optHit.option.optionName;
      matched_group = optHit.option.groupName;
      suggested_option_labels.push(optHit.option.optionName);
    } else if (optHit.score >= 68) {
      // Strong option signal even if name also matched
      score += 80;
      if (!matched_option) {
        matched_option = optHit.option.optionName;
        matched_group = optHit.option.groupName;
        suggested_option_labels.push(optHit.option.optionName);
      }
    }
  }

  // Size tokens in product name while option carries flavor (coca + 2 lt)
  const sizeTokens = contentTokens.filter(
    (t) => /^\d+$/.test(t) || t === 'lt' || t === 'ml' || t === 'grande' || t === 'normal' || t === 'pequeno' || t === 'pequeño' || t === 'mediano',
  );
  for (const tok of sizeTokens) {
    if (tokenMatchesHay(indexed.foldedName, tok) || tokenMatchesHay(indexed.haystack, tok)) {
      score += 55;
      if (!matched_tokens.includes(tok)) matched_tokens.push(tok);
    }
  }
  // Also match size option labels (Grande/Normal)
  for (const tok of contentTokens) {
    if (tok === 'grande' || tok === 'normal' || tok === 'mediana' || tok === 'mediano') {
      const sizeOpt = indexed.options.find(
        (o) =>
          o.foldedOption === tok ||
          o.foldedOption.startsWith(tok) ||
          fold(o.groupName).includes('tamano') ||
          fold(o.groupName).includes('tamaño'),
      );
      const direct = indexed.options.find((o) => tokenMatchesHay(o.foldedOption, tok));
      if (direct) {
        score += 70;
        if (!suggested_option_labels.includes(direct.optionName)) {
          suggested_option_labels.push(direct.optionName);
        }
      } else if (sizeOpt && tokenMatchesHay(sizeOpt.foldedOption, tok)) {
        score += 70;
        if (!suggested_option_labels.includes(sizeOpt.optionName)) {
          suggested_option_labels.push(sizeOpt.optionName);
        }
      }
    }
  }

  // Category hints: boost if category matches; don't require name match
  if (categoryHints.length > 0) {
    let catOk = false;
    for (const hint of categoryHints) {
      if (
        tokenMatchesHay(indexed.foldedCategory, hint) ||
        tokenMatchesHay(indexed.foldedName, hint) ||
        // pizza → category PIZZAS
        (hint.startsWith('pizza') && indexed.foldedCategory.includes('pizza')) ||
        (hint.startsWith('bebida') && indexed.foldedCategory.includes('bebida')) ||
        (hint.startsWith('refresco') &&
          (indexed.foldedName.includes('refresco') ||
            indexed.foldedCategory.includes('bebida')))
      ) {
        catOk = true;
      }
    }
    if (catOk) {
      score += 90;
      if (matched_field === 'fuzzy' || matched_field === 'description') {
        matched_field = score >= 500 ? matched_field : 'category';
      }
    } else if (contentTokens.length === 0) {
      // Only category words and no match → weak
      score = Math.max(score - 40, 0);
    }
  }

  // Fuzzy fallback on full haystack
  if (score < 40 && contentTokens.length > 0) {
    const fuzzy = scoreFoldedMatch(indexed.haystack, contentTokens.join(' '));
    if (fuzzy >= 38) {
      score = 200 + fuzzy;
      matched_field = 'fuzzy';
    }
  }

  // Must have some signal
  if (score < 40) return null;

  // Require at least one content token hit somewhere when content tokens exist
  if (contentTokens.length > 0) {
    const anyHit = contentTokens.some((tok) =>
      tokenMatchesHay(indexed.haystack, tok),
    );
    if (!anyHit) return null;
  }

  return {
    product: indexed.product,
    score,
    matched_field,
    matched_option,
    matched_group,
    matched_tokens,
    category_name: indexed.categoryName,
    suggested_option_labels: [...new Set(suggested_option_labels)],
  };
}

export type SearchCatalogArgs = {
  query?: string;
  category?: string;
  available_only?: boolean;
  max_price?: number;
  limit?: number;
  /** Optional price getter so tools stay the single price authority */
  getPriceMin?: (product: ProductRow) => number;
};

/**
 * Ranked catalog search. Empty query + category returns category listing
 * sorted by score then name (caller may re-sort by price for "cheap" intents).
 */
export function searchCatalog(
  menu: LoadedPublicMenu,
  args: SearchCatalogArgs = {},
): CatalogSearchResult {
  const limit = Math.min(12, Math.max(1, Math.floor(Number(args.limit) || 8)));
  const availableOnly = args.available_only !== false;
  const categoryFilter = fold(String(args.category ?? '').trim());
  const parsed = tokenizeCatalogQuery(String(args.query ?? ''));
  const index = buildIndex(menu);

  let candidates = index;
  if (availableOnly) {
    candidates = candidates.filter((i) => i.product.disponible !== false);
  }
  if (categoryFilter) {
    candidates = candidates.filter(
      (i) =>
        i.foldedCategory.includes(categoryFilter) ||
        categoryFilter.includes(i.foldedCategory),
    );
  }
  if (
    typeof args.max_price === 'number' &&
    Number.isFinite(args.max_price) &&
    args.max_price > 0 &&
    args.getPriceMin
  ) {
    candidates = candidates.filter(
      (i) => args.getPriceMin!(i.product) <= args.max_price!,
    );
  }

  const hasQuery = parsed.contentTokens.length > 0 || parsed.categoryHints.length > 0;

  let hits: CatalogSearchHit[] = [];
  if (!hasQuery) {
    hits = candidates.map((i) => ({
      product: i.product,
      score: 1,
      matched_field: 'category' as const,
      matched_option: null,
      matched_group: null,
      matched_tokens: [],
      category_name: i.categoryName,
      suggested_option_labels: [],
    }));
  } else {
    for (const indexed of candidates) {
      const hit = scoreIndexed(indexed, parsed);
      if (hit) hits.push(hit);
    }
  }

  hits.sort(
    (a, b) =>
      b.score - a.score ||
      fold(a.product.nombre || '').localeCompare(fold(b.product.nombre || '')),
  );

  const top = hits.slice(0, limit);
  const ambiguous =
    top.length >= 2 &&
    top[0]!.score > 0 &&
    top[1]!.score / top[0]!.score >= 0.85 &&
    top[0]!.matched_field === top[1]!.matched_field;

  let note: string | undefined;
  if (top.length === 0 && hasQuery) {
    note =
      'Sin coincidencias en nombre, descripción, categoría ni opciones de este menú. No afirmes que “no existe” si la consulta fue ambigua: ofrece ver el menú o reformular.';
  } else if (ambiguous) {
    note =
      'Varias coincidencias similares: pregunta cuál prefiere el cliente antes de proponer el carrito.';
  }

  return {
    count: top.length,
    hits: top,
    query_normalized: parsed.normalized,
    query_tokens: parsed.contentTokens,
    searched_options: true,
    ambiguous,
    note,
  };
}

/** Resolve a product by id or ranked name/option query. */
export function resolveCatalogProduct(
  menu: LoadedPublicMenu,
  productId?: string | null,
  productName?: string | null,
): CatalogSearchHit | null {
  const id = (productId || '').trim();
  const products = (menu.productos as ProductRow[]) || [];
  if (id) {
    const byId = products.find((p) => p.id === id);
    if (byId) {
      const categories = (menu.categorias as CategoryRow[]) || [];
      const categoryName =
        categories.find((c) => c.id === byId.categoria_id)?.nombre ?? null;
      return {
        product: byId,
        score: 1000,
        matched_field: 'name_exact',
        matched_option: null,
        matched_group: null,
        matched_tokens: [],
        category_name: categoryName,
        suggested_option_labels: [],
      };
    }
  }
  const name = (productName || '').trim();
  if (!name) return null;
  const result = searchCatalog(menu, { query: name, limit: 3, available_only: false });
  return result.hits[0] || null;
}
