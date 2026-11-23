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

/** Convert WGS84 → OSM slippy-map tile indices. */
export function latLngToTile(
  lat: number,
  lng: number,
  zoom: number,
): { x: number; y: number; z: number } {
  const z = Math.max(0, Math.min(18, Math.floor(zoom)));
  const n = 2 ** z;
  const x = Math.floor(((lng + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n,
  );
  return {
    x: Math.min(n - 1, Math.max(0, x)),
    y: Math.min(n - 1, Math.max(0, y)),
    z,
  };
}

/**
 * Lightweight map preview via a single OSM raster tile (no Google billing).
 * Prefer this over staticmap.openstreetmap.de which often fails in browsers.
 */
export function staticMapPreviewUrl(lat: number, lng: number, zoom = 16): string {
  const { x, y, z } = latLngToTile(lat, lng, zoom);
  return `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;
}

/** Best-effort reverse geocode for a friendlier delivery label. */
export async function reverseGeocodeLabel(
  lat: number,
  lng: number,
): Promise<string | null> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (typeof fetch === 'undefined') return null;
  try {
    const url =
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2` +
      `&lat=${encodeURIComponent(String(lat))}` +
      `&lon=${encodeURIComponent(String(lng))}` +
      `&zoom=18&addressdetails=0`;
    const res = await fetch(url, {
      headers: {
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(4500),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { display_name?: string };
    const name = (data.display_name || '').trim();
    return name ? name.slice(0, 140) : null;
  } catch {
    return null;
  }
}
