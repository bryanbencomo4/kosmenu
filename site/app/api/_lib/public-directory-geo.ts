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

function addressMatchesRegionLabel(address: string, regionLabel: string) {
  const hay = normalizeDirectoryQuery(address);
  if (!hay) return false;
  const needle = normalizeDirectoryQuery(regionLabel);
  if (needle && hay.includes(needle)) return true;

  const state = VENEZUELA_STATES.find(
    (item) => normalizeDirectoryQuery(item.name) === needle,
  );
  if (!state) {
    // Legacy chip "Caracas DC" against an address that only says "Caracas".
    for (const item of VENEZUELA_STATES) {
      for (const alias of item.aliases ?? []) {
        if (normalizeDirectoryQuery(alias) === needle) {
          for (const label of [item.name, item.slug, ...(item.aliases ?? [])]) {
            const aliasNeedle = normalizeDirectoryQuery(label);
            if (aliasNeedle && hay.includes(aliasNeedle)) return true;
          }
        }
      }
    }
    return false;
  }
  for (const alias of state.aliases ?? []) {
    const aliasNeedle = normalizeDirectoryQuery(alias);
    if (aliasNeedle && hay.includes(aliasNeedle)) return true;
  }
  return false;
}

/** Physical address OR virtual operating-states match for a region chip/URL. */
export function directoryEntryMatchesRegion(
  entry: {
    direccion?: string | null;
    estadosOperacion?: string[] | null;
  },
  regionQuery: string,
) {
  const region = (regionQuery ?? '').trim();
  if (!region) return true;
  if (addressMatchesRegionLabel(entry.direccion ?? '', region)) return true;
  return operatingStatesMatchRegion(entry.estadosOperacion, region);
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
