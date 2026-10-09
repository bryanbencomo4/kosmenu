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
import { resolveBusinessScheduleStatus } from './business-hours';
import {
  categoryChipMatches,
  DIRECTORY_REGIONS,
  distanceKm,
  toFiniteCoord,
} from './public-directory-geo';
import { tokenizeSearchText } from '../../_lib/search-text';
import { normalizeDirectoryQuery } from './public-directory-text';
import { getServiceSupabaseClient } from './supabase-server';

export type DirectoryRegionStat = {
  name: string;
  count: number;
};

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

export type DirectoryShowcaseDish = {
  name: string;
  imageUrl: string;
  price: number;
  compareAtPrice: number | null;
};

export type ClientDirectoryBusiness = PublicDirectoryBusiness & {
  coverUrl: string | null;
  lat: number | null;
  lng: number | null;
  ratingAverage: number;
  ratingCount: number;
  promovido: boolean;
  distanceKm: number | null;
  /** null = horario no configurado */
  isOpen: boolean | null;
  openLabel: string | null;
  /** Public dish names used for instant client + server search. */
  productNames: string[];
  /** Food teasers for discovery cards (image + price). */
  showcaseDishes: DirectoryShowcaseDish[];
  matchedDish?: string | null;
  matchScore?: number;
};

type ClientDirectoryCached = Omit<ClientDirectoryBusiness, 'isOpen' | 'openLabel'> & {
  productNames: string[];
  horarios: unknown;
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
  horarios?: unknown;
  mostrar_en_directorio_publico?: boolean | null;
};

const DIRECTORY_SELECT =
  'id,slug,nombre,logo_url,categoria,direccion,negocio_virtual,owner_id,updated_at,latitud,longitud,branding_ia,horarios,mostrar_en_directorio_publico';

/** Demo / QA restaurants — never list in public discovery. */
const DIRECTORY_EXCLUDED_SLUGS = new Set([
  'qa-restaurant',
  'la-mordida-demo',
  'pizzas-y-pastas',
  'demo',
  'pizzas-el-trueno',
  'omg-burgers',
]);

function isExcludedDirectorySlug(slug: string) {
  return DIRECTORY_EXCLUDED_SLUGS.has(slug.trim().toLowerCase());
}

const FEATURED_ORDER_LOOKBACK_DAYS = 90;
const FEATURED_CANDIDATE_LIMIT = 120;
const CLIENT_DIRECTORY_LIMIT = 80;
const CLIENT_SEARCH_EXTRA_LIMIT = 64;
const CLIENT_SEARCH_PRODUCT_LIMIT = 280;
const FEATURED_CACHE_TTL_MS = 60_000;
const CLIENT_CACHE_TTL_MS = 45_000;
const VERIFY_BATCH_SIZE = 8;

type Cached<T> = { exp: number; value: T };
const featuredCache = new Map<number, Cached<PublicDirectoryBusiness[]>>();
let clientDirectoryCache: Cached<ClientDirectoryCached[]> | null = null;
const PRODUCT_NAMES_PER_BUSINESS = 48;
const SHOWCASE_DISHES_PER_BUSINESS = 4;
const SHOWCASE_DISHES_TOTAL_CAP = 480;

function mergeProductNames(base: string[], extra: string[]) {
  const out = [...base];
  for (const name of extra) {
    if (!name || out.includes(name)) continue;
    if (out.length >= PRODUCT_NAMES_PER_BUSINESS) break;
    out.push(name);
  }
  return out;
}

function buildSearchIlikePatterns(rawQuery: string, normalizedQuery: string) {
  const patterns = new Set<string>();
  const add = (term: string) => {
    const safe = term.replace(/[%_,]/g, '').trim().slice(0, 40);
    if (safe.length >= 2) patterns.add(`%${safe}%`);
  };
  for (const term of [rawQuery, normalizedQuery]) add(term);
  // Token patterns catch dish hits when the full phrase isn't in a single field.
  for (const token of tokenizeSearchText(normalizedQuery)) {
    if (token.length >= 3) add(token);
  }
  return [...patterns];
}

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
  if (isExcludedDirectorySlug(slug)) return null;

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

async function loadShowcaseDishes(comercioIds: string[]) {
  const dishes = new Map<string, DirectoryShowcaseDish[]>();
  if (comercioIds.length === 0) return dishes;

  const supabase = getServiceSupabaseClient();
  const { data, error } = await supabase
    .from('productos')
    .select('comercio_id,nombre,imagen_url,precio,precio_comparacion,disponible,orden')
    .in('comercio_id', comercioIds)
    .not('imagen_url', 'is', null)
    .order('orden', { ascending: true })
    .limit(SHOWCASE_DISHES_TOTAL_CAP);

  if (error || !data) return dishes;

  for (const row of data as Array<{
    comercio_id?: string | null;
    nombre?: string | null;
    imagen_url?: string | null;
    precio?: number | string | null;
    precio_comparacion?: number | string | null;
    disponible?: boolean | null;
  }>) {
    if (row.disponible === false) continue;
    const id = (row.comercio_id ?? '').toString().trim();
    const name = (row.nombre ?? '').toString().trim();
    const imageUrl = (row.imagen_url ?? '').toString().trim();
    const price = Number(row.precio);
    if (!id || !name || !imageUrl || !Number.isFinite(price) || price <= 0) continue;
    const list = dishes.get(id) ?? [];
    if (list.length >= SHOWCASE_DISHES_PER_BUSINESS) continue;
    const compareRaw = Number(row.precio_comparacion);
    const compareAtPrice =
      Number.isFinite(compareRaw) && compareRaw > price ? compareRaw : null;
    list.push({ name, imageUrl, price, compareAtPrice });
    dishes.set(id, list);
  }

  return dishes;
}

async function loadProductNames(comercioIds: string[]) {
  const names = new Map<string, string[]>();
  if (comercioIds.length === 0) return names;

  const supabase = getServiceSupabaseClient();
  // Batch so each commerce gets a fair share of dish names for client search.
  const BATCH = 20;
  for (let offset = 0; offset < comercioIds.length; offset += BATCH) {
    const chunk = comercioIds.slice(offset, offset + BATCH);
    const { data, error } = await supabase
      .from('productos')
      .select('comercio_id,nombre,disponible,orden')
      .in('comercio_id', chunk)
      .order('orden', { ascending: true })
      .limit(PRODUCT_NAMES_PER_BUSINESS * chunk.length);

    if (error || !data) continue;

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
  }

  return names;
}

function scheduleFields(horarios: unknown): Pick<ClientDirectoryBusiness, 'isOpen' | 'openLabel'> {
  const status = resolveBusinessScheduleStatus(horarios);
  if (!status.configured) {
    return { isOpen: null, openLabel: null };
  }
  if (status.isOpen) {
    return {
      isOpen: true,
      openLabel:
        status.closesAtLabel === '24 horas'
          ? 'Abierto 24h'
          : status.closesAtLabel
            ? `Abierto · hasta ${status.closesAtLabel}`
            : 'Abierto',
    };
  }
  return {
    isOpen: false,
    openLabel: status.nextOpenLabel
      ? `Abre ${status.nextOpenLabel}`
      : null,
  };
}

/** Lower sorts first: open → unknown hours → closed. */
function openSortRank(horarios: unknown) {
  const status = resolveBusinessScheduleStatus(horarios);
  if (!status.configured) return 1;
  return status.isOpen ? 0 : 2;
}

function toPublicClientBusiness(entry: ClientDirectoryCached): ClientDirectoryBusiness {
  const { horarios, productNames, ...publicEntry } = entry;
  return {
    ...publicEntry,
    productNames: productNames.slice(0, PRODUCT_NAMES_PER_BUSINESS),
    ...scheduleFields(horarios),
  };
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

  const [showcaseDishes, ratings, productNames] = await Promise.all([
    loadShowcaseDishes(ids),
    loadRatingMap(ids),
    loadProductNames(ids),
  ]);

  const enriched: ClientDirectoryCached[] = allowedRows
    .map((row) => {
      const base = toDirectoryBusiness(row);
      if (!base) return null;
      const rating = ratings.get(base.id) ?? { average: 0, count: 0 };
      const dishes = showcaseDishes.get(base.id) ?? [];
      const lat = toFiniteCoord(row.latitud);
      const lng = toFiniteCoord(row.longitud);
      const hasValidCoords =
        lat != null &&
        lng != null &&
        !(Math.abs(lat) < 0.01 && Math.abs(lng) < 0.01);
      return {
        ...base,
        coverUrl: dishes[0]?.imageUrl ?? base.logoUrl,
        lat: hasValidCoords ? lat : null,
        lng: hasValidCoords ? lng : null,
        ratingAverage: rating.average,
        ratingCount: rating.count,
        promovido: readPromotedFlag(row.branding_ia),
        distanceKm: null,
        horarios: row.horarios ?? null,
        productNames: productNames.get(base.id) ?? [],
        showcaseDishes: dishes,
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
  const [showcaseDishes, ratings, productNames] = await Promise.all([
    loadShowcaseDishes(ids),
    loadRatingMap(ids),
    loadProductNames(ids),
  ]);

  return allowedRows
    .map((row) => {
      const base = toDirectoryBusiness(row);
      if (!base) return null;
      const rating = ratings.get(base.id) ?? { average: 0, count: 0 };
      const dishes = showcaseDishes.get(base.id) ?? [];
      const lat = toFiniteCoord(row.latitud);
      const lng = toFiniteCoord(row.longitud);
      const hasValidCoords =
        lat != null &&
        lng != null &&
        !(Math.abs(lat) < 0.01 && Math.abs(lng) < 0.01);
      return {
        ...base,
        coverUrl: dishes[0]?.imageUrl ?? base.logoUrl,
        lat: hasValidCoords ? lat : null,
        lng: hasValidCoords ? lng : null,
        ratingAverage: rating.average,
        ratingCount: rating.count,
        promovido: readPromotedFlag(row.branding_ia),
        distanceKm: null,
        horarios: row.horarios ?? null,
        productNames: productNames.get(base.id) ?? [],
        showcaseDishes: dishes,
      };
    })
    .filter((entry): entry is ClientDirectoryCached => entry != null);
}

/** Extra hits from full DB (name + dish) so search is not limited to the carousel pool. */
async function loadClientDirectorySearchExtras(
  rawQuery: string,
  normalizedQuery: string,
  knownIds: Set<string>,
): Promise<{
  newEntries: ClientDirectoryCached[];
  productNamesById: Map<string, string[]>;
}> {
  if (normalizedQuery.length < 2) {
    return { newEntries: [], productNamesById: new Map() };
  }

  const supabase = getServiceSupabaseClient();
  const patterns = buildSearchIlikePatterns(rawQuery, normalizedQuery);
  if (patterns.length === 0) {
    return { newEntries: [], productNamesById: new Map() };
  }

  const businessOr = patterns
    .flatMap((pattern) => [
      `nombre.ilike."${pattern}"`,
      `slug.ilike."${pattern}"`,
      `categoria.ilike."${pattern}"`,
      `direccion.ilike."${pattern}"`,
    ])
    .join(',');
  const productOr = patterns.map((pattern) => `nombre.ilike."${pattern}"`).join(',');

  const [byBusiness, byProduct] = await Promise.all([
    supabase
      .from('comercios')
      .select(DIRECTORY_SELECT)
      .eq('en_linea', true)
      .eq('mostrar_en_directorio_publico', true)
      .or(businessOr)
      .order('updated_at', { ascending: false })
      .limit(CLIENT_SEARCH_EXTRA_LIMIT),
    supabase
      .from('productos')
      .select('comercio_id,nombre,disponible')
      .or(productOr)
      .limit(CLIENT_SEARCH_PRODUCT_LIMIT),
  ]);

  const productRows = (byProduct.data ?? []) as Array<{
    comercio_id?: string | null;
    nombre?: string | null;
    disponible?: boolean | null;
  }>;
  const productNamesById = new Map<string, string[]>();
  for (const row of productRows) {
    if (row.disponible === false) continue;
    const id = (row.comercio_id ?? '').toString().trim();
    const nombre = (row.nombre ?? '').toString().trim();
    if (!id || !nombre) continue;
    const list = productNamesById.get(id) ?? [];
    if (list.length >= PRODUCT_NAMES_PER_BUSINESS || list.includes(nombre)) continue;
    list.push(nombre);
    productNamesById.set(id, list);
  }

  const businessRows = ((byBusiness.data ?? []) as RawComercioRow[]).filter((row) => {
    const id = (row.id ?? '').toString().trim();
    return Boolean(id) && !knownIds.has(id);
  });

  const missingProductIds = [...productNamesById.keys()].filter(
    (id) =>
      !knownIds.has(id) &&
      !businessRows.some((row) => (row.id ?? '').toString().trim() === id),
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
    if (!id || unique.has(id) || knownIds.has(id)) continue;
    unique.set(id, row);
  }

  const enriched = await enrichClientDirectoryRows(
    [...unique.values()].slice(0, CLIENT_SEARCH_EXTRA_LIMIT),
  );
  const newEntries = enriched.map((entry) => {
    const fromProducts = productNamesById.get(entry.id);
    if (!fromProducts || fromProducts.length === 0) return entry;
    return { ...entry, productNames: mergeProductNames(entry.productNames, fromProducts) };
  });

  return { newEntries, productNamesById };
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
    const openDiff = openSortRank(left.horarios) - openSortRank(right.horarios);
    if (openDiff !== 0) return openDiff;
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
      const schedule = scheduleFields(entry.horarios);
      const rank = compositeDiscoveryScore({
        matchScore: detail.score,
        distanceKm: entry.distanceKm,
        ratingAverage: entry.ratingAverage,
        ratingCount: entry.ratingCount,
        promovido: entry.promovido,
        hasOrigin: origin != null,
        isOpen: schedule.isOpen,
      });
      return {
        ...entry,
        matchScore: detail.score,
        matchedDish: detail.matchedDish,
        _rank: rank,
        _openRank: openSortRank(entry.horarios),
      };
    })
    .filter(
      (
        entry,
      ): entry is ClientDirectoryCached & {
        matchScore: number;
        matchedDish: string | null;
        _rank: number;
        _openRank: number;
      } => entry != null,
    )
    .sort((left, right) => {
      if (left._openRank !== right._openRank) return left._openRank - right._openRank;
      if (right._rank !== left._rank) return right._rank - left._rank;
      return left.nombre.localeCompare(right.nombre, 'es');
    })
    .map(({ _rank: _ignored, _openRank: _openIgnored, ...entry }) => entry);
}

function buildRegionStats(entries: ClientDirectoryCached[]): DirectoryRegionStat[] {
  const normalizedRegions = DIRECTORY_REGIONS.map((name) => ({
    name,
    key: normalizeDirectoryQuery(name),
  }));
  const counts = new Map<string, number>(DIRECTORY_REGIONS.map((name) => [name, 0]));

  for (const entry of entries) {
    const address = normalizeDirectoryQuery(entry.direccion ?? '');
    if (!address) continue;
    const matched = normalizedRegions.find((region) => address.includes(region.key));
    if (!matched) continue;
    counts.set(matched.name, (counts.get(matched.name) ?? 0) + 1);
  }

  return DIRECTORY_REGIONS.map((name) => ({
    name,
    count: counts.get(name) ?? 0,
  })).filter((region) => region.count > 0);
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
  // Region chips use the full directory pool (not the active search filters).
  const regions = buildRegionStats(entries);

  if (normalizedQuery) {
    const knownIds = new Set(entries.map((entry) => entry.id));
    const { newEntries, productNamesById } = await loadClientDirectorySearchExtras(
      options.query ?? '',
      normalizedQuery,
      knownIds,
    );
    // Merge dish hits into already-cached businesses (no re-enrich).
    if (productNamesById.size > 0) {
      entries = entries.map((entry) => {
        const extraNames = productNamesById.get(entry.id);
        if (!extraNames || extraNames.length === 0) return entry;
        return {
          ...entry,
          productNames: mergeProductNames(entry.productNames, extraNames),
        };
      });
    }
    if (newEntries.length > 0) {
      entries = [...entries, ...newEntries];
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
      const leftOpen = left.isOpen === true ? 0 : left.isOpen == null ? 1 : 2;
      const rightOpen = right.isOpen === true ? 0 : right.isOpen == null ? 1 : 2;
      if (leftOpen !== rightOpen) return leftOpen - rightOpen;
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
    regions,
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
