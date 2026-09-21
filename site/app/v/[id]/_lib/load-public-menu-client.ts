import { extractPublicCheckoutExchange } from '../../../api/_lib/checkout-exchange-config';
import { toPublicComercioDto, toPublicMetodosPagoDto } from '../../../api/_lib/public-menu-dto';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const COMERCIO_SELECT = [
  'id',
  'slug',
  'nombre',
  'logo_url',
  'whatsapp',
  'direccion',
  'latitud',
  'longitud',
  'permite_delivery',
  'recibe_pedidos_whatsapp',
  'en_linea',
  'menu_palette',
  'menu_palette_primary',
  'menu_palette_accent',
  'menu_palette_surface',
  'menu_palette_text',
  'menu_theme_mode',
  'color_principal',
  'menu_layout',
  'menu_footer',
  'moneda',
  'tasa_cambio_pesos',
  'exchange_rate_value',
  'exchange_rate_mode',
  'exchange_rate_source',
  'exchange_rate_quote_currency',
  'horarios',
  'branding_ia->config_negocio',
].join(',');

const CATEGORIA_SELECT = 'id,comercio_id,nombre,orden,icono,opciones_menu';
const PRODUCTO_SELECT =
  'id,comercio_id,categoria_id,nombre,descripcion,precio,imagen_url,disponible,upsell_badge,precio_comparacion,upsell_enabled,orden,opciones_menu';
const STALE_MENU_PREFIX = 'elmenuxfa:menu-stale:';
const STALE_MENU_TTL_MS = 6 * 60 * 60 * 1000;

function restUrl(path: string) {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, '');
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!base || !key) {
    throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL y/o NEXT_PUBLIC_SUPABASE_ANON_KEY.');
  }
  return {
    url: `${base}/rest/v1/${path}`,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Accept: 'application/json',
    },
  };
}

async function restJson<T>(path: string): Promise<T> {
  const { url, headers } = restUrl(path);
  const response = await fetch(url, {
    headers,
    cache: 'no-store',
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok) {
    throw new Error(`supabase rest ${response.status}`);
  }
  return (await response.json()) as T;
}

function brandingForCheckout(row: Record<string, unknown>) {
  if (row.branding_ia && typeof row.branding_ia === 'object') {
    return row.branding_ia;
  }
  if (row.config_negocio != null) {
    return { config_negocio: row.config_negocio };
  }
  return null;
}

function slimMarketRates(row: Record<string, unknown> | null) {
  if (!row) return null;
  const payload =
    row.payload && typeof row.payload === 'object'
      ? (row.payload as Record<string, unknown>)
      : {};
  return {
    bcv_rate: row.bcv_rate ?? null,
    p2p_binance_rate: row.p2p_binance_rate ?? null,
    updated_at: row.updated_at ?? null,
    payload: {
      google_rates: payload.google_rates ?? null,
      bcv_rates: payload.bcv_rates ?? null,
    },
  };
}

/**
 * Public menu via anon REST. Used when Vercel cannot reach Supabase
 * but the diner's browser can.
 */
export async function loadPublicMenuFromBrowser(comercioId: string) {
  const identifier = comercioId.trim();
  const filter = UUID_PATTERN.test(identifier)
    ? `id=eq.${encodeURIComponent(identifier)}`
    : `slug=eq.${encodeURIComponent(identifier)}`;

  const comercios = await restJson<Record<string, unknown>[]>(
    `comercios?${filter}&select=${COMERCIO_SELECT}&limit=1`,
  );
  const comercioRow = comercios[0];
  if (!comercioRow) {
    const error = new Error('Comercio not found.');
    (error as Error & { status?: number }).status = 404;
    throw error;
  }
  if (comercioRow.en_linea === false) {
    const error = new Error('El menu esta temporalmente en mantenimiento.');
    (error as Error & { status?: number; code?: string }).status = 403;
    (error as Error & { code?: string }).code = 'MENU_DRAFT_MODE';
    throw error;
  }

  const resolvedId = String(comercioRow.id ?? '');
  const [
    categorias,
    productosRaw,
    metodosPagoRaw,
    marketRatesRaw,
    upsellSettings,
    upsellRules,
    bundles,
  ] = await Promise.all([
    restJson<unknown[]>(
      `categorias?comercio_id=eq.${resolvedId}&select=${CATEGORIA_SELECT}&order=orden.asc`,
    ).catch(() => []),
    restJson<Array<{ disponible?: boolean | null }>>(
      `productos?comercio_id=eq.${resolvedId}&select=${PRODUCTO_SELECT}&order=nombre.asc`,
    ).catch(() => []),
    restJson<unknown[]>(
      `metodos_pago?comercio_id=eq.${resolvedId}&select=id,comercio_id,nombre,tipo,descripcion,detalles`,
    ).catch(() => []),
    restJson<Record<string, unknown>[]>(
      `global_market_rates?select=bcv_rate,p2p_binance_rate,payload,updated_at&order=updated_at.desc&limit=1`,
    ).catch(() => []),
    restJson<Record<string, unknown>[]>(
      `upsell_settings?comercio_id=eq.${resolvedId}&select=*&limit=1`,
    ).catch(() => []),
    restJson<unknown[]>(
      `upsell_rules?comercio_id=eq.${resolvedId}&enabled=eq.true&select=*,upsell_rule_targets(*)`,
    ).catch(() => []),
    restJson<unknown[]>(
      `bundles?comercio_id=eq.${resolvedId}&enabled=eq.true&select=*,bundle_items(*)`,
    ).catch(() => []),
  ]);

  const productos = productosRaw.filter((producto) => {
    if (typeof producto?.disponible === 'boolean') return producto.disponible;
    return true;
  });

  return {
    ok: true as const,
    data: {
      comercio: toPublicComercioDto(comercioRow),
      categorias,
      productos,
      metodosPago: toPublicMetodosPagoDto(metodosPagoRaw),
      checkoutExchange: extractPublicCheckoutExchange(brandingForCheckout(comercioRow)),
      marketRates: slimMarketRates(marketRatesRaw[0] ?? null),
      upsellSettings: upsellSettings[0] ?? null,
      upsellRules,
      bundles,
    },
  };
}

export function shouldFallbackToBrowserMenu(status: number) {
  return status >= 500 || status === 408 || status === 429;
}

export function readStalePublicMenu<T = unknown>(comercioId: string): T | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(`${STALE_MENU_PREFIX}${comercioId.trim().toLowerCase()}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { exp?: number; data?: T };
    if (!parsed?.data || typeof parsed.exp !== 'number' || parsed.exp < Date.now()) {
      return null;
    }
    return parsed.data;
  } catch {
    return null;
  }
}

export function writeStalePublicMenu(comercioId: string, data: unknown) {
  if (typeof window === 'undefined' || !data) return;
  try {
    window.localStorage.setItem(
      `${STALE_MENU_PREFIX}${comercioId.trim().toLowerCase()}`,
      JSON.stringify({ exp: Date.now() + STALE_MENU_TTL_MS, data }),
    );
  } catch {
    // Quota or private mode — ignore.
  }
}
