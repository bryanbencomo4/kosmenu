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

export const DIRECTORY_CATEGORY_CHIPS = [
  { id: 'hamburguesas', label: 'Hamburguesas', glyph: '🍔' },
  { id: 'tacos', label: 'Tacos', glyph: '🌮' },
  { id: 'pizzas', label: 'Pizzas', glyph: '🍕' },
  { id: 'criolla', label: 'Comida criolla', glyph: '🍲' },
  { id: 'sushi', label: 'Sushi', glyph: '🍣' },
  { id: 'cafe', label: 'Cafeterías', glyph: '☕' },
  { id: 'postres', label: 'Postres', glyph: '🍰' },
  { id: 'bares', label: 'Bares', glyph: '🍻' },
] as const;

export function categoryChipMatches(categoria: string | null | undefined, chipId: string) {
  const hay = (categoria ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  const map: Record<string, string[]> = {
    hamburguesas: ['hamburg', 'burger', 'rapida', 'fast'],
    tacos: ['taco', 'mexi'],
    pizzas: ['pizza', 'pizzer'],
    criolla: ['crioll', 'venezol', 'tipic', 'casera'],
    sushi: ['sushi', 'japon', 'asia'],
    cafe: ['cafe', 'cafeter', 'coffee', 'panader'],
    postres: ['postre', 'dulce', 'helader', 'pastel'],
    bares: ['bar', 'pub', 'licor', 'coctel'],
  };
  return (map[chipId] ?? []).some((token) => hay.includes(token));
}
