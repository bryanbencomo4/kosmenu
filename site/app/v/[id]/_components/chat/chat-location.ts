export type ChatBusinessLocation = {
  lat: number;
  lng: number;
  label: string;
  address: string | null;
  mapsUrl: string;
  directionsUrl: string;
};

/** "dónde están", "cómo llego", "ubicación", "envíame la ubicación", "mapa"… */
export const LOCATION_INTENT_RE =
  /donde (estan|queda|ubic)|como (llego|llegar)|ubicacion|localizacion|direccion( del local)?|envia(me)? (la )?ubicacion|manda(me)? (la )?ubicacion|mapa|gps|coordenadas/i;

export function matchLocationIntent(text: string | null | undefined): boolean {
  const raw = (text ?? '').trim();
  if (!raw) return false;
  const norm = raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[¿?¡!.,;:]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!norm) return false;
  if (norm.split(' ').length > 12) return false;
  return LOCATION_INTENT_RE.test(norm);
}

export function buildBusinessLocation(input: {
  lat: number | null;
  lng: number | null;
  name: string;
  address: string | null;
}): ChatBusinessLocation | null {
  if (
    input.lat == null ||
    input.lng == null ||
    !Number.isFinite(input.lat) ||
    !Number.isFinite(input.lng)
  ) {
    return null;
  }
  const lat = input.lat;
  const lng = input.lng;
  const query = `${lat},${lng}`;
  const label = (input.name || 'Ubicación').trim() || 'Ubicación';
  return {
    lat,
    lng,
    label,
    address: (input.address || '').trim() || null,
    mapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`,
    directionsUrl: `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(query)}`,
  };
}

/** Lightweight map preview (no Google billing). */
export function staticMapPreviewUrl(lat: number, lng: number): string {
  return `https://staticmap.openstreetmap.de/staticmap.php?center=${lat},${lng}&zoom=16&size=560x280&markers=${lat},${lng},red-pushpin`;
}
