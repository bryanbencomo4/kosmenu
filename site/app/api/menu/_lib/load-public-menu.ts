import {
  extractPublicCheckoutExchange,
  type PublicCheckoutExchangeConfig,
} from '../../_lib/checkout-exchange-config';
import {
  toPublicComercioDto,
  toPublicMetodosPagoDto,
} from '../../_lib/public-menu-dto';
import { getServiceSupabaseClient } from '../../_lib/supabase-server';
import {
  CircuitOpenError,
  isTransientSupabaseFailure,
  supabaseReadCircuit,
} from '../../_lib/supabase-circuit';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const MENU_FRESH_MS = 30_000;
const MENU_STALE_MS = 15 * 60_000;
const MARKET_RATES_TTL_MS = 60_000;
const OWNER_VERIFY_TTL_MS = 5 * 60_000;

const CATEGORIA_SELECT = 'id,comercio_id,nombre,orden,icono,opciones_menu';
const PRODUCTO_SELECT = [
  'id',
  'comercio_id',
  'categoria_id',
  'nombre',
  'descripcion',
  'precio',
  'imagen_url',
  'disponible',
  'upsell_badge',
  'precio_comparacion',
  'upsell_enabled',
  'orden',
  'opciones_menu',
].join(',');

type Cached<T> = { exp: number; value: T };
type MenuCacheEntry = {
  freshUntil: number;
  staleUntil: number;
  value: LoadedPublicMenu | null;
};

const menuCache = new Map<string, MenuCacheEntry>();
const ownerVerifiedCache = new Map<string, Cached<boolean>>();
let marketRatesCache: Cached<unknown> | null = null;

export function isMenuUuid(value: string) {
  return UUID_PATTERN.test(value);
}

type ProductoRow = {
  disponible?: boolean | null;
};

export type LoadedPublicMenu = {
  resolvedComercioId: string;
  ownerId: string;
  isOnline: boolean;
  comercioRow: Record<string, unknown>;
  comercio: ReturnType<typeof toPublicComercioDto>;
  categorias: unknown[];
  productos: unknown[];
  metodosPago: ReturnType<typeof toPublicMetodosPagoDto>;
  checkoutExchange: PublicCheckoutExchangeConfig;
  marketRates: unknown;
  upsellSettings: Record<string, unknown> | null;
  upsellRules: unknown[];
  bundles: unknown[];
};

const COMERCIO_COLUMNS = [
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
  'owner_id',
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
];

function comercioSelect(includeFullBranding: boolean) {
  return [
    ...COMERCIO_COLUMNS,
    includeFullBranding ? 'branding_ia' : 'branding_ia->config_negocio',
  ].join(',');
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

function slimMarketRates(row: Record<string, unknown> | null | undefined) {
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
      google_rates: payload.google_rates ?? row.google_rates ?? null,
      bcv_rates: payload.bcv_rates ?? row.bcv_rates ?? null,
    },
  };
}

async function loadMarketRates(
  supabase: ReturnType<typeof getServiceSupabaseClient>,
) {
  if (marketRatesCache && marketRatesCache.exp > Date.now()) {
    return marketRatesCache.value;
  }

  const slim = await supabase
    .from('global_market_rates')
    .select('bcv_rate, p2p_binance_rate, updated_at, payload->google_rates, payload->bcv_rates')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (slim.error) {
    const full = await supabase
      .from('global_market_rates')
      .select('bcv_rate, p2p_binance_rate, payload, updated_at')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (full.error) {
      throw new Error(full.error.message);
    }
    const value = slimMarketRates((full.data ?? null) as Record<string, unknown> | null);
    marketRatesCache = { exp: Date.now() + MARKET_RATES_TTL_MS, value };
    return value;
  }

  const value = slimMarketRates((slim.data ?? null) as Record<string, unknown> | null);
  marketRatesCache = { exp: Date.now() + MARKET_RATES_TTL_MS, value };
  return value;
}

async function loadComercioRow(
  supabase: ReturnType<typeof getServiceSupabaseClient>,
  comercioId: string,
) {
  const query = (select: string) => {
    const builder = supabase.from('comercios').select(select).limit(1);
    return isMenuUuid(comercioId)
      ? builder.eq('id', comercioId)
      : builder.eq('slug', comercioId);
  };

  const slim = await query(comercioSelect(false));
  if (!slim.error) {
    return ((slim.data ?? [])[0] ?? null) as unknown as Record<string, unknown> | null;
  }

  const full = await query(comercioSelect(true));
  if (full.error) {
    throw new Error(full.error.message);
  }
  return ((full.data ?? [])[0] ?? null) as unknown as Record<string, unknown> | null;
}

export async function isOwnerEmailVerified(
  supabase: ReturnType<typeof getServiceSupabaseClient>,
  ownerId: string,
) {
  const safeOwnerId = ownerId.trim();
  if (!safeOwnerId) {
    return false;
  }

  const cached = ownerVerifiedCache.get(safeOwnerId);
  if (cached && cached.exp > Date.now()) {
    return cached.value;
  }

  const { data, error } = await supabase.auth.admin.getUserById(safeOwnerId);
  if (error) {
    throw new Error(error.message);
  }

  const verified = Boolean(data.user?.email_confirmed_at);
  ownerVerifiedCache.set(safeOwnerId, {
    exp: Date.now() + OWNER_VERIFY_TTL_MS,
    value: verified,
  });
  return verified;
}

/**
 * Loads the same public menu DTO payload used by /api/menu/[id].
 * Callers decide whether to enforce en_linea / owner email gates.
 */
export async function loadPublicMenuByIdentifier(
  comercioId: string,
): Promise<LoadedPublicMenu | null> {
  const cacheKey = comercioId.trim().toLowerCase();
  const cached = menuCache.get(cacheKey);
  if (cached && cached.freshUntil > Date.now()) {
    return cached.value;
  }

  if (!supabaseReadCircuit.allow()) {
    if (cached && cached.staleUntil > Date.now()) {
      return cached.value;
    }
    throw new CircuitOpenError();
  }

  try {
    const loaded = await loadPublicMenuByIdentifierUncached(comercioId.trim());
    supabaseReadCircuit.recordSuccess();
    const now = Date.now();
    menuCache.set(cacheKey, {
      freshUntil: now + MENU_FRESH_MS,
      staleUntil: now + MENU_STALE_MS,
      value: loaded,
    });
    return loaded;
  } catch (error) {
    if (isTransientSupabaseFailure(error)) {
      supabaseReadCircuit.recordFailure();
      if (cached && cached.staleUntil > Date.now()) {
        return cached.value;
      }
    }
    throw error;
  }
}

async function loadPublicMenuByIdentifierUncached(
  comercioId: string,
): Promise<LoadedPublicMenu | null> {
  const supabase = getServiceSupabaseClient();
  const comercioRow = await loadComercioRow(supabase, comercioId);
  if (!comercioRow) {
    return null;
  }

  const resolvedComercioId = (comercioRow.id ?? '').toString();
  const ownerId = (comercioRow.owner_id ?? '').toString().trim();
  const isOnline = comercioRow.en_linea !== false;
  const comercio = toPublicComercioDto(comercioRow);
  const checkoutExchange = extractPublicCheckoutExchange(brandingForCheckout(comercioRow));

  const [
    categoriasResult,
    productosResult,
    metodosPagoResult,
    marketRates,
    upsellSettingsResult,
    upsellRulesResult,
    bundlesResult,
  ] = await Promise.all([
    supabase
      .from('categorias')
      .select(CATEGORIA_SELECT)
      .eq('comercio_id', resolvedComercioId)
      .order('orden', { ascending: true }),
    supabase
      .from('productos')
      .select(PRODUCTO_SELECT)
      .eq('comercio_id', resolvedComercioId)
      .order('nombre', { ascending: true }),
    supabase
      .from('metodos_pago')
      .select('id,comercio_id,nombre,tipo,descripcion,detalles')
      .eq('comercio_id', resolvedComercioId),
    loadMarketRates(supabase).catch(() => marketRatesCache?.value ?? null),
    supabase
      .from('upsell_settings')
      .select('*')
      .eq('comercio_id', resolvedComercioId)
      .maybeSingle(),
    supabase
      .from('upsell_rules')
      .select('*, upsell_rule_targets(*)')
      .eq('comercio_id', resolvedComercioId)
      .eq('enabled', true),
    supabase
      .from('bundles')
      .select('*, bundle_items(*)')
      .eq('comercio_id', resolvedComercioId)
      .eq('enabled', true),
  ]);

  if (categoriasResult.error) {
    throw new Error(categoriasResult.error.message);
  }
  if (productosResult.error) {
    throw new Error(productosResult.error.message);
  }
  if (metodosPagoResult.error) {
    throw new Error(metodosPagoResult.error.message);
  }

  const productos = ((productosResult.data ?? []) as ProductoRow[]).filter((producto) => {
    if (typeof producto?.disponible === 'boolean') {
      return producto.disponible;
    }
    return true;
  });

  return {
    resolvedComercioId,
    ownerId,
    isOnline,
    comercioRow,
    comercio,
    categorias: categoriasResult.data ?? [],
    productos,
    metodosPago: toPublicMetodosPagoDto(metodosPagoResult.data ?? []),
    checkoutExchange,
    marketRates,
    upsellSettings: upsellSettingsResult.error
      ? null
      : ((upsellSettingsResult.data ?? null) as Record<string, unknown> | null),
    upsellRules: upsellRulesResult.error ? [] : upsellRulesResult.data ?? [],
    bundles: bundlesResult.error ? [] : bundlesResult.data ?? [],
  };
}

export function toPublicMenuResponseBody(menu: LoadedPublicMenu) {
  return {
    ok: true,
    data: {
      comercio: menu.comercio,
      categorias: menu.categorias,
      productos: menu.productos,
      metodosPago: menu.metodosPago,
      checkoutExchange: menu.checkoutExchange,
      marketRates: menu.marketRates,
      upsellSettings: menu.upsellSettings,
      upsellRules: menu.upsellRules,
      bundles: menu.bundles,
    },
  };
}
