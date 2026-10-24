import {
  ZOOM_OFFICES_FALLBACK,
  type ZoomOffice,
} from './zoom-offices-fallback';

export type { ZoomOffice };

type CacheEntry = {
  fetchedAt: number;
  offices: ZoomOffice[];
  source: 'live' | 'fallback';
};

const CACHE_TTL_MS = 12 * 60 * 60 * 1000;
let cache: CacheEntry | null = null;

function text(value: unknown) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseCoord(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const n = Number(String(value ?? '').trim());
  return Number.isFinite(n) ? n : undefined;
}

function parseStoresPayload(payload: unknown): ZoomOffice[] {
  const rows = Array.isArray(payload)
    ? payload
    : payload && typeof payload === 'object' && Array.isArray((payload as { data?: unknown }).data)
      ? ((payload as { data: unknown[] }).data)
      : payload && typeof payload === 'object' && Array.isArray((payload as { stores?: unknown }).stores)
        ? ((payload as { stores: unknown[] }).stores)
        : [];

  const out: ZoomOffice[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    const props =
      r.props_ && typeof r.props_ === 'object'
        ? (r.props_ as Record<string, unknown>)
        : r;

    const title = text(props.title ?? props.name ?? r.title ?? r.name);
    if (!title) continue;

    const ciudad = text(props.city ?? props.ciudad ?? r.city ?? r.ciudad);
    // Zoom ASL often has state: null — keep ciudad for filtering/shipping.
    const estadoRaw = text(
      props.state ?? props.estado ?? props.region ?? r.state ?? r.estado,
    );
    const estado = estadoRaw || ciudad;
    const address = text(
      props.street ?? props.address ?? props.direccion ?? r.street ?? r.address ?? title,
    );
    const phone = text(props.phone ?? props.telefono ?? r.phone) || undefined;
    const id = text(r.id ?? props.id ?? `${title}-${ciudad}-${estado}`) || title;
    const lat = parseCoord(props.lat ?? props.latitude ?? r.lat ?? r.latitude);
    const lng = parseCoord(
      props.lng ?? props.lon ?? props.longitude ?? r.lng ?? r.lon ?? r.longitude,
    );

    const key = `${title}|${ciudad}|${estado}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    out.push({ id, title, estado, ciudad, address, phone, lat, lng });
  }

  out.sort((a, b) => {
    const ea = a.estado.localeCompare(b.estado, 'es');
    if (ea !== 0) return ea;
    const ca = a.ciudad.localeCompare(b.ciudad, 'es');
    if (ca !== 0) return ca;
    return a.title.localeCompare(b.title, 'es');
  });

  return out;
}

function cookieValue(setCookieHeaders: string[], name: string) {
  for (const header of setCookieHeaders) {
    const match = header.match(new RegExp(`(?:^|,\\s*)${name}=([^;]+)`));
    if (match?.[1]) return decodeURIComponent(match[1]);
  }
  return '';
}

async function scrapeLiveZoomOffices(): Promise<ZoomOffice[]> {
  const pageRes = await fetch('https://zoom.red/consulta-de-oficinas-personas/', {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (compatible; elmenuxfa-kit/1.0; +https://elmenuxfa.com)',
      Accept: 'text/html,application/xhtml+xml',
    },
    signal: AbortSignal.timeout(20_000),
    cache: 'no-store',
  });
  if (!pageRes.ok) {
    throw new Error(`zoom_page_${pageRes.status}`);
  }

  const html = await pageRes.text();
  const setCookies = pageRes.headers.getSetCookie?.() ?? [];
  const xsrf =
    cookieValue(setCookies, 'wp_xsrf_token') ||
    cookieValue(
      [...pageRes.headers].filter(([k]) => k.toLowerCase() === 'set-cookie').map(([, v]) => v),
      'wp_xsrf_token',
    );

  const aslMatch = html.match(
    /ASL_REMOTE\s*=\s*\{[^}]*"nonce"\s*:\s*"([^"]+)"/,
  );
  const aslNonce = aslMatch?.[1] ?? '';
  const csrfField =
    html.match(/name="_csrf_token"\s+value="([^"]+)"/)?.[1] ?? xsrf;

  if (!aslNonce) {
    throw new Error('zoom_nonce_missing');
  }

  const cookieHeader = [
    xsrf ? `wp_xsrf_token=${encodeURIComponent(xsrf)}` : '',
  ]
    .filter(Boolean)
    .join('; ');

  const qs = new URLSearchParams({
    action: 'asl_load_stores',
    nonce: aslNonce,
    load_all: '1',
    layout: '0',
    _csrf_token: csrfField || xsrf,
  });

  const storesRes = await fetch(
    `https://zoom.red/wp-admin/admin-ajax.php?${qs.toString()}`,
    {
      method: 'GET',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (compatible; elmenuxfa-kit/1.0; +https://elmenuxfa.com)',
        Accept: 'application/json,text/javascript,*/*',
        Referer: 'https://zoom.red/consulta-de-oficinas-personas/',
        'X-Requested-With': 'XMLHttpRequest',
        ...(csrfField || xsrf
          ? { 'X-CSRF-Token': csrfField || xsrf }
          : {}),
        ...(cookieHeader ? { Cookie: cookieHeader } : {}),
      },
      signal: AbortSignal.timeout(25_000),
      cache: 'no-store',
    },
  );

  if (!storesRes.ok) {
    throw new Error(`zoom_stores_${storesRes.status}`);
  }

  const rawText = await storesRes.text();
  let payload: unknown = [];
  try {
    payload = JSON.parse(rawText);
  } catch {
    throw new Error('zoom_stores_invalid_json');
  }

  const offices = parseStoresPayload(payload);
  if (offices.length < 5) {
    throw new Error(`zoom_stores_too_few_${offices.length}`);
  }
  return offices;
}

export async function getZoomOffices(options?: {
  forceRefresh?: boolean;
}): Promise<{
  offices: ZoomOffice[];
  source: 'live' | 'fallback' | 'cache';
  manualFallback: true;
  fetchedAt: string;
  warning?: string;
}> {
  const now = Date.now();
  if (
    !options?.forceRefresh &&
    cache &&
    now - cache.fetchedAt < CACHE_TTL_MS &&
    cache.offices.length > 0
  ) {
    return {
      offices: cache.offices,
      source: cache.source === 'live' ? 'cache' : 'fallback',
      manualFallback: true,
      fetchedAt: new Date(cache.fetchedAt).toISOString(),
    };
  }

  try {
    const offices = await scrapeLiveZoomOffices();
    cache = { fetchedAt: now, offices, source: 'live' };
    return {
      offices,
      source: 'live',
      manualFallback: true,
      fetchedAt: new Date(now).toISOString(),
    };
  } catch (error) {
    const warning =
      error instanceof Error ? error.message : 'zoom_scrape_failed';
    cache = {
      fetchedAt: now,
      offices: ZOOM_OFFICES_FALLBACK,
      source: 'fallback',
    };
    return {
      offices: ZOOM_OFFICES_FALLBACK,
      source: 'fallback',
      manualFallback: true,
      fetchedAt: new Date(now).toISOString(),
      warning,
    };
  }
}
