import 'server-only';

import { publicSiteUrl } from '../../_lib/public-site-config';
import {
  aggregateMoneyByCurrency,
  extractOrderMoney,
  formatAdminMoney,
  formatMoneyBreakdown,
  normalizeCurrencyCode,
  toFiniteNumberOrNull,
} from './admin-money';
import {
  listActiveAdminPlans,
  loadAdminAiCredits,
  loadAdminMembership,
  type AdminAiCreditsSummary,
  type AdminPlanOption,
} from './admin-business-ops';
import { selectWithMissingColumnFallback } from './admin-safe-query';
import { getAdminSupabaseClient } from './admin-supabase';

export type AdminBusinessRow = {
  id: string;
  nombre: string;
  slug: string;
  categoria: string | null;
  direccion: string | null;
  en_linea: boolean;
  mostrar_en_directorio_publico: boolean;
  promovido: boolean;
  negocio_virtual: boolean;
  updated_at: string | null;
  created_at: string | null;
  menuUrl: string;
  /** Total de pedidos del negocio (incluye archivados). */
  ordersTotal: number;
};

export type AdminBusinessSubscription = {
  id: string;
  status: string;
  planCode: string | null;
  planName: string | null;
  provider: string | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  gracePeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  userId: string | null;
};

export type AdminBusinessDetail = AdminBusinessRow & {
  whatsapp: string | null;
  moneda: string | null;
  exchangeRateMode: string | null;
  exchangeRateSource: string | null;
  exchangeRateValue: number | null;
  tasaCambioPesos: number | null;
  lastRateUpdate: string | null;
  permiteDelivery: boolean;
  recibePedidosWhatsapp: boolean;
  ownerUserId: string | null;
  ownerEmail: string | null;
  correo: string | null;
  logoUrl: string | null;
  subscription: AdminBusinessSubscription | null;
  plans: AdminPlanOption[];
  aiCredits: AdminAiCreditsSummary;
  stats: {
    productsActive: number;
    categoriesActive: number;
    orders7d: number;
    orders30d: number;
    revenue7dLabel: string;
    revenue30dLabel: string;
    currencyBuckets7d: Array<{ currency: string; amount: number; count: number; label: string }>;
  };
};

export type AdminBusinessProfilePatch = {
  promovido?: boolean;
  mostrar_en_directorio_publico?: boolean;
  en_linea?: boolean;
  nombre?: string;
  categoria?: string | null;
  direccion?: string | null;
  whatsapp?: string | null;
  moneda?: string | null;
  permite_delivery?: boolean;
  recibe_pedidos_whatsapp?: boolean;
  exchange_rate_value?: number | null;
  tasa_cambio_pesos?: number | null;
};

type RawComercio = {
  id?: string | null;
  nombre?: string | null;
  slug?: string | null;
  categoria?: string | null;
  direccion?: string | null;
  whatsapp?: string | null;
  moneda?: string | null;
  logo_url?: string | null;
  owner_id?: string | null;
  correo?: string | null;
  email?: string | null;
  en_linea?: boolean | null;
  mostrar_en_directorio_publico?: boolean | null;
  negocio_virtual?: boolean | null;
  permite_delivery?: boolean | null;
  recibe_pedidos_whatsapp?: boolean | null;
  exchange_rate_mode?: string | null;
  exchange_rate_source?: string | null;
  exchange_rate_value?: number | string | null;
  tasa_cambio_pesos?: number | string | null;
  last_rate_update?: string | null;
  branding_ia?: unknown;
  updated_at?: string | null;
  created_at?: string | null;
};

// Optional columns (correo/email) may be absent in production — safe-query strips them.
const DETAIL_SELECT =
  'id,nombre,slug,categoria,direccion,whatsapp,correo,email,moneda,logo_url,owner_id,en_linea,mostrar_en_directorio_publico,negocio_virtual,permite_delivery,recibe_pedidos_whatsapp,exchange_rate_mode,exchange_rate_source,exchange_rate_value,tasa_cambio_pesos,last_rate_update,branding_ia,updated_at,created_at';

function normalizeEmail(value: unknown): string | null {
  const text = asTrimmed(value)?.toLowerCase() ?? null;
  if (!text) return null;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text) ? text : null;
}

async function resolveOwnerEmail(
  supabase: ReturnType<typeof getAdminSupabaseClient>,
  ownerUserId: string | null,
  comercioCorreo: string | null,
): Promise<{ ownerEmail: string | null; correo: string | null }> {
  const correo = normalizeEmail(comercioCorreo);
  if (!ownerUserId) {
    return { ownerEmail: correo, correo };
  }

  try {
    const { data, error } = await supabase.auth.admin.getUserById(ownerUserId);
    if (error) {
      return { ownerEmail: correo, correo };
    }
    const authEmail = normalizeEmail(data.user?.email);
    return {
      ownerEmail: authEmail ?? correo,
      correo,
    };
  } catch {
    return { ownerEmail: correo, correo };
  }
}

const LIST_SELECT =
  'id,nombre,slug,categoria,direccion,en_linea,mostrar_en_directorio_publico,negocio_virtual,branding_ia,updated_at,created_at';

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function asTrimmed(value: unknown): string | null {
  if (value == null) return null;
  const text = String(value).trim();
  return text || null;
}

function menuUrlForSlug(slug: string) {
  const site = publicSiteUrl.replace(/\/$/, '');
  return `${site}/v/${encodeURIComponent(slug)}`;
}

export function readPromotedFromBranding(brandingIa: unknown): boolean {
  const branding = asRecord(brandingIa);
  const config = asRecord(branding.config_negocio);
  return config.destacado_directorio === true || config.promovido === true;
}

export function withPromotedFlag(brandingIa: unknown, promoted: boolean): Record<string, unknown> {
  const branding = { ...asRecord(brandingIa) };
  const config = { ...asRecord(branding.config_negocio) };
  config.destacado_directorio = promoted;
  // Keep legacy alias in sync so older readers stay consistent.
  config.promovido = promoted;
  branding.config_negocio = config;
  return branding;
}

function toAdminBusiness(row: RawComercio): AdminBusinessRow | null {
  const id = (row.id ?? '').toString().trim();
  const slug = (row.slug ?? '').toString().trim();
  const nombre = (row.nombre ?? '').toString().trim();
  if (!id || !slug || !nombre) return null;

  return {
    id,
    nombre,
    slug,
    categoria: (row.categoria ?? '').toString().trim() || null,
    direccion: (row.direccion ?? '').toString().trim() || null,
    en_linea: row.en_linea === true,
    mostrar_en_directorio_publico: row.mostrar_en_directorio_publico === true,
    promovido: readPromotedFromBranding(row.branding_ia),
    negocio_virtual: row.negocio_virtual === true,
    updated_at: row.updated_at ?? null,
    created_at: row.created_at ?? null,
    menuUrl: menuUrlForSlug(slug),
    ordersTotal: 0,
  };
}

async function loadOrderTotalsByBusiness(
  businessIds: string[],
): Promise<Map<string, number>> {
  const totals = new Map<string, number>();
  for (const id of businessIds) totals.set(id, 0);
  if (businessIds.length === 0) return totals;

  const supabase = getAdminSupabaseClient();
  const chunkSize = 40;
  for (let i = 0; i < businessIds.length; i += chunkSize) {
    const chunk = businessIds.slice(i, i + chunkSize);
    const results = await Promise.all(
      chunk.map(async (id) => {
        const { count, error } = await supabase
          .from('pedidos')
          .select('id', { count: 'exact', head: true })
          .eq('comercio_id', id)
          .is('archived_at', null);
        if (error) {
          console.error('[admin-businesses] order count', id, error.message);
          return { id, count: 0 };
        }
        return { id, count: count ?? 0 };
      }),
    );
    for (const row of results) {
      totals.set(row.id, row.count);
    }
  }
  return totals;
}

function normalizeOptionalText(value: string | null | undefined, max = 160) {
  if (value == null) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

function normalizeWhatsapp(value: string | null | undefined) {
  const trimmed = normalizeOptionalText(value, 40);
  if (!trimmed) return null;
  const cleaned = trimmed.replace(/[^\d+]/g, '');
  return cleaned.slice(0, 20) || null;
}

export async function listAdminBusinesses(options?: {
  query?: string;
  limit?: number;
}) {
  const supabase = getAdminSupabaseClient();
  const limit = Math.min(Math.max(options?.limit ?? 500, 1), 1000);
  const query = (options?.query ?? '').trim();

  const { data } = await selectWithMissingColumnFallback(
    async (select) => {
      let request = supabase
        .from('comercios')
        .select(select)
        .order('updated_at', { ascending: false })
        .limit(limit);

      if (query.length >= 2) {
        const safe = query.replace(/[%_,]/g, '').slice(0, 60);
        if (safe) {
          request = request.or(
            `nombre.ilike.%${safe}%,slug.ilike.%${safe}%,categoria.ilike.%${safe}%,direccion.ilike.%${safe}%`,
          );
        }
      }

      return request;
    },
    LIST_SELECT,
  );

  const businesses = ((data ?? []) as RawComercio[])
    .map(toAdminBusiness)
    .filter((row): row is AdminBusinessRow => row != null);

  try {
    const totals = await loadOrderTotalsByBusiness(businesses.map((row) => row.id));
    for (const row of businesses) {
      row.ordersTotal = totals.get(row.id) ?? 0;
    }
  } catch (error) {
    console.error('[admin-businesses] order totals failed', error);
  }

  return businesses;
}

export async function getAdminBusinessRaw(id: string) {
  const supabase = getAdminSupabaseClient();
  const { data } = await selectWithMissingColumnFallback(
    (select) =>
      supabase.from('comercios').select(select).eq('id', id).maybeSingle(),
    LIST_SELECT,
  );

  return (data as RawComercio | null) ?? null;
}

async function getAdminBusinessDetailRaw(id: string) {
  const supabase = getAdminSupabaseClient();
  const { data, stripped } = await selectWithMissingColumnFallback(
    (select) =>
      supabase.from('comercios').select(select).eq('id', id).maybeSingle(),
    DETAIL_SELECT,
  );

  if (stripped.length > 0) {
    console.warn(
      '[admin-businesses] stripped missing comercios columns:',
      stripped.join(', '),
    );
  }

  return (data as RawComercio | null) ?? null;
}

async function loadSubscription(businessId: string): Promise<AdminBusinessSubscription | null> {
  const membership = await loadAdminMembership(businessId);
  if (!membership) return null;
  return {
    id: membership.id,
    status: membership.status,
    planCode: membership.planCode,
    planName: membership.planName,
    provider: membership.provider,
    currentPeriodStart: membership.currentPeriodStart,
    currentPeriodEnd: membership.currentPeriodEnd,
    gracePeriodEnd: membership.gracePeriodEnd,
    cancelAtPeriodEnd: membership.cancelAtPeriodEnd,
    userId: membership.userId,
  };
}

export async function getAdminBusinessDetail(id: string): Promise<AdminBusinessDetail | null> {
  let raw: RawComercio | null;
  try {
    raw = await getAdminBusinessDetailRaw(id);
  } catch (error) {
    console.error('[admin-businesses] detail raw failed', error);
    throw error instanceof Error
      ? error
      : new Error('No se pudo cargar el negocio.');
  }

  const base = raw ? toAdminBusiness(raw) : null;
  if (!raw || !base) return null;

  const supabase = getAdminSupabaseClient();
  const now = Date.now();
  const start7 = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
  const start30 = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();

  const ownerUserId = asTrimmed(raw.owner_id);
  const [
    productsResult,
    categoriesResult,
    ordersResult,
    subscription,
    ownerContact,
    plans,
    aiCredits,
  ] = await Promise.all([
    supabase
      .from('productos')
      .select('id', { count: 'exact', head: true })
      .eq('comercio_id', id)
      .or('disponible.is.null,disponible.eq.true'),
    supabase
      .from('categorias')
      .select('id', { count: 'exact', head: true })
      .eq('comercio_id', id)
      .or('activo.is.null,activo.eq.true'),
    supabase
      .from('pedidos')
      .select('id,total,created_at,detalles')
      .eq('comercio_id', id)
      .gte('created_at', start30)
      .order('created_at', { ascending: false })
      .limit(500),
    loadSubscription(id),
    resolveOwnerEmail(
      supabase,
      ownerUserId,
      asTrimmed(raw.correo) ?? asTrimmed(raw.email),
    ),
    listActiveAdminPlans().catch((err) => {
      console.error('admin plans load', err);
      return [] as AdminPlanOption[];
    }),
    loadAdminAiCredits(id).catch((err) => {
      console.error('admin ai credits load', err);
      return {
        balance: 0,
        used: 0,
        updatedAt: null,
        recent: [],
      } satisfies AdminAiCreditsSummary;
    }),
  ]);

  if (productsResult.error) throw new Error(productsResult.error.message);
  if (categoriesResult.error) throw new Error(categoriesResult.error.message);
  if (ordersResult.error) throw new Error(ordersResult.error.message);

  const orderRows = (ordersResult.data ?? []) as Array<{
    id?: string | null;
    total?: number | string | null;
    created_at?: string | null;
    detalles?: unknown;
  }>;

  const money30 = orderRows.map((row) => extractOrderMoney(row));
  const money7 = orderRows
    .filter((row) => {
      const created = row.created_at ? new Date(row.created_at).getTime() : 0;
      return created >= new Date(start7).getTime();
    })
    .map((row) => extractOrderMoney(row));

  const buckets7d = aggregateMoneyByCurrency(money7).map((bucket) => ({
    ...bucket,
    label: formatAdminMoney(bucket.amount, bucket.currency),
  }));

  return {
    ...base,
    whatsapp: asTrimmed(raw.whatsapp),
    moneda: raw.moneda ? normalizeCurrencyCode(raw.moneda) : null,
    exchangeRateMode: asTrimmed(raw.exchange_rate_mode),
    exchangeRateSource: asTrimmed(raw.exchange_rate_source),
    exchangeRateValue: toFiniteNumberOrNull(raw.exchange_rate_value),
    tasaCambioPesos: toFiniteNumberOrNull(raw.tasa_cambio_pesos),
    lastRateUpdate: raw.last_rate_update ?? null,
    permiteDelivery: raw.permite_delivery === true,
    recibePedidosWhatsapp: raw.recibe_pedidos_whatsapp === true,
    ownerUserId,
    ownerEmail: ownerContact.ownerEmail,
    correo: ownerContact.correo,
    logoUrl: asTrimmed(raw.logo_url),
    subscription,
    plans,
    aiCredits,
    stats: {
      productsActive: productsResult.count ?? 0,
      categoriesActive: categoriesResult.count ?? 0,
      orders7d: money7.length,
      orders30d: money30.length,
      revenue7dLabel: formatMoneyBreakdown(money7),
      revenue30dLabel: formatMoneyBreakdown(money30),
      currencyBuckets7d: buckets7d,
    },
  };
}

export async function updateAdminBusiness(
  id: string,
  patch: AdminBusinessProfilePatch,
) {
  const current = await getAdminBusinessDetailRaw(id);
  if (!current?.id) {
    throw new Error('Negocio no encontrado.');
  }

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (typeof patch.mostrar_en_directorio_publico === 'boolean') {
    updates.mostrar_en_directorio_publico = patch.mostrar_en_directorio_publico;
  }
  if (typeof patch.en_linea === 'boolean') {
    updates.en_linea = patch.en_linea;
  }
  if (typeof patch.promovido === 'boolean') {
    updates.branding_ia = withPromotedFlag(current.branding_ia, patch.promovido);
  }
  if (typeof patch.permite_delivery === 'boolean') {
    updates.permite_delivery = patch.permite_delivery;
  }
  if (typeof patch.recibe_pedidos_whatsapp === 'boolean') {
    updates.recibe_pedidos_whatsapp = patch.recibe_pedidos_whatsapp;
  }
  if (patch.nombre !== undefined) {
    const nombre = normalizeOptionalText(patch.nombre, 120);
    if (!nombre) {
      throw new Error('El nombre del negocio no puede quedar vacio.');
    }
    updates.nombre = nombre;
  }
  if (patch.categoria !== undefined) {
    updates.categoria = normalizeOptionalText(patch.categoria, 80);
  }
  if (patch.direccion !== undefined) {
    updates.direccion = normalizeOptionalText(patch.direccion, 240);
  }
  if (patch.whatsapp !== undefined) {
    updates.whatsapp = normalizeWhatsapp(patch.whatsapp);
  }
  if (patch.moneda !== undefined) {
    const moneda = patch.moneda == null || !String(patch.moneda).trim()
      ? null
      : normalizeCurrencyCode(patch.moneda);
    if (moneda && !['USD', 'COP', 'VES'].includes(moneda)) {
      throw new Error('Moneda no permitida. Usa USD, COP o VES.');
    }
    updates.moneda = moneda;
  }
  if (patch.exchange_rate_value !== undefined) {
    if (patch.exchange_rate_value == null) {
      updates.exchange_rate_value = null;
    } else if (
      !Number.isFinite(patch.exchange_rate_value) ||
      patch.exchange_rate_value <= 0 ||
      patch.exchange_rate_value > 1_000_000
    ) {
      throw new Error('Tasa de cambio invalida.');
    } else {
      updates.exchange_rate_value = patch.exchange_rate_value;
      updates.last_rate_update = new Date().toISOString();
    }
  }
  if (patch.tasa_cambio_pesos !== undefined) {
    if (patch.tasa_cambio_pesos == null) {
      updates.tasa_cambio_pesos = null;
    } else if (
      !Number.isFinite(patch.tasa_cambio_pesos) ||
      patch.tasa_cambio_pesos <= 0 ||
      patch.tasa_cambio_pesos > 1_000_000
    ) {
      throw new Error('Tasa COP invalida.');
    } else {
      updates.tasa_cambio_pesos = patch.tasa_cambio_pesos;
      updates.last_rate_update = new Date().toISOString();
    }
  }

  const mutableKeys = Object.keys(updates).filter((key) => key !== 'updated_at');
  if (mutableKeys.length === 0) {
    throw new Error('Indica al menos un campo para actualizar.');
  }

  const supabase = getAdminSupabaseClient();
  // Never combine update + select-with-fallback: a missing column after a
  // successful write would retry the update. Write once, then re-read safely.
  const { error } = await supabase.from('comercios').update(updates).eq('id', id);
  if (error) {
    throw new Error(error.message);
  }

  const refreshed = await getAdminBusinessDetailRaw(id);
  const mapped = toAdminBusiness(refreshed ?? current);
  if (!mapped) {
    throw new Error('No se pudo actualizar el negocio.');
  }
  return mapped;
}
