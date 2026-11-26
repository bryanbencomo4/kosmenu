/**
 * Location helpers shared by the WhatsApp Master and the web assistants:
 *  - read coordinates from shared WhatsApp locations, Google Maps links or "10.49, -66.88"
 *  - turn a typed address / sector into coordinates (OpenStreetMap Nominatim)
 * Pure parsing is dependency-free; network calls never throw (they return null).
 */

export type GeoPoint = { lat: number; lng: number; label?: string | null };

function validPoint(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180 &&
    !(lat === 0 && lng === 0)
  );
}

const NUM = '(-?\\d{1,3}(?:\\.\\d{3,})?)';
/** Plain "lat, lng" in free text must carry decimals, otherwise "10, 20" would match. */
const NUMD = '(-?\\d{1,3}\\.\\d{3,})';

/** Coordinates written in text, a shared-location marker or a maps link. */
export function extractCoords(text: string): GeoPoint | null {
  const raw = String(text || '');
  if (!raw) return null;

  const patterns: RegExp[] = [
    new RegExp(`@${NUM},\\s*${NUM}`),
    new RegExp(`[?&](?:q|ll|query|destination)=${NUM}(?:,|%2C)\\s*${NUM}`, 'i'),
    new RegExp(`!3d${NUM}!4d${NUM}`),
    new RegExp(`ubicaci[oó]n[^\\d-]{0,40}${NUM}\\s*,\\s*${NUM}`, 'i'),
    new RegExp(`(?:^|[^\\d.])${NUMD}\\s*,\\s*${NUMD}(?:[^\\d]|$)`),
  ];
  for (const re of patterns) {
    const m = re.exec(raw);
    if (!m) continue;
    const lat = Number(m[1]);
    const lng = Number(m[2]);
    if (validPoint(lat, lng)) {
      const label = /\(([^)]{3,120})\)\s*$/.exec(raw)?.[1]?.trim() || null;
      return { lat, lng, label };
    }
  }
  return null;
}

/** Heuristic: does this text read like a street / sector description? */
export function looksLikeAddress(text: string): boolean {
  const t = String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  if (t.trim().length < 6) return false;
  return /\b(calle|avenida|av\.?|carrera|cra\.?|urbanizacion|urb\.?|sector|barrio|zona|centro comercial|c\.c\.?|cc|torre|edificio|edif\.?|residencias?|res\.?|esquina|via|km|plaza|conjunto|manzana|casa|piso|entre|frente a|cerca de|diagonal a|al lado de|detras de)\b/.test(
    t,
  );
}

function stripFiller(text: string): string {
  return String(text || '')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/\b(estoy|me encuentro|vivo|ubicad[oa]|mi direcci[oó]n( es)?|mi ubicaci[oó]n( es)?|queda|por)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function geocodeAddress(
  text: string,
  opts: { timeoutMs?: number; countryCodes?: string } = {},
): Promise<GeoPoint | null> {
  const q = stripFiller(text).slice(0, 180);
  if (q.length < 4) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 4_000);
  try {
    const url =
      'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&accept-language=es' +
      `&countrycodes=${encodeURIComponent(opts.countryCodes || 've,co')}` +
      `&q=${encodeURIComponent(q)}`;
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'elmenuxfa.com/1.0 (soporte@elmenuxfa.com)' },
    });
    if (!res.ok) return null;
    const rows = (await res.json()) as Array<{ lat?: string; lon?: string; display_name?: string }>;
    const hit = rows?.[0];
    if (!hit) return null;
    const lat = Number(hit.lat);
    const lng = Number(hit.lon);
    if (!validPoint(lat, lng)) return null;
    return { lat, lng, label: (hit.display_name || q).split(',').slice(0, 3).join(',').trim() };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
