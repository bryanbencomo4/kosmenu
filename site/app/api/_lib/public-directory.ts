import 'server-only';

import { publicSiteUrl } from '../../_lib/public-site-config';
import { isOwnerEmailVerified } from '../menu/_lib/load-public-menu';
import {
  buildOrderCountMap,
  compositeDiscoveryScore,
  pickFeaturedDirectoryBusinesses,
  rankDirectorySearchDetails,
  rankDirectorySearchResults,
} from './public-directory-featured';
import {
  categoryChipMatches,
  distanceKm,
  toFiniteCoord,
} from './public-directory-geo';
import { normalizeDirectoryQuery } from './public-directory-text';
import { getServiceSupabaseClient } from './supabase-server';

export type PublicDirectoryBusiness = {
  id: string;
  slug: string;
  nombre: string;
  logoUrl: string | null;
  categoria: string | null;
  direccion: string | null;
  negocioVirtual: boolean;
  menuUrl: string;
};

export type ClientDirectoryBusiness = PublicDirectoryBusiness & {
  coverUrl: string | null;
  lat: number | null;
  lng: number | null;
  ratingAverage: number;
  ratingCount: number;
  promovido: boolean;
  distanceKm: number | null;
  matchedDish?: string | null;
  matchScore?: number;
};

type ClientDirectoryCached = ClientDirectoryBusiness & {
  productNames: string[];
};

type RawComercioRow = {
  id?: string | null;
  slug?: string | null;
  nombre?: string | null;
  logo_url?: string | null;
  categoria?: string | null;
  direccion?: string | null;
  negocio_virtual?: boolean | null;
  owner_id?: string | null;
  updated_at?: string | null;
  latitud?: number | string | null;
  longitud?: number | string | null;
  branding_ia?: unknown;
  mostrar_en_directorio_publico?: boolean | null;
};

const DIRECTORY_SELECT =
  'id,slug,nombre,logo_url,categoria,direccion,negocio_virtual,owner_id,updated_at,latitud,longitud,branding_ia,mostrar_en_directorio_publico';

const FEATURED_ORDER_LOOKBACK_DAYS = 90;
const FEATURED_CANDIDATE_LIMIT = 120;
const CLIENT_DIRECTORY_LIMIT = 80;
const CLIENT_SEARCH_EXTRA_LIMIT = 48;
const FEATURED_CACHE_TTL_MS = 60_000;
const CLIENT_CACHE_TTL_MS = 45_000;
const VERIFY_BATCH_SIZE = 8;

type Cached<T> = { exp: number; value: T };
const featuredCache = new Map<number, Cached<PublicDirectoryBusiness[]>>();
let clientDirectoryCache: Cached<ClientDirectoryCached[]> | null = null;
const PRODUCT_NAMES_PER_BUSINESS = 16;
const PRODUCT_NAMES_TOTAL_CAP = 640;

async function mapInBatches<T, R>(
  items: T[],
  size: number,
  mapper: (item: T) => Promise<R>,
) {
  const out: R[] = [];
  for (let index = 0; index < items.length; index += size) {
    const chunk = items.slice(index, index + size);
    out.push(...(await Promise.all(chunk.map(mapper))));
  }
  return out;
}

function readPromotedFlag(brandingIa: unknown): boolean {
  if (!brandingIa || typeof brandingIa !== 'object') return false;
  const config = (brandingIa as Record<string, unknown>).config_negocio;
  if (!config || typeof config !== 'object') return false;
  const map = config as Record<string, unknown>;
  return map.destacado_directorio === true || map.promovido === true;
}

function toDirectoryBusiness(row: RawComercioRow): PublicDirectoryBusiness | null {
  const id = (row.id ?? '').toString().trim();
  const slug = (row.slug ?? '').toString().trim();
  const nombre = (row.nombre ?? '').toString().trim();
  if (!id || !slug || !nombre) return null;

  const site = publicSiteUrl.replace(/\/$/, '');
  return {
    id,
    slug,
    nombre,
    logoUrl: (row.logo_url ?? '').toString().trim() || null,
    categoria: (row.categoria ?? '').toString().trim() || null,
    direccion: (row.direccion ?? '').toString().trim() || null,
    negocioVirtual: row.negocio_virtual === true,
    menuUrl: `${site}/v/${encodeURIComponent(slug)}`,
  };
}

async function filterVerifiedBusinesses(rows: RawComercioRow[]) {
  const supabase = getServiceSupabaseClient();
  const mapped = await mapInBatches(rows, VERIFY_BATCH_SIZE, async (row) => {
    const ownerId = (row.owner_id ?? '').toString().trim();
    if (ownerId) {
      try {
        const ok = await isOwnerEmailVerified(supabase, ownerId);
        if (!ok) return null;
      } catch {
        // Keep listing resilient if auth admin lookup is temporarily unavailable.
      }
    }
    return toDirectoryBusiness(row);
  });
  return mapped.filter((entry): entry is PublicDirectoryBusiness => entry != null);
}

async function loadRecentOrderCounts(comercioIds: string[]) {
  if (comercioIds.length === 0) {
    return new Map<string, number>();
  }

  const supabase = getServiceSupabaseClient();
  const since = new Date();
  since.setDate(since.getDate() - FEATURED_ORDER_LOOKBACK_DAYS);

  const { data, error } = await supabase
    .from('pedidos')
    .select('comercio_id')
    .gte('created_at', since.toISOString())
    .in('comercio_id', comercioIds);

  if (error) {
    throw new Error(error.message);
  }

  return buildOrderCountMap((data ?? []) as Array<{ comercio_id?: string | null }>);
}

async function loadCoverUrls(comercioIds: string[]) {
  const covers = new Map<string, string>();
  if (comercioIds.length === 0) return covers;

  const supabase = getServiceSupabaseClient();
  const { data, error } = await supabase
    .from('productos')
    .select('comercio_id,imagen_url,orden')
    .in('comercio_id', comercioIds)
    .not('imagen_url', 'is', null)
    .order('orden', { ascending: true })
    .limit(Math.min(comercioIds.length * 4, 320));

  if (error || !data) return covers;

  for (const row of data as Array<{ comercio_id?: string | null; imagen_url?: string | null }>) {
    const id = (row.comercio_id ?? '').toString().trim();
    const url = (row.imagen_url ?? '').toString().trim();
    if (!id || !url || covers.has(id)) continue;
    covers.set(id, url);
  }
  return covers;
}

async function loadProductNames(comercioIds: string[]) {
  const names = new Map<string, string[]>();
  if (comercioIds.length === 0) return names;

  const supabase = getServiceSupabaseClient();
  const { data, error } = await supabase
    .from('productos')
    .select('comercio_id,nombre,disponible,orden')
    .in('comercio_id', comercioIds)
    .order('orden', { ascending: true })
    .limit(PRODUCT_NAMES_TOTAL_CAP);

  if (error || !data) return names;

  for (const row of data as Array<{
    comercio_id?: string | null;
    nombre?: string | null;
    disponible?: boolean | null;
  }>) {
    if (row.disponible === false) continue;
    const id = (row.comercio_id ?? '').toString().trim();
    const nombre = (row.nombre ?? '').toString().trim();
    if (!id || !nombre) continue;
    const list = names.get(id) ?? [];
    if (list.length >= PRODUCT_NAMES_PER_BUSINESS) continue;
    list.push(nombre);
    names.set(id, list);
  }

  return names;
}

function toPublicClientBusiness(entry: ClientDirectoryCached): ClientDirectoryBusiness {
  const { productNames: _productNames, ...publicEntry } = entry;
  return publicEntry;
}

async function loadRatingMap(comercioIds: string[]) {
  const ratings = new Map<string, { average: number; count: number }>();
  if (comercioIds.length === 0) return ratings;

  const supabase = getServiceSupabaseClient();
  const { data, error } = await supabase
    .from('order_service_ratings')
    .select('comercio_id,rating')
    .eq('rater_side', 'customer')
    .in('comercio_id', comercioIds);

  if (error || !data) return ratings;

  const buckets = new Map<string, number[]>();
  for (const row of data as Array<{ comercio_id?: string | null; rating?: number | null }>) {
    const id = (row.comercio_id ?? '').toString().trim();
    const rating = Number(row.rating);
    if (!id || !Number.isFinite(rating)) continue;
    const list = buckets.get(id) ?? [];
    list.push(rating);
    buckets.set(id, list);
  }

  for (const [id, list] of buckets) {
    const sum = list.reduce((acc, value) => acc + value, 0);
    ratings.set(id, {
      average: Math.round((sum / list.length) * 10) / 10,
      count: list.length,
    });
  }
  return ratings;
}

async function loadFeaturedDirectoryBusinesses(limit: number) {
  const cached = featuredCache.get(limit);
  if (cached && cached.exp > Date.now()) {
    return cached.value;
  }

  const supabase = getServiceSupabaseClient();

  const { data, error } = await supabase
    .from('comercios')
    .select(DIRECTORY_SELECT)
    .eq('en_linea', true)
    .eq('mostrar_en_directorio_publico', true)
    .order('updated_at', { ascending: false })
    .limit(FEATURED_CANDIDATE_LIMIT);

  if (error) {
    throw new Error(error.message);
  }

  const verified = await filterVerifiedBusinesses((data ?? []) as RawComercioRow[]);
  const orderCounts = await loadRecentOrderCounts(verified.map((entry) => entry.id));
  const featured = pickFeaturedDirectoryBusinesses(
    verified,
    orderCounts,
    limit,
  ) as PublicDirectoryBusiness[];
  featuredCache.set(limit, { exp: Date.now() + FEATURED_CACHE_TTL_MS, value: featured });
  return featured;
}

async function loadClientDirectoryBase(): Promise<ClientDirectoryCached[]> {
  if (clientDirectoryCache && clientDirectoryCache.exp > Date.now()) {
    return clientDirectoryCache.value;
  }

  const supabase = getServiceSupabaseClient();
  const { data, error } = await supabase
    .from('comercios')
    .select(DIRECTORY_SELECT)
    .eq('en_linea', true)
    .eq('mostrar_en_directorio_publico', true)
    .order('updated_at', { ascending: false })
    .limit(CLIENT_DIRECTORY_LIMIT);

  if (error) {
    throw new Error(error.message);
  }

  const rows = (data ?? []) as RawComercioRow[];
  const verifiedBasics = await filterVerifiedBusinesses(rows);
  const byId = new Map(verifiedBasics.map((entry) => [entry.id, entry]));
  const allowedRows = rows.filter((row) => byId.has((row.id ?? '').toString().trim()));
  const ids = allowedRows.map((row) => (row.id ?? '').toString().trim()).filter(Boolean);

  const [covers, ratings, productNames] = await Promise.all([
    loadCoverUrls(ids),
    loadRatingMap(ids),
    loadProductNames(ids),
  ]);

  const enriched: ClientDirectoryCached[] = allowedRows
    .map((row) => {
      const base = toDirectoryBusiness(row);
      if (!base) return null;
      const rating = ratings.get(base.id) ?? { average: 0, count: 0 };
      const lat = toFiniteCoord(row.latitud);
      const lng = toFiniteCoord(row.longitud);
      const hasValidCoords =
        lat != null &&
        lng != null &&
        !(Math.abs(lat) < 0.01 && Math.abs(lng) < 0.01);
      return {
        ...base,
        coverUrl: covers.get(base.id) ?? base.logoUrl,
        lat: hasValidCoords ? lat : null,
        lng: hasValidCoords ? lng : null,
        ratingAverage: rating.average,
        ratingCount: rating.count,
        promovido: readPromotedFlag(row.branding_ia),
        distanceKm: null,
        productNames: productNames.get(base.id) ?? [],
      };
    })
    .filter((entry): entry is ClientDirectoryCached => entry != null);

  clientDirectoryCache = { exp: Date.now() + CLIENT_CACHE_TTL_MS, value: enriched };
  return enriched;
}

async function enrichClientDirectoryRows(rows: RawComercioRow[]): Promise<ClientDirectoryCached[]> {
  if (rows.length === 0) return [];
  const verifiedBasics = await filterVerifiedBusinesses(rows);
  const byId = new Map(verifiedBasics.map((entry) => [entry.id, entry]));
  const allowedRows = rows.filter((row) => byId.has((row.id ?? '').toString().trim()));
  const ids = allowedRows.map((row) => (row.id ?? '').toString().trim()).filter(Boolean);
  const [covers, ratings, productNames] = await Promise.all([
    loadCoverUrls(ids),
    loadRatingMap(ids),
    loadProductNames(ids),
  ]);

  return allowedRows
    .map((row) => {
      const base = toDirectoryBusiness(row);
      if (!base) return null;
      const rating = ratings.get(base.id) ?? { average: 0, count: 0 };
      const lat = toFiniteCoord(row.latitud);
      const lng = toFiniteCoord(row.longitud);
      const hasValidCoords =
        lat != null &&
        lng != null &&
        !(Math.abs(lat) < 0.01 && Math.abs(lng) < 0.01);
      return {
        ...base,
        coverUrl: covers.get(base.id) ?? base.logoUrl,
        lat: hasValidCoords ? lat : null,
        lng: hasValidCoords ? lng : null,
        ratingAverage: rating.average,
        ratingCount: rating.count,
        promovido: readPromotedFlag(row.branding_ia),
        distanceKm: null,
        productNames: productNames.get(base.id) ?? [],
      };
    })
    .filter((entry): entry is ClientDirectoryCached => entry != null);
}

/** Extra hits from full DB (name + dish) so search is not limited to the carousel pool. */
async function loadClientDirectorySearchExtras(
  normalizedQuery: string,
  excludeIds: Set<string>,
): Promise<ClientDirectoryCached[]> {
  if (normalizedQuery.length < 2) return [];

  const supabase = getServiceSupabaseClient();
  const safeTerm = normalizedQuery.replace(/[%_,]/g, '').slice(0, 40);
  if (!safeTerm) return [];
  const pattern = `%${safeTerm}%`;

  const [byBusiness, byProduct] = await Promise.all([
    supabase
      .from('comercios')
      .select(DIRECTORY_SELECT)
      .eq('en_linea', true)
      .eq('mostrar_en_directorio_publico', true)
      .or(
        `nombre.ilike."${pattern}",slug.ilike."${pattern}",categoria.ilike."${pattern}",direccion.ilike."${pattern}"`,
      )
      .order('updated_at', { ascending: false })
      .limit(CLIENT_SEARCH_EXTRA_LIMIT),
    supabase
      .from('productos')
      .select('comercio_id,nombre')
      .ilike('nombre', pattern)
      .limit(120),
  ]);

  const productRows = (byProduct.data ?? []) as Array<{
    comercio_id?: string | null;
    nombre?: string | null;
  }>;
  const productHits = new Map<string, string[]>();
  for (const row of productRows) {
    const id = (row.comercio_id ?? '').toString().trim();
    const nombre = (row.nombre ?? '').toString().trim();
    if (!id || !nombre || excludeIds.has(id)) continue;
    const list = productHits.get(id) ?? [];
    if (list.length < PRODUCT_NAMES_PER_BUSINESS) list.push(nombre);
    productHits.set(id, list);
  }

  const businessRows = ((byBusiness.data ?? []) as RawComercioRow[]).filter((row) => {
    const id = (row.id ?? '').toString().trim();
    return Boolean(id) && !excludeIds.has(id);
  });

  const missingProductIds = [...productHits.keys()].filter(
    (id) => !businessRows.some((row) => (row.id ?? '').toString().trim() === id),
  );

  let productBusinessRows: RawComercioRow[] = [];
  if (missingProductIds.length > 0) {
    const { data } = await supabase
      .from('comercios')
      .select(DIRECTORY_SELECT)
      .eq('en_linea', true)
      .eq('mostrar_en_directorio_publico', true)
      .in('id', missingProductIds.slice(0, CLIENT_SEARCH_EXTRA_LIMIT));
    productBusinessRows = (data ?? []) as RawComercioRow[];
  }

  const mergedRows = [...businessRows, ...productBusinessRows];
  const unique = new Map<string, RawComercioRow>();
  for (const row of mergedRows) {
    const id = (row.id ?? '').toString().trim();
    if (!id || unique.has(id) || excludeIds.has(id)) continue;
    unique.set(id, row);
  }

  const enriched = await enrichClientDirectoryRows([...unique.values()].slice(0, CLIENT_SEARCH_EXTRA_LIMIT));
  return enriched.map((entry) => {
    const fromProducts = productHits.get(entry.id);
    if (!fromProducts || fromProducts.length === 0) return entry;
    const mergedNames = [...entry.productNames];
    for (const name of fromProducts) {
      if (!mergedNames.includes(name) && mergedNames.length < PRODUCT_NAMES_PER_BUSINESS) {
        mergedNames.push(name);
      }
    }
    return { ...entry, productNames: mergedNames };
  });
}

function withDistances(
  entries: ClientDirectoryCached[],
  origin: { lat: number; lng: number } | null,
): ClientDirectoryCached[] {
  return entries.map((entry) => {
    if (origin && entry.lat != null && entry.lng != null) {
      return {
        ...entry,
        distanceKm: Math.round(distanceKm(origin.lat, origin.lng, entry.lat, entry.lng) * 10) / 10,
      };
    }
    return { ...entry, distanceKm: null };
  });
}

function sortClientDirectory(
  entries: ClientDirectoryCached[],
  origin: { lat: number; lng: number } | null,
) {
  const withDistance = withDistances(entries, origin);

  return withDistance.sort((left, right) => {
    if (left.promovido !== right.promovido) return left.promovido ? -1 : 1;
    if (origin) {
      const leftDist = left.distanceKm ?? Number.POSITIVE_INFINITY;
      const rightDist = right.distanceKm ?? Number.POSITIVE_INFINITY;
      if (leftDist !== rightDist) return leftDist - rightDist;
    }
    if (right.ratingAverage !== left.ratingAverage) {
      return right.ratingAverage - left.ratingAverage;
    }
    if (right.ratingCount !== left.ratingCount) {
      return right.ratingCount - left.ratingCount;
    }
    return left.nombre.localeCompare(right.nombre, 'es');
  });
}

function sortByDiscoveryRelevance(
  entries: ClientDirectoryCached[],
  normalizedQuery: string,
  origin: { lat: number; lng: number } | null,
) {
  const withDistance = withDistances(entries, origin);
  const details = rankDirectorySearchDetails(withDistance, normalizedQuery);
  const detailById = new Map(details.map((item) => [item.entry.id, item]));

  return withDistance
    .map((entry) => {
      const detail = detailById.get(entry.id);
      if (!detail) return null;
      const rank = compositeDiscoveryScore({
        matchScore: detail.score,
        distanceKm: entry.distanceKm,
        ratingAverage: entry.ratingAverage,
        ratingCount: entry.ratingCount,
        promovido: entry.promovido,
        hasOrigin: origin != null,
      });
      return {
        ...entry,
        matchScore: detail.score,
        matchedDish: detail.matchedDish,
        _rank: rank,
      };
    })
    .filter(
      (
        entry,
      ): entry is ClientDirectoryCached & {
        matchScore: number;
        matchedDish: string | null;
        _rank: number;
      } => entry != null,
    )
    .sort((left, right) => {
      if (right._rank !== left._rank) return right._rank - left._rank;
      return left.nombre.localeCompare(right.nombre, 'es');
    })
    .map(({ _rank: _ignored, ...entry }) => entry);
}

export async function listClientDirectory(options: {
  query?: string;
  region?: string;
  category?: string;
  lat?: number;
  lng?: number;
  limit?: number;
}) {
  const limit = Math.min(Math.max(options.limit ?? 48, 1), 120);
  const normalizedQuery = normalizeDirectoryQuery(options.query ?? '');
  const region = normalizeDirectoryQuery(options.region ?? '');
  const category = (options.category ?? '').trim().toLowerCase();
  const origin =
    options.lat != null &&
    options.lng != null &&
    Number.isFinite(options.lat) &&
    Number.isFinite(options.lng)
      ? { lat: options.lat, lng: options.lng }
      : null;

  let entries = await loadClientDirectoryBase();

  if (normalizedQuery) {
    const knownIds = new Set(entries.map((entry) => entry.id));
    const extras = await loadClientDirectorySearchExtras(normalizedQuery, knownIds);
    if (extras.length > 0) {
      entries = [...entries, ...extras];
    }
  }

  if (region) {
    entries = entries.filter((entry) =>
      normalizeDirectoryQuery(entry.direccion ?? '').includes(region),
    );
  }

  if (category && category !== 'mas') {
    entries = entries.filter(
      (entry) =>
        categoryChipMatches(entry.categoria, category) ||
        categoryChipMatches(entry.nombre, category) ||
        categoryChipMatches(entry.slug, category) ||
        entry.productNames.some((name) => categoryChipMatches(name, category)),
    );
  }

  const sorted = normalizedQuery
    ? sortByDiscoveryRelevance(entries, normalizedQuery, origin)
    : sortClientDirectory(entries, origin);

  const publicResults = sorted.map(toPublicClientBusiness);
  const promoted = publicResults.filter((entry) => entry.promovido);
  const topRated = [...publicResults]
    .filter((entry) => entry.ratingCount > 0)
    .sort((left, right) => {
      if (right.ratingAverage !== left.ratingAverage) {
        return right.ratingAverage - left.ratingAverage;
      }
      return right.ratingCount - left.ratingCount;
    })
    .slice(0, 12);

  return {
    results: publicResults.slice(0, limit),
    promoted: promoted.slice(0, 12),
    topRated,
    total: publicResults.length,
  };
}

export async function searchPublicDirectory(options: {
  query?: string;
  limit?: number;
}) {
  const limit = Math.min(Math.max(options.limit ?? 8, 1), 20);
  const normalizedQuery = normalizeDirectoryQuery(options.query ?? '');
  const supabase = getServiceSupabaseClient();

  if (normalizedQuery.length === 0) {
    return loadFeaturedDirectoryBusinesses(limit);
  }

  const safeTerm = normalizedQuery.replace(/[%_]/g, '');
  const pattern = `%${safeTerm}%`;

  const { data, error } = await supabase
    .from('comercios')
    .select(DIRECTORY_SELECT)
    .eq('en_linea', true)
    .eq('mostrar_en_directorio_publico', true)
    .or(
      `nombre.ilike."${pattern}",slug.ilike."${pattern}",categoria.ilike."${pattern}",direccion.ilike."${pattern}"`,
    )
    .order('updated_at', { ascending: false })
    .limit(limit * 4);

  if (error) {
    throw new Error(error.message);
  }

  const rows = (data ?? []) as RawComercioRow[];
  const verified = await filterVerifiedBusinesses(rows);
  const ranked = rankDirectorySearchResults(verified, normalizedQuery);

  return ranked.slice(0, limit);
}
