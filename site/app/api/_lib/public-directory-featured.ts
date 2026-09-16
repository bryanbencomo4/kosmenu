export type DirectorySearchEntry = {
  id: string;
  slug: string;
  nombre: string;
  categoria: string | null;
  direccion: string | null;
};

export function scoreDirectoryMatch(
  entry: DirectorySearchEntry,
  normalizedQuery: string,
) {
  const haystack = [
    entry.nombre,
    entry.slug,
    entry.categoria ?? '',
    entry.direccion ?? '',
  ]
    .join(' ')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();

  const slugNormalized = entry.slug
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();

  if (slugNormalized === normalizedQuery) return 100;
  if (haystack.startsWith(normalizedQuery)) return 80;
  if (slugNormalized.startsWith(normalizedQuery)) return 70;
  if (haystack.includes(normalizedQuery)) return 50;

  const tokens = normalizedQuery.split(/\s+/).filter(Boolean);
  if (tokens.length > 1 && tokens.every((token) => haystack.includes(token))) {
    return 40;
  }

  return 0;
}

export function rankDirectorySearchResults(
  entries: DirectorySearchEntry[],
  normalizedQuery: string,
) {
  return entries
    .map((entry) => ({ entry, score: scoreDirectoryMatch(entry, normalizedQuery) }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score)
    .map((item) => item.entry);
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
