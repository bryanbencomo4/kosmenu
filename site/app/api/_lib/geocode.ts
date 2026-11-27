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

const NOT_A_PLACE_WORDS = new Set([
  'hola', 'holaa', 'holaaa', 'holi', 'holis', 'hols', 'holss', 'hello', 'hey', 'ey', 'buenas', 'buenos', 'buen',
  'dias', 'tardes', 'noches', 'dia', 'tarde', 'noche', 'ok', 'okey', 'oka', 'vale', 'dale', 'listo', 'bueno',
  'gracias', 'grax', 'si', 'sii', 'no', 'nop', 'nada', 'aja', 'ajam', 'mmm', 'hmm', 'ya', 'wao', 'wow', 'jaja',
  'jajaja', 'jeje', 'test', 'prueba', 'probando', 'audio', 'nota', 'voz', 'mensaje', 'que', 'tal', 'como', 'estas',
  'esta', 'estan', 'quiero', 'busco', 'dime', 'mejor', 'ayuda', 'ayudame', 'gracias', 'por', 'favor', 'porfa',
  'la', 'el', 'lo', 'un', 'una', 'de', 'y', 'a', 'me', 'mi', 'tu', 'es', 'eso', 'esto', 'aqui', 'ahi', 'alli',
]);

/**
 * Is this plausibly the answer to "where are you?" — a street, sector, landmark or city —
 * and not a greeting, a filler word or a mis-transcribed voice note? Geocoding anything else
 * makes the geocoder invent a place (a "Holss" street in another country) and the person then
 * gets restaurants hundreds of km away. Addresses with street words always pass.
 */
export function looksLikePlaceAnswer(text: string): boolean {
  const t = String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (t.length < 4) return false;
  if (looksLikeAddress(t)) return true;
  const tokens = t.split(' ').filter(Boolean);
  const meaningful = tokens.filter((w) => !NOT_A_PLACE_WORDS.has(w) && !/^(.)\1{2,}$/.test(w));
  if (meaningful.length === 0) return false;
  // A single short word is far more often a greeting / noise than a sector name.
  if (tokens.length === 1 && meaningful[0]!.length < 5) return false;
  return true;
}

function stripFiller(text: string): string {
  return String(text || '')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/\b(estoy|me encuentro|vivo|ubicad[oa]|mi direcci[oó]n( es)?|mi ubicaci[oó]n( es)?|queda|por)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const COLOMBIA_HINT =
  /\b(colombia|cucuta|bogota|medellin|cali|barranquilla|bucaramanga|santa marta|riohacha|maicao|arauca|cartagena|palomino)\b/;

/**
 * The directory is Venezuelan: look in Venezuela first. Colombia is only searched when the text
 * itself points there, otherwise a vague word lands on a Colombian street 400+ km from every
 * restaurant.
 */
export async function geocodeAddress(
  text: string,
  opts: { timeoutMs?: number; countryCodes?: string } = {},
): Promise<GeoPoint | null> {
  if (opts.countryCodes) return geocodeOnce(text, opts.timeoutMs, opts.countryCodes);
  const inVe = await geocodeOnce(text, opts.timeoutMs, 've');
  if (inVe) return inVe;
  const folded = String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  return COLOMBIA_HINT.test(folded) ? geocodeOnce(text, opts.timeoutMs, 'co') : null;
}

async function geocodeOnce(
  text: string,
  timeoutMs: number | undefined,
  countryCodes: string,
): Promise<GeoPoint | null> {
  const q = stripFiller(text).slice(0, 180);
  if (q.length < 4) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs ?? 4_000);
  try {
    const url =
      'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&accept-language=es' +
      `&countrycodes=${encodeURIComponent(countryCodes)}` +
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
