/**
 * Deterministic commercial conversation helpers for the chatbot.
 * Separates intent / preferences / recommendations from Gemini prose.
 * Tenant-bound: always operates on a LoadedPublicMenu snapshot.
 */
import type { LoadedPublicMenu } from '../../menu/_lib/load-public-menu';
import {
  getProductMinimumPrice,
  parseProductMenuOptions,
} from '../../../_lib/menu-product-options';
import { foldSearchText, tokenizeSearchText } from '../../../_lib/search-text';
import {
  searchCatalog,
  type CatalogSearchHit,
} from './catalog-search';

export type CommercialIntent =
  | 'explore_menu'
  | 'discovery'
  | 'specific_search'
  | 'compare'
  | 'budget'
  | 'objection_price'
  | 'objection_ingredient'
  | 'objection_other'
  | 'buy_intent'
  | 'checkout_intent'
  | 'human_support'
  | 'thinking'
  | 'complement_accept'
  | 'complement_decline'
  | 'unknown';

export type CommercialPreferences = {
  wantIngredients: string[];
  avoidIngredients: string[];
  maxBudget: number | null;
  partySize: number | null;
  wantsRecommendations: boolean;
  suppressComplements: boolean;
  suppressDrinkSuggestions: boolean;
};

export type CommercialSessionPatch = Partial<{
  intent: CommercialIntent;
  preferences: Partial<CommercialPreferences>;
  lastRecommendedIds: string[];
  rejectedRecommendationIds: string[];
  focusProductId: string | null;
  focusProductName: string | null;
  suppressComplements: boolean;
  suppressDrinkSuggestions: boolean;
}>;

type ProductRow = {
  id: string;
  categoria_id?: string | null;
  nombre?: string | null;
  descripcion?: string | null;
  precio?: number | null;
  disponible?: boolean | null;
  opciones_menu?: unknown;
};

function fold(s: string) {
  return foldSearchText(s);
}

const EXPLORE_RE =
  /\b(que venden|qu[eé] venden|qu[eé] hay|ver (el )?menu|mostrar (el )?menu|categorias|categorías|el menu)\b/i;
const DISCOVERY_RE =
  /\b(no s[eé] qu[eé]|qu[eé] me recomiend|recomiend(a|ame|en)|tengo hambre|suger(encia|encias)|algo (rico|bueno|diferente)|muéstrame algo|muestrame algo)\b/i;
const COMPARE_RE =
  /\b(mejor|compar|o la |o el |diferencia entre|cuál (es|prefieres)|cual (es|prefieres))\b/i;
const BUDGET_RE =
  /\b(presupuesto|tengo\s+(?:\d+|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|veinte|treinta|cuarenta|cincuenta|cien)\b|con\s+\d+\s*(?:d[oó]lares?|usd|\$)|barat\w*|econ[oó]mic\w*|lo m[aá]s barato|menor precio)/i;
const PRICE_OBJECTION_RE =
  /\b(est[aá] (muy )?caro|muy caro|demasiado caro|baj(a|e) (el )?precio|m[aá]s barato)\b/i;
const INGREDIENT_OBJECTION_RE =
  /\b(no me gusta(n)?|sin\s+\w+|quit(a|ale|arle)|evitar|no quiero\s+\w+)\b/i;
const BUY_RE =
  /\b(me (llevo|quedo con)|la quiero|lo quiero|esa( misma)?|ese|agrega(r|me|lo|la)?|pon(me|la|lo)|prep[aá]ra(me)?|confirmo)\b/i;
const CHECKOUT_RE =
  /\b(pagar|checkout|listo(,)? eso (es )?todo|ya (quiero|estoy list[oa])|nada m[aá]s|finalizar|cerrar (el )?pedido|pasar a pagar)\b/i;
const HUMAN_RE =
  /\b(reclam\w*|queja\w*|humano|whats?app|hablar con|pedido (incompleto|malo|equivocado)|atenci[oó]n)\b/i;
const THINKING_RE =
  /\b(lo pienso|voy a pensar|d[eé]jame pensar|luego veo|m[aá]s tarde)\b/i;
const COMPLEMENT_DECLINE_RE =
  /\b(no(,)? gracias|ahora no|no quiero (nada )?m[aá]s|sin (bebida|postre|extras?)|no me (recomiendes|sugieras) (bebidas?|nada)|no vuelvas a recomendar)\b/i;
const COMPLEMENT_ACCEPT_RE =
  /\b(s[ií](,)? (quiero|dame|pon)|algo de tomar|una bebida|acompa[nñ]a|y una bebida)\b/i;
const SPECIFIC_RE =
  /\b(quiero|quisiera|dame|deme|me das|ponme|buscar|tienen|hay)\b/i;

export function detectCommercialIntent(text: string): CommercialIntent {
  const t = (text || '').trim();
  if (!t) return 'unknown';
  if (HUMAN_RE.test(t)) return 'human_support';
  if (THINKING_RE.test(t)) return 'thinking';
  if (CHECKOUT_RE.test(t)) return 'checkout_intent';
  if (COMPLEMENT_DECLINE_RE.test(t)) return 'complement_decline';
  if (PRICE_OBJECTION_RE.test(t)) return 'objection_price';
  if (BUDGET_RE.test(t)) return 'budget';
  if (COMPARE_RE.test(t) && /\bo\b/i.test(t)) return 'compare';
  if (BUY_RE.test(t)) return 'buy_intent';
  if (COMPLEMENT_ACCEPT_RE.test(t)) return 'complement_accept';
  if (EXPLORE_RE.test(t)) return 'explore_menu';
  if (DISCOVERY_RE.test(t)) return 'discovery';
  if (INGREDIENT_OBJECTION_RE.test(t) && /\bno me gusta|sin\b/i.test(t)) {
    return 'objection_ingredient';
  }
  if (SPECIFIC_RE.test(t) || t.split(/\s+/).length <= 6) return 'specific_search';
  return 'unknown';
}

const INGREDIENT_HINTS = [
  'queso',
  'jamon',
  'jamón',
  'piña',
  'pina',
  'cebolla',
  'maiz',
  'maíz',
  'champiñon',
  'champinon',
  'champiñones',
  'pimenton',
  'pimentón',
  'pollo',
  'carne',
  'salami',
  'chorizo',
  'anchoas',
  'bocadillo',
  'tomate',
  'ajo',
];

export function extractCommercialPreferences(
  text: string,
  prior?: Partial<CommercialPreferences>,
): CommercialPreferences {
  const folded = fold(text);
  const want = new Set(prior?.wantIngredients || []);
  const avoid = new Set(prior?.avoidIngredients || []);

  // "con X" / "que tenga X"
  for (const ing of INGREDIENT_HINTS) {
    const f = fold(ing);
    if (
      new RegExp(`\\b(con|tenga|tiene|lleve|lleno de|bastante)\\s+${f}\\b`).test(
        folded,
      ) ||
      new RegExp(`\\balgo (con|de)\\s+${f}\\b`).test(folded)
    ) {
      want.add(ing);
      avoid.delete(ing);
    }
    if (
      new RegExp(`\\b(sin|no me gusta(n)?( la| el| las| los)?|evitar)\\s+${f}\\b`).test(
        folded,
      )
    ) {
      avoid.add(ing);
      want.delete(ing);
    }
  }

  let maxBudget = prior?.maxBudget ?? null;
  const budgetMatch =
    folded.match(/\b(?:tengo|con|presupuesto(?:\s+de)?)\s*(\d+(?:[.,]\d+)?)\b/) ||
    folded.match(/\$\s*(\d+(?:[.,]\d+)?)/);
  if (budgetMatch?.[1]) {
    maxBudget = Number(String(budgetMatch[1]).replace(',', '.'));
    if (!Number.isFinite(maxBudget) || maxBudget <= 0) maxBudget = prior?.maxBudget ?? null;
  }

  let partySize = prior?.partySize ?? null;
  const partyMatch =
    folded.match(/\b(?:somos|para)\s+(\d+)\s*(?:personas?|gente)?\b/) ||
    folded.match(/\b(\d+)\s+personas?\b/);
  if (partyMatch?.[1]) {
    const n = Number(partyMatch[1]);
    if (Number.isFinite(n) && n >= 1 && n <= 40) partySize = n;
  }

  const wantsRecommendations =
    prior?.wantsRecommendations === true ||
    DISCOVERY_RE.test(text) ||
    /\brecomiend/i.test(text);

  const suppressComplements =
    prior?.suppressComplements === true || COMPLEMENT_DECLINE_RE.test(text);
  const suppressDrinkSuggestions =
    prior?.suppressDrinkSuggestions === true ||
    /\bno me (recomiendes|sugieras) bebidas?|sin bebidas?\b/i.test(text);

  return {
    wantIngredients: [...want],
    avoidIngredients: [...avoid],
    maxBudget,
    partySize,
    wantsRecommendations,
    suppressComplements,
    suppressDrinkSuggestions,
  };
}

export type RecommendArgs = {
  query?: string;
  category?: string;
  want_ingredients?: string[];
  avoid_ingredients?: string[];
  max_price?: number;
  party_size?: number;
  exclude_product_ids?: string[];
  limit?: number;
  /** Prefer complementary kinds vs cart (drink after food, etc.) */
  complement_to_cart?: boolean;
};

function productText(p: ProductRow): string {
  return fold(`${p.nombre || ''} ${p.descripcion || ''}`);
}

function hasIngredient(p: ProductRow, ingredient: string): boolean {
  return productText(p).includes(fold(ingredient));
}

function classifyCategory(name: string | null | undefined): 'food' | 'drink' | 'dessert' | 'side' | 'other' {
  const n = fold(name || '');
  if (/bebida|refresco|jugo|agua|cafe|cerveza|vino|drink/.test(n)) return 'drink';
  if (/postre|dulce|helado|dessert/.test(n)) return 'dessert';
  if (/acompa|side|extra|entrada/.test(n)) return 'side';
  if (/pizza|burger|hamburg|plato|comida|arepa|taco|pasta|sandwich/.test(n)) {
    return 'food';
  }
  return 'other';
}

/**
 * Ranked recommendations from the real catalog (2–4 typical).
 * Uses searchCatalog when there is a query; otherwise preference filters.
 */
export function recommendFromCatalog(
  menu: LoadedPublicMenu,
  args: RecommendArgs = {},
): {
  count: number;
  intent_hint: string;
  results: Array<{
    id: string;
    name: string;
    category: string | null;
    description: string;
    price_min: number;
    reason: string;
    suggested_option_labels: string[];
    matched_field?: string;
    matched_option?: string | null;
  }>;
  note?: string;
} {
  const limit = Math.min(4, Math.max(2, Math.floor(Number(args.limit) || 3)));
  const exclude = new Set(args.exclude_product_ids || []);
  const want = (args.want_ingredients || []).map(fold).filter(Boolean);
  const avoid = (args.avoid_ingredients || []).map(fold).filter(Boolean);
  const maxPrice =
    typeof args.max_price === 'number' && args.max_price > 0
      ? args.max_price
      : undefined;

  const categories = (menu.categorias || []) as Array<{
    id: string;
    nombre?: string | null;
  }>;
  const catName = (id: string | null | undefined) =>
    categories.find((c) => c.id === id)?.nombre ?? null;

  let hits: CatalogSearchHit[] = [];
  const q = (args.query || '').trim();
  if (q) {
    hits = searchCatalog(menu, {
      query: q,
      category: args.category,
      available_only: true,
      max_price: maxPrice,
      limit: 12,
      getPriceMin: (p) => getProductMinimumPrice(p),
    }).hits;
  } else {
    const products = ((menu.productos || []) as ProductRow[]).filter(
      (p) => p.disponible !== false && !exclude.has(p.id),
    );
    hits = products.map((p) => ({
      product: p,
      score: 1,
      matched_field: 'category' as const,
      matched_option: null,
      matched_group: null,
      matched_tokens: [],
      category_name: catName(p.categoria_id),
      suggested_option_labels: [],
    }));
  }

  const scored: Array<{
    hit: CatalogSearchHit;
    score: number;
    reason: string;
  }> = [];

  for (const hit of hits) {
    const p = hit.product;
    if (exclude.has(p.id)) continue;
    if (p.disponible === false) continue;
    const price = getProductMinimumPrice(p);
    if (!(price > 0)) continue;
    if (maxPrice != null && price > maxPrice) continue;

    const text = productText(p);
    if (avoid.some((a) => text.includes(a))) continue;

    let score = hit.score;
    const reasons: string[] = [];
    if (hit.matched_field === 'name' || hit.matched_field === 'name_exact') {
      reasons.push('coincide con lo que pediste');
    }
    if (hit.matched_option) {
      reasons.push(`opción ${hit.matched_option}`);
      score += 40;
    }
    let wantHits = 0;
    for (const w of want) {
      if (text.includes(w)) {
        wantHits += 1;
        score += 80;
      }
    }
    if (wantHits > 0) {
      reasons.push(`incluye ${want.slice(0, 2).join(' y ')}`);
    }
    if (maxPrice != null) {
      reasons.push(`cabe en tu presupuesto`);
      score += Math.max(0, 40 - price);
    }
    if (args.party_size && args.party_size >= 3) {
      // Prefer larger / shareable naming lightly
      if (/\bfamiliar|grande|mega|compart/i.test(p.nombre || '')) {
        score += 30;
        reasons.push('sirve para compartir');
      }
    }
    if (args.complement_to_cart) {
      const kind = classifyCategory(hit.category_name);
      if (kind === 'drink') {
        score += 50;
        reasons.push('para acompañar tu pedido');
      }
    }

    if (reasons.length === 0) {
      if (hit.matched_field === 'description') reasons.push('según ingredientes');
      else reasons.push('disponible en el menú');
    }

    scored.push({
      hit,
      score,
      reason: reasons.slice(0, 2).join('; '),
    });
  }

  scored.sort(
    (a, b) =>
      b.score - a.score ||
      getProductMinimumPrice(a.hit.product) - getProductMinimumPrice(b.hit.product),
  );

  const top = scored.slice(0, limit);
  return {
    count: top.length,
    intent_hint:
      q || want.length || maxPrice != null
        ? 'Mostrar 1 opción principal breve + alternativas si hay empate; no inventes atributos.'
        : 'Pide una preferencia corta o muestra 2–3 opciones variadas del menú.',
    results: top.map(({ hit, reason }) => ({
      id: hit.product.id,
      name: hit.product.nombre || '',
      category: hit.category_name,
      description: (hit.product.descripcion || '').slice(0, 160),
      price_min: getProductMinimumPrice(hit.product),
      reason,
      suggested_option_labels: hit.suggested_option_labels,
      matched_field: hit.matched_field,
      matched_option: hit.matched_option,
    })),
    note:
      top.length === 0
        ? 'No hay recomendaciones que cumplan filtros en este catálogo. Diló sin inventar.'
        : undefined,
  };
}

/** Cheap/cheaper alternatives for price objections. */
export function findCheaperAlternatives(
  menu: LoadedPublicMenu,
  referenceProductId: string | null,
  limit = 3,
) {
  const products = ((menu.productos || []) as ProductRow[]).filter(
    (p) => p.disponible !== false,
  );
  const ref = referenceProductId
    ? products.find((p) => p.id === referenceProductId)
    : null;
  const refPrice = ref ? getProductMinimumPrice(ref) : Infinity;
  const categories = (menu.categorias || []) as Array<{
    id: string;
    nombre?: string | null;
  }>;
  const sameCat = ref?.categoria_id
    ? products.filter((p) => p.categoria_id === ref.categoria_id)
    : products;
  const cheaper = sameCat
    .filter((p) => p.id !== ref?.id)
    .map((p) => ({ p, price: getProductMinimumPrice(p) }))
    .filter((r) => r.price > 0 && r.price < refPrice)
    .sort((a, b) => a.price - b.price)
    .slice(0, limit);

  return {
    reference: ref
      ? {
          id: ref.id,
          name: ref.nombre,
          price_min: refPrice,
        }
      : null,
    alternatives: cheaper.map(({ p, price }) => ({
      id: p.id,
      name: p.nombre,
      category:
        categories.find((c) => c.id === p.categoria_id)?.nombre ?? null,
      price_min: price,
      reason: 'opción más económica en la misma categoría',
    })),
  };
}

export function buildCommercialSessionPatchFromUtterance(
  text: string,
): CommercialSessionPatch {
  const intent = detectCommercialIntent(text);
  const preferences = extractCommercialPreferences(text);
  const patch: CommercialSessionPatch = { intent, preferences };
  if (preferences.suppressComplements) patch.suppressComplements = true;
  if (preferences.suppressDrinkSuggestions) {
    patch.suppressDrinkSuggestions = true;
  }
  return patch;
}

/** Guidance string for system prompt / tool notes (not user-facing). */
export function commercialPlaybookDigest(): string {
  return [
    'Estrategia comercial (determinista + tools):',
    '- Exploración → get_categories; Discovery → recommend_products (1 pregunta máx).',
    '- Búsqueda específica → search_products + prepare si ya hay tamaño/sabor.',
    '- Comparación → get_product_details de ambos; sé objetivo.',
    '- Presupuesto/objeción precio → find_cheapest_products o recommend_products con max_price.',
    '- Compra (“me llevo esa”) → prepare_cart_line_proposal; no sigas explorando.',
    '- “Listo / pagar” → propose_open_checkout; no insistas en complementos.',
    '- Reclamo/humano → get_business_information (solo contacto del local).',
    '- “No gracias” a extras → respeta; no vuelvas a empujar bebidas en esta sesión.',
  ].join('\n');
}

export function productAllowsExclusion(
  product: ProductRow,
  ingredient: string,
): boolean {
  const options = parseProductMenuOptions(product.opciones_menu);
  const list = options?.personalizacion?.exclusiones?.ingredientes || [];
  const want = fold(ingredient);
  return list.some(
    (i) =>
      fold(i.nombre || '') === want || fold(i.nombre || '').includes(want),
  );
}

export function tokenizePreferencesForSearch(
  prefs: CommercialPreferences,
): string {
  return [...prefs.wantIngredients].join(' ');
}
