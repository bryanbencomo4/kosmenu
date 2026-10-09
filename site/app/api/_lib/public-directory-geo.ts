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

/** Venezuela-oriented region chips for discovery filters (matched against direccion). */
export const DIRECTORY_REGIONS = [
  'Caracas DC',
  'Miranda',
  'La Guaira',
  'Aragua',
  'Carabobo',
  'Anzoátegui',
  'Zulia',
  'Nueva Esparta',
  'Táchira',
  'Mérida',
] as const;

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
