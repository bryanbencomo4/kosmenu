import {
  foldSearchText,
  fuzzyIncludes,
  scoreFoldedMatch,
  tokenizeSearchText,
} from '../../_lib/search-text';

export type DirectorySearchEntry = {
  id: string;
  slug: string;
  nombre: string;
  categoria: string | null;
  direccion: string | null;
  productNames?: string[];
};

export type DirectoryMatchDetail = {
  score: number;
  matchedDish: string | null;
};

/** Food aliases so "burger" also hits hamburguesa-style names/menus. */
const QUERY_EXPANDERS: Array<{ trigger: RegExp; aliases: string[] }> = [
  { trigger: /\b(burger|hamburguesa|hamburguesas)\b/, aliases: ['hamburg', 'burger'] },
  { trigger: /\b(pizza|pizzas|pizzeria)\b/, aliases: ['pizza', 'pizzer'] },
  { trigger: /\b(taco|tacos|mexicano)\b/, aliases: ['taco', 'mexi'] },
  { trigger: /\b(sushi|japon|ramen)\b/, aliases: ['sushi', 'japon'] },
  { trigger: /\b(cafe|café|coffee|cafeteria)\b/, aliases: ['cafe', 'coffee', 'cafeter'] },
  { trigger: /\b(postre|postres|dulce|helado)\b/, aliases: ['postre', 'dulce', 'helado'] },
  { trigger: /\b(arepa|arepas|criolla|pabellon)\b/, aliases: ['arepa', 'crioll', 'pabellon'] },
  { trigger: /\b(pollo|chicken)\b/, aliases: ['pollo', 'chicken'] },
  { trigger: /\b(pasta|pastas|spaghetti|spagueti)\b/, aliases: ['pasta', 'spaghet'] },
];

function expandQueryTokens(normalizedQuery: string): string[] {
  const base = tokenizeSearchText(normalizedQuery);
  const extras: string[] = [];
  for (const rule of QUERY_EXPANDERS) {
    if (rule.trigger.test(normalizedQuery)) {
      extras.push(...rule.aliases);
    }
  }
  return [...new Set([...base, ...extras])];
}

function bestProductMatch(
  productNames: string[] | undefined,
  normalizedQuery: string,
  tokens: string[],
): { score: number; dish: string | null } {
  if (!productNames || productNames.length === 0) {
    return { score: 0, dish: null };
  }

  let bestScore = 0;
  let bestDish: string | null = null;

  for (const raw of productNames) {
    const folded = foldSearchText(raw);
    if (!folded) continue;

    let score = scoreFoldedMatch(folded, normalizedQuery);

    // Token coverage against dish name (aliases + fuzzy).
    if (score < 72 && tokens.length > 0) {
      let hits = 0;
      for (const token of tokens) {
        if (folded.includes(token) || fuzzyIncludes(folded, token)) hits += 1;
      }
      if (hits === tokens.length) {
        score = Math.max(score, tokens.length > 1 ? 56 : 50);
      } else if (hits > 0) {
        score = Math.max(score, 34 + Math.round((hits / tokens.length) * 14));
      }
    }

    // Dish matches are slightly favored in ranking vs weak business hits.
    if (score > 0) score = Math.min(96, score + 4);

    if (score > bestScore) {
      bestScore = score;
      bestDish = raw;
    }
  }

  return { score: bestScore, dish: bestDish };
}

export function matchDirectoryEntry(
  entry: DirectorySearchEntry,
  normalizedQuery: string,
): DirectoryMatchDetail {
  if (!normalizedQuery) {
    return { score: 0, matchedDish: null };
  }

  const tokens = expandQueryTokens(normalizedQuery);
  const haystack = foldSearchText(
    [entry.nombre, entry.slug, entry.categoria ?? '', entry.direccion ?? ''].join(' '),
  );
  const slugNormalized = foldSearchText(entry.slug);
  const nameNormalized = foldSearchText(entry.nombre);

  let score = 0;
  if (slugNormalized === normalizedQuery || nameNormalized === normalizedQuery) score = 100;
  else {
    score = Math.max(
      scoreFoldedMatch(nameNormalized, normalizedQuery),
      scoreFoldedMatch(slugNormalized, normalizedQuery) * 0.9,
      scoreFoldedMatch(haystack, normalizedQuery) * 0.85,
    );
    // Alias / fuzzy token coverage on business fields.
    if (score < 42 && tokens.length > 0) {
      let hits = 0;
      for (const token of tokens) {
        if (haystack.includes(token) || fuzzyIncludes(haystack, token)) hits += 1;
      }
      if (hits === tokens.length) score = Math.max(score, tokens.length > 1 ? 44 : 38);
      else if (hits > 0) score = Math.max(score, 30 + Math.round((hits / tokens.length) * 10));
    }
  }

  const product = bestProductMatch(entry.productNames, normalizedQuery, tokens);
  if (product.score > score) {
    return { score: product.score, matchedDish: product.dish };
  }

  // Soft dish hint when business already matches by name/category.
  if (score > 0 && product.dish) {
    return { score, matchedDish: product.dish };
  }

  return { score, matchedDish: product.dish };
}

export function scoreDirectoryMatch(
  entry: DirectorySearchEntry,
  normalizedQuery: string,
) {
  return matchDirectoryEntry(entry, normalizedQuery).score;
}

export function rankDirectorySearchResults(
  entries: DirectorySearchEntry[],
  normalizedQuery: string,
) {
  return entries
    .map((entry) => {
      const match = matchDirectoryEntry(entry, normalizedQuery);
      return { entry, score: match.score, matchedDish: match.matchedDish };
    })
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score)
    .map((item) => item.entry);
}

export function rankDirectorySearchDetails(
  entries: DirectorySearchEntry[],
  normalizedQuery: string,
) {
  return entries
    .map((entry) => {
      const match = matchDirectoryEntry(entry, normalizedQuery);
      return { entry, score: match.score, matchedDish: match.matchedDish };
    })
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score);
}

/**
 * Composite discovery score: text/menu match + proximity + ratings.
 * Higher is better. Used when the user is actively searching.
 */
export function compositeDiscoveryScore(options: {
  matchScore: number;
  distanceKm: number | null;
  ratingAverage: number;
  ratingCount: number;
  promovido: boolean;
  hasOrigin: boolean;
  isOpen?: boolean | null;
}) {
  let score = options.matchScore * 8;

  if (options.hasOrigin) {
    if (options.distanceKm != null && Number.isFinite(options.distanceKm)) {
      // Near places rise quickly; far ones lose ground so local food wins.
      score += Math.max(0, 240 - options.distanceKm * 12);
      if (options.distanceKm > 35) {
        score -= Math.min(160, (options.distanceKm - 35) * 2.2);
      }
    } else {
      score -= 36;
    }
  }

  score += options.ratingAverage * 14;
  score += Math.min(Math.max(options.ratingCount, 0), 30) * 1.15;
  if (options.promovido) score += 22;
  // Open now always outranks unknown/closed availability.
  if (options.isOpen === true) score += 80;
  else if (options.isOpen === false) score -= 120;

  return score;
}

export function pickFeaturedDirectoryBusinesses(
  businesses: DirectorySearchEntry[],
  orderCounts: Map<string, number>,
  limit: number,
  seedMs = Date.now(),
) {
  const safeLimit = Math.max(limit, 1);
  if (businesses.length <= safeLimit) {
    return businesses;
  }

  const sorted = [...businesses].sort((left, right) => {
    const countDiff = (orderCounts.get(right.id) ?? 0) - (orderCounts.get(left.id) ?? 0);
    if (countDiff !== 0) return countDiff;
    return left.nombre.localeCompare(right.nombre, 'es');
  });

  const topSlots = safeLimit <= 1 ? 1 : Math.min(2, safeLimit - 1);
  const top = sorted.slice(0, topSlots);
  const topIds = new Set(top.map((entry) => entry.id));
  const pool = sorted.filter((entry) => !topIds.has(entry.id));

  if (pool.length === 0) {
    return top.slice(0, safeLimit);
  }

  const hourSeed = Math.floor(seedMs / (60 * 60 * 1000));
  const randomPick = pool[hourSeed % pool.length];
  return [...top, randomPick].slice(0, safeLimit);
}

export function buildOrderCountMap(rows: Array<{ comercio_id?: string | null }>) {
  const counts = new Map<string, number>();

  for (const row of rows) {
    const comercioId = (row.comercio_id ?? '').toString().trim();
    if (!comercioId) continue;
    counts.set(comercioId, (counts.get(comercioId) ?? 0) + 1);
  }

  return counts;
}
