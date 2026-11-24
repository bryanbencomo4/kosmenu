import {
  VENEZUELA_STATE_DISPLAY_NAMES,
  VENEZUELA_STATES,
  operatingStatesMatchRegion,
} from '../../_lib/venezuela-states';
import { normalizeDirectoryQuery } from './public-directory-text';

/** Haversine distance in km between two WGS84 points. */
export function distanceKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
) {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function toFiniteCoord(value: unknown): number | null {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Region chips for discovery. Full Venezuela catalog; stats only show
 * regions with at least one matching business.
 */
export const DIRECTORY_REGIONS = VENEZUELA_STATE_DISPLAY_NAMES;

/** Landmark words that precede a state name without meaning the federal entity
 * (e.g. "Plaza Bolívar", "Av. Francisco de Miranda"). */
const STATE_LANDMARK_PREFIXES = [
  'plaza',
  'avenida',
  'av',
  'calle',
  'carrera',
  'parque',
  'boulevard',
  'bulevar',
  'estadio',
  'puente',
  'hospital',
  'universidad',
  'francisco',
] as const;

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Collapse punctuation so "Palmira, Táchira" and "Plaza Bolívar." tokenize cleanly. */
function tokenizeDirectoryText(value: string) {
  return normalizeDirectoryQuery(value)
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Whole-token match that ignores state names used as street/plaza landmarks. */
function addressHasGeographicStateToken(hay: string, needle: string) {
  if (!hay || !needle) return false;
  const token = escapeRegex(needle);
  const landmark = STATE_LANDMARK_PREFIXES.map(escapeRegex).join('|');
  // Skip "plaza bolivar", "avenida francisco de miranda", "francisco de miranda".
  const landmarkRe = new RegExp(
    `(?:^|\\s)(?:${landmark})(?:\\s+de)?\\s+${token}(?:\\s|$)`,
  );
  if (landmarkRe.test(hay)) return false;
  const tokenRe = new RegExp(`(?:^|\\s)${token}(?:\\s|$)`);
  return tokenRe.test(hay);
}

function addressMatchesRegionLabel(address: string, regionLabel: string) {
  const hay = tokenizeDirectoryText(address);
  if (!hay) return false;
  const needle = tokenizeDirectoryText(regionLabel);
  if (!needle) return false;

  const state =
    VENEZUELA_STATES.find(
      (item) => normalizeDirectoryQuery(item.name) === needle,
    ) ??
    VENEZUELA_STATES.find((item) =>
      (item.aliases ?? []).some(
        (alias) => normalizeDirectoryQuery(alias) === needle,
      ),
    ) ??
    VENEZUELA_STATES.find(
      (item) => normalizeDirectoryQuery(item.slug) === needle,
    );

  const labels = state
    ? [state.name, state.slug, ...(state.aliases ?? [])]
    : [regionLabel];

  for (const label of labels) {
    const aliasNeedle = tokenizeDirectoryText(label);
    if (addressHasGeographicStateToken(hay, aliasNeedle)) return true;
  }
  return false;
}

/**
 * Region chip / URL match.
 * When the restaurant declared operating states, those win (never infer Bolívar
 * from "Plaza Bolívar" in the address). Address fallback is only for shops
 * that have not set `estados_operacion` yet.
 */
export function directoryEntryMatchesRegion(
  entry: {
    direccion?: string | null;
    estadosOperacion?: string[] | null;
  },
  regionQuery: string,
) {
  const region = (regionQuery ?? '').trim();
  if (!region) return true;
  const declared = entry.estadosOperacion ?? [];
  if (declared.length > 0) {
    return operatingStatesMatchRegion(declared, region);
  }
  return addressMatchesRegionLabel(entry.direccion ?? '', region);
}

export type DirectoryCategoryChip = {
  id: string;
  label: string;
  glyph: string;
  /** Tie-breaker when restaurant supply is similar (higher = more important). */
  priority: number;
};

/**
 * Catalog of cuisine chips for discovery. Only chips with real restaurant
 * supply should be shown (see `buildDirectoryCategoryStats`).
 */
export const DIRECTORY_CATEGORY_CHIPS: readonly DirectoryCategoryChip[] = [
  { id: 'hamburguesas', label: 'Hamburguesas', glyph: '🍔', priority: 100 },
  { id: 'pizzas', label: 'Pizzas', glyph: '🍕', priority: 96 },
  { id: 'arepas', label: 'Arepas', glyph: '🫓', priority: 94 },
  { id: 'pollo', label: 'Pollo', glyph: '🍗', priority: 90 },
  { id: 'sushi', label: 'Sushi', glyph: '🍣', priority: 82 },
  { id: 'parrilla', label: 'Parrilla', glyph: '🥩', priority: 80 },
  { id: 'cafe', label: 'Cafeterías', glyph: '☕', priority: 72 },
  { id: 'criolla', label: 'Comida criolla', glyph: '🍲', priority: 70 },
  { id: 'postres', label: 'Postres', glyph: '🍰', priority: 55 },
  { id: 'tacos', label: 'Tacos', glyph: '🌮', priority: 48 },
  { id: 'saludable', label: 'Saludable', glyph: '🥗', priority: 42 },
  { id: 'bares', label: 'Bares', glyph: '🍻', priority: 28 },
] as const;

/** Tokens kept tight so empty/false categories do not pollute the carousel. */
const CATEGORY_TOKENS: Record<string, string[]> = {
  hamburguesas: ['hamburg', 'burger', 'burguer', 'smash'],
  pizzas: ['pizza', 'pizzer'],
  arepas: ['arepa'],
  pollo: ['pollo', 'broaster', 'chicken', 'alitas', 'wings'],
  sushi: ['sushi', 'poke'],
  parrilla: ['parrill', 'steak', 'churrasco', 'churrasq'],
  cafe: ['cafe', 'cafeter', 'coffee', 'espresso', 'cappuccino', 'latte'],
  criolla: ['crioll', 'pabellon', 'venezol', 'tipic'],
  postres: ['postre', 'helader', 'cheesecake', 'merengada', 'pasteler', 'torta', 'dulce'],
  tacos: ['taco', 'quesadilla', 'nacho'],
  saludable: ['salud', 'fitness', 'ensalada', 'bowl', 'wrap'],
  // Avoid bare "bar" (matches Barbería / random substrings).
  bares: ['bares', 'licorer', 'coctel', 'pub'],
};

function foldCategoryHay(value: string | null | undefined): string {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function hayHasCategoryToken(hay: string, token: string): boolean {
  if (!hay || !token) return false;
  if (token.length >= 4) return hay.includes(token);
  // Short tokens need a soft boundary so "bar" ≠ "Salsamentaria".
  const re = new RegExp(`(?:^|[^a-z0-9])${token}(?:[^a-z0-9]|$)`);
  return re.test(hay);
}

export function categoryChipMatches(categoria: string | null | undefined, chipId: string) {
  const hay = foldCategoryHay(categoria);
  if (!hay) return false;
  return (CATEGORY_TOKENS[chipId] ?? []).some((token) => hayHasCategoryToken(hay, token));
}

/**
 * A dish belongs to a discovery chip when its product name OR its menu
 * category name matches (e.g. “Classic” inside categoría “Hamburguesas”).
 */
export function dishMatchesDirectoryCategory(
  dish: { name?: string | null; categoryName?: string | null },
  chipId: string,
): boolean {
  if (!chipId) return false;
  return (
    categoryChipMatches(dish.name, chipId) ||
    categoryChipMatches(dish.categoryName, chipId)
  );
}

export type DirectoryCategoryStatEntry = {
  id: string;
  nombre: string;
  slug: string;
  categoria: string | null;
  productNames: string[];
  coverUrl?: string | null;
  logoUrl?: string | null;
  showcaseDishes?: Array<{ name?: string; imageUrl?: string | null }>;
};

export type DirectoryCategoryStat = DirectoryCategoryChip & {
  count: number;
  strongCount: number;
  coverUrl: string | null;
  /** Ranking score used for “most important first”. */
  score: number;
};

function pickCategoryCoverFromEntry(
  entry: DirectoryCategoryStatEntry,
  chipId: string,
): string | null {
  const tokens = CATEGORY_TOKENS[chipId] ?? [];
  for (const dish of entry.showcaseDishes || []) {
    const img = (dish.imageUrl || '').trim();
    if (!img) continue;
    const dishHay = foldCategoryHay(dish.name || '');
    if (tokens.some((t) => hayHasCategoryToken(dishHay, t))) return img;
  }
  const firstDish = (entry.showcaseDishes || []).find((d) => (d.imageUrl || '').trim());
  if (firstDish?.imageUrl) return firstDish.imageUrl.trim();
  if (entry.coverUrl?.trim()) return entry.coverUrl.trim();
  if (entry.logoUrl?.trim()) return entry.logoUrl.trim();
  return null;
}

/**
 * Real categories present in the directory pool, ranked by supply + priority.
 * Drops chips with zero restaurants (never suggest what we do not have).
 */
export function buildDirectoryCategoryStats(
  entries: DirectoryCategoryStatEntry[],
): DirectoryCategoryStat[] {
  const stats: DirectoryCategoryStat[] = [];

  for (const chip of DIRECTORY_CATEGORY_CHIPS) {
    let count = 0;
    let strongCount = 0;
    let coverUrl: string | null = null;

    for (const entry of entries) {
      const sectorHit =
        categoryChipMatches(entry.categoria, chip.id) ||
        categoryChipMatches(entry.nombre, chip.id) ||
        categoryChipMatches(entry.slug, chip.id);
      const dishHit = (entry.productNames || []).some((name) =>
        categoryChipMatches(name, chip.id),
      );
      if (!sectorHit && !dishHit) continue;
      count += 1;
      if (sectorHit) strongCount += 1;
      if (!coverUrl) {
        coverUrl = pickCategoryCoverFromEntry(entry, chip.id);
      }
    }

    if (count <= 0) continue;

    const score = count * 12 + strongCount * 28 + chip.priority;
    stats.push({
      ...chip,
      count,
      strongCount,
      coverUrl,
      score,
    });
  }

  return stats.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.count !== a.count) return b.count - a.count;
    return a.label.localeCompare(b.label, 'es');
  });
}

/** Initial portrait tiles in the assistant; more unlock via “Más”. */
export const DISCOVERY_CATEGORY_INITIAL = 5;
export const DISCOVERY_CATEGORY_MORE_BATCH = 4;
export const DISCOVERY_MORE_CATEGORY_ID = 'mas';
