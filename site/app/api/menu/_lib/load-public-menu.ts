import {
  toPublicComercioDto,
  toPublicMetodosPagoDto,
} from '../../_lib/public-menu-dto';
import { getServiceSupabaseClient } from '../../_lib/supabase-server';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
  marketRates: unknown;
};

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
].join(',');

export async function isOwnerEmailVerified(
  supabase: ReturnType<typeof getServiceSupabaseClient>,
  ownerId: string,
) {
  const safeOwnerId = ownerId.trim();
  if (!safeOwnerId) {
    return false;
  }

  const { data, error } = await supabase.auth.admin.getUserById(safeOwnerId);
  if (error) {
    throw new Error(error.message);
  }

  return Boolean(data.user?.email_confirmed_at);
}

/**
 * Loads the same public menu DTO payload used by /api/menu/[id].
 * Callers decide whether to enforce en_linea / owner email gates.
 */
export async function loadPublicMenuByIdentifier(
  comercioId: string,
): Promise<LoadedPublicMenu | null> {
  const supabase = getServiceSupabaseClient();

  const comercioQuery = supabase.from('comercios').select(COMERCIO_SELECT).limit(1);
  const { data: comercios, error: comercioError } = isMenuUuid(comercioId)
    ? await comercioQuery.eq('id', comercioId)
    : await comercioQuery.eq('slug', comercioId);

  if (comercioError) {
    throw new Error(comercioError.message);
  }

  const comercioRow = ((comercios ?? [])[0] ?? null) as unknown as Record<
    string,
    unknown
  > | null;
  if (!comercioRow) {
    return null;
  }

  const resolvedComercioId = (comercioRow.id ?? '').toString();
  const ownerId = (comercioRow.owner_id ?? '').toString().trim();
  const isOnline = comercioRow.en_linea !== false;
  const comercio = toPublicComercioDto(comercioRow);

  const [categoriasResult, productosResult, metodosPagoResult, marketRatesResult] =
    await Promise.all([
      supabase
        .from('categorias')
        .select('*')
        .eq('comercio_id', resolvedComercioId)
        .order('orden', { ascending: true }),
      supabase
        .from('productos')
        .select('*')
        .eq('comercio_id', resolvedComercioId)
        .order('nombre', { ascending: true }),
      supabase
        .from('metodos_pago')
        .select('id,comercio_id,nombre,tipo,descripcion,detalles')
        .eq('comercio_id', resolvedComercioId),
      supabase
        .from('global_market_rates')
        .select('bcv_rate, p2p_binance_rate, payload, updated_at')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
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
  if (marketRatesResult.error) {
    throw new Error(marketRatesResult.error.message);
  }

  const productos = (productosResult.data ?? []).filter((producto: ProductoRow) => {
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
    marketRates: marketRatesResult.data ?? null,
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
      marketRates: menu.marketRates,
    },
  };
}
