import 'server-only';

import type { CurrentAdmin } from './admin-auth';
import { getAdminSupabaseClient } from './admin-supabase';

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKDAY_LABELS = ['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab'] as const;
const ORDER_OPEN_STATUSES = new Set(['pendiente', 'confirmado', 'preparando', 'en_camino']);

type KpiTone = 'violet' | 'indigo' | 'emerald' | 'amber' | 'rose' | 'slate';
type ActivityTone = 'success' | 'warning' | 'danger' | 'info';

type DashboardOrderMetricRow = {
  id: string;
  comercio_id?: string | null;
  estado?: string | null;
  total?: number | string | null;
  created_at?: string | null;
};

type DashboardRecentOrderRow = DashboardOrderMetricRow & {
  nombre_cliente?: string | null;
  detalles?: {
    order_id?: string | null;
    [key: string]: unknown;
  } | null;
};

type DashboardCommerceRow = {
  id: string;
  nombre?: string | null;
  categoria?: string | null;
  direccion?: string | null;
  en_linea?: boolean | null;
  updated_at?: string | null;
  permite_delivery?: boolean | null;
  recibe_pedidos_whatsapp?: boolean | null;
};

type DashboardProductRow = {
  id: string;
  comercio_id?: string | null;
};

type DashboardAuditRow = {
  id: string;
  actor_email?: string | null;
  action: string;
  entity_type?: string | null;
  entity_id?: string | null;
  created_at?: string | null;
};

type RecentActivityEntry = {
  title: string;
  description: string;
  time: string;
  tone: ActivityTone;
};

export type AdminDashboardData = {
  heroBadge: string;
  heroDescription: string;
  coverageLabel: string;
  coverageHint: string;
  kpis: Array<{
    title: string;
    value: string;
    delta: string;
    hint: string;
    tone: KpiTone;
  }>;
  chartData: Array<{
    label: string;
    orders: number;
    revenue: number;
  }>;
  deliveryOverview: {
    badge: string;
    title: string;
    description: string;
    progressLabel: string;
    progressValue: number;
    stats: Array<{
      label: string;
      value: string;
    }>;
  };
  featuredBusinesses: Array<{
    id: string;
    name: string;
    location: string;
    category: string;
    channel: string;
    orders: number;
    catalogSize: number;
  }>;
  businessesUpdatedLabel: string;
  recentOrders: Array<{
    code: string;
    business: string;
    customer: string;
    amount: number;
    status: string;
    statusTone: ActivityTone;
    createdLabel: string;
  }>;
  recentOrdersBadge: string;
  moduleSnapshots: Array<{
    id: string;
    label: string;
    value: string;
    description: string;
  }>;
  segmentCards: Array<{
    id: string;
    label: string;
    value: string;
    description: string;
    tone: 'violet' | 'emerald' | 'amber';
  }>;
  recentActivity: RecentActivityEntry[];
};

const currencyFormatter = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
});

function startOfDay(date: Date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * DAY_MS);
}

function toIso(value: Date) {
  return value.toISOString();
}

function parseDate(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function toTimestamp(value: string | null | undefined) {
  return parseDate(value)?.getTime() ?? 0;
}

function toNumber(value: number | string | null | undefined) {
  const parsed = typeof value === 'number' ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function clampPercentage(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(100, Math.max(0, Math.round(value)));
}

function percentage(numerator: number, denominator: number) {
  if (denominator <= 0) {
    return 0;
  }

  return clampPercentage((numerator / denominator) * 100);
}

function formatRelativeTime(value: string | null | undefined, now: Date) {
  const date = parseDate(value);

  if (!date) {
    return 'Hace instantes';
  }

  const diffMs = Math.max(0, now.getTime() - date.getTime());
  const diffMinutes = Math.floor(diffMs / 60000);

  if (diffMinutes < 1) {
    return 'Hace instantes';
  }

  if (diffMinutes < 60) {
    return `Hace ${diffMinutes} min`;
  }

  const diffHours = Math.floor(diffMinutes / 60);

  if (diffHours < 24) {
    return `Hace ${diffHours} h`;
  }

  const diffDays = Math.floor(diffHours / 24);
  return `Hace ${diffDays} d`;
}

function formatDelta(current: number, previous: number, suffix: string) {
  if (current === 0 && previous === 0) {
    return `Sin movimiento ${suffix}`;
  }

  if (previous === 0) {
    return `Arranque ${suffix}`;
  }

  const delta = ((current - previous) / Math.abs(previous)) * 100;
  const sign = delta >= 0 ? '+' : '';
  return `${sign}${delta.toFixed(1)}% ${suffix}`;
}

function normalizeOrderStatus(value: string | null | undefined) {
  const normalized = (value ?? '').trim().toLowerCase();

  if (!normalized) {
    return 'pendiente';
  }

  if (normalized === 'rechazado' || normalized === 'anulado') {
    return 'cancelado';
  }

  return normalized;
}

function formatOrderStatus(status: string) {
  return status
    .replace(/_/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function orderTone(status: string): ActivityTone {
  if (status === 'entregado') {
    return 'success';
  }

  if (status === 'cancelado') {
    return 'danger';
  }

  if (status === 'pendiente') {
    return 'warning';
  }

  return 'info';
}

function getDayKey(value: string | null | undefined) {
  const parsed = parseDate(value);

  if (!parsed) {
    return '';
  }

  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
}

function formatOrderCode(row: DashboardRecentOrderRow) {
  const orderId = row.detalles?.order_id?.toString().trim();

  if (orderId) {
    return orderId.startsWith('#') ? orderId : `#${orderId}`;
  }

  const fallback = row.id?.slice(0, 8).toUpperCase() ?? 'PEDIDO';
  return `#${fallback}`;
}

function shortLocation(value: string | null | undefined) {
  const normalized = (value ?? '').trim();

  if (!normalized) {
    return 'Sin ubicacion visible';
  }

  return normalized.split(',')[0]?.trim() || normalized;
}

function businessChannelLabel(commerce: DashboardCommerceRow) {
  if (commerce.permite_delivery && commerce.recibe_pedidos_whatsapp) {
    return 'Delivery + WhatsApp';
  }

  if (commerce.permite_delivery) {
    return 'Delivery';
  }

  if (commerce.recibe_pedidos_whatsapp) {
    return 'WhatsApp';
  }

  return 'Checkout';
}

function describeAuditEntry(row: DashboardAuditRow, now: Date): RecentActivityEntry {
  const actor = row.actor_email?.trim() || 'Admin';

  switch (row.action) {
    case 'admin.login_success':
      return {
        title: 'Login admin exitoso',
        description: `${actor} inicio sesion correctamente.`,
        time: formatRelativeTime(row.created_at, now),
        tone: 'success',
      };
    case 'admin.logout':
      return {
        title: 'Sesion cerrada',
        description: `${actor} finalizo su sesion en el panel.`,
        time: formatRelativeTime(row.created_at, now),
        tone: 'info',
      };
    case 'admin.login_denied':
      return {
        title: 'Intento de login denegado',
        description: `${actor} no supero la validacion de acceso.`,
        time: formatRelativeTime(row.created_at, now),
        tone: 'danger',
      };
    case 'admin.unauthorized_access':
      return {
        title: 'Acceso sin permiso bloqueado',
        description: `${actor} intento abrir un recurso restringido.`,
        time: formatRelativeTime(row.created_at, now),
        tone: 'warning',
      };
    case 'admin.password_recovery_requested':
      return {
        title: 'Recovery solicitado',
        description: `${actor} pidio restablecer su clave admin.`,
        time: formatRelativeTime(row.created_at, now),
        tone: 'info',
      };
    case 'admin.password_reset_success':
      return {
        title: 'Clave admin actualizada',
        description: `${actor} completo el reset de password.`,
        time: formatRelativeTime(row.created_at, now),
        tone: 'success',
      };
    case 'admin.password_recovery_denied':
      return {
        title: 'Recovery admin rechazado',
        description: `${actor} no coincide con un admin activo.`,
        time: formatRelativeTime(row.created_at, now),
        tone: 'warning',
      };
    default:
      return {
        title: row.action.replace(/^admin\./, '').replace(/_/g, ' '),
        description: row.entity_type
          ? `${actor} registro una accion sobre ${row.entity_type}.`
          : `${actor} genero actividad en el panel.`,
        time: formatRelativeTime(row.created_at, now),
        tone: 'info',
      };
  }
}

function rowsOrThrow<T>(label: string, result: { data: T[] | null; error: { message: string } | null }) {
  if (result.error) {
    throw new Error(`[admin-dashboard] ${label}: ${result.error.message}`);
  }

  return result.data ?? [];
}

function countOrThrow(label: string, result: { count: number | null; error: { message: string } | null }) {
  if (result.error) {
    throw new Error(`[admin-dashboard] ${label}: ${result.error.message}`);
  }

  return result.count ?? 0;
}

export async function getAdminDashboardData(admin: CurrentAdmin): Promise<AdminDashboardData> {
  const supabase = getAdminSupabaseClient();
  const now = new Date();
  const last24hStart = new Date(now.getTime() - DAY_MS);
  const todayStart = startOfDay(now);
  const yesterdayStart = addDays(todayStart, -1);
  const current7Start = addDays(todayStart, -6);
  const previous7Start = addDays(current7Start, -7);
  const hasAuditAccess = admin.permissions.includes('audit.read') || admin.permissions.includes('security.read');

  const [
    activeBusinessesResult,
    totalBusinessesResult,
    deliveryBusinessesResult,
    whatsappBusinessesResult,
    updatedBusinessesResult,
    activeProductsResult,
    activeCategoriesResult,
    activeAdminsResult,
    activeCouriersResult,
    pendingInvitesResult,
    inRouteInvitesResult,
    createdInvites7dResult,
    completedInvites7dResult,
    orderMetricsResult,
    recentOrdersResult,
    featuredBusinessesResult,
  ] = await Promise.all([
    supabase.from('comercios').select('id', { count: 'exact', head: true }).eq('en_linea', true),
    supabase.from('comercios').select('id', { count: 'exact', head: true }),
    supabase.from('comercios').select('id', { count: 'exact', head: true }).eq('en_linea', true).eq('permite_delivery', true),
    supabase
      .from('comercios')
      .select('id', { count: 'exact', head: true })
      .eq('en_linea', true)
      .eq('recibe_pedidos_whatsapp', true),
    supabase.from('comercios').select('id', { count: 'exact', head: true }).eq('en_linea', true).gte('updated_at', toIso(last24hStart)),
    supabase
      .from('productos')
      .select('id', { count: 'exact', head: true })
      .or('disponible.is.null,disponible.eq.true'),
    supabase
      .from('categorias')
      .select('id', { count: 'exact', head: true })
      .or('activo.is.null,activo.eq.true'),
    supabase.from('admin_users').select('id', { count: 'exact', head: true }).eq('is_active', true),
    supabase.from('delivery_couriers').select('id', { count: 'exact', head: true }).eq('is_active', true),
    supabase.from('delivery_invitations').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    supabase.from('delivery_invitations').select('id', { count: 'exact', head: true }).in('status', ['accepted', 'arrived']),
    supabase.from('delivery_invitations').select('id', { count: 'exact', head: true }).gte('created_at', toIso(current7Start)),
    supabase
      .from('delivery_invitations')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'completed')
      .gte('completed_at', toIso(current7Start)),
    supabase
      .from('pedidos')
      .select('id,comercio_id,estado,total,created_at')
      .gte('created_at', toIso(previous7Start))
      .order('created_at', { ascending: false }),
    supabase
      .from('pedidos')
      .select('id,comercio_id,estado,total,created_at,nombre_cliente,detalles')
      .order('created_at', { ascending: false })
      .limit(4),
    supabase
      .from('comercios')
      .select('id,nombre,categoria,direccion,en_linea,updated_at,permite_delivery,recibe_pedidos_whatsapp')
      .eq('en_linea', true)
      .order('updated_at', { ascending: false })
      .limit(12),
  ]);

  const activeBusinessesCount = countOrThrow('active businesses', activeBusinessesResult);
  const totalBusinessesCount = countOrThrow('total businesses', totalBusinessesResult);
  const deliveryBusinessesCount = countOrThrow('delivery businesses', deliveryBusinessesResult);
  const whatsappBusinessesCount = countOrThrow('whatsapp businesses', whatsappBusinessesResult);
  const updatedBusinesses24hCount = countOrThrow('updated businesses', updatedBusinessesResult);
  const activeProductsCount = countOrThrow('active products', activeProductsResult);
  const activeCategoriesCount = countOrThrow('active categories', activeCategoriesResult);
  const activeAdminsCount = countOrThrow('active admins', activeAdminsResult);
  const activeCouriersCount = countOrThrow('active couriers', activeCouriersResult);
  const pendingInvitesCount = countOrThrow('pending invitations', pendingInvitesResult);
  const inRouteInvitesCount = countOrThrow('in route invitations', inRouteInvitesResult);
  const createdInvites7dCount = countOrThrow('created invitations 7d', createdInvites7dResult);
  const completedInvites7dCount = countOrThrow('completed invitations 7d', completedInvites7dResult);
  const orderMetrics = rowsOrThrow<DashboardOrderMetricRow>('order metrics', orderMetricsResult).map((row) => ({
    ...row,
    createdAtMs: toTimestamp(row.created_at),
    normalizedStatus: normalizeOrderStatus(row.estado),
    totalAmount: toNumber(row.total),
  }));
  const recentOrderRows = rowsOrThrow<DashboardRecentOrderRow>('recent orders', recentOrdersResult);
  const featuredBusinessRows = rowsOrThrow<DashboardCommerceRow>('featured businesses', featuredBusinessesResult);

  let auditRows: DashboardAuditRow[] = [];
  let deniedAccess24hCount = 0;
  let recoveryRequested24hCount = 0;

  if (hasAuditAccess) {
    const [auditRowsResult, deniedAccessResult, recoveryRequestedResult] = await Promise.all([
      supabase
        .from('admin_audit_logs')
        .select('id, actor_email, action, entity_type, entity_id, created_at')
        .order('created_at', { ascending: false })
        .limit(5),
      supabase
        .from('admin_audit_logs')
        .select('id', { count: 'exact', head: true })
        .in('action', ['admin.login_denied', 'admin.unauthorized_access'])
        .gte('created_at', toIso(last24hStart)),
      supabase
        .from('admin_audit_logs')
        .select('id', { count: 'exact', head: true })
        .eq('action', 'admin.password_recovery_requested')
        .gte('created_at', toIso(last24hStart)),
    ]);

    auditRows = rowsOrThrow<DashboardAuditRow>('audit rows', auditRowsResult);
    deniedAccess24hCount = countOrThrow('denied access 24h', deniedAccessResult);
    recoveryRequested24hCount = countOrThrow('recovery requests 24h', recoveryRequestedResult);
  }

  const featuredBusinessIds = featuredBusinessRows.map((business) => business.id).filter(Boolean);
  const recentOrderCommerceIds = recentOrderRows
    .map((row) => row.comercio_id?.toString().trim() ?? '')
    .filter(Boolean);
  const commerceIdsForNames = [...new Set([...featuredBusinessIds, ...recentOrderCommerceIds])];

  let featuredProductRows: DashboardProductRow[] = [];
  let commerceNameRows: Array<{ id: string; nombre?: string | null }> = [];

  if (commerceIdsForNames.length > 0) {
    const [featuredProductsResult, commerceNamesResult] = await Promise.all([
      featuredBusinessIds.length > 0
        ? supabase
            .from('productos')
            .select('id,comercio_id')
            .in('comercio_id', featuredBusinessIds)
            .or('disponible.is.null,disponible.eq.true')
        : Promise.resolve({ data: [], error: null }),
      supabase.from('comercios').select('id,nombre').in('id', commerceIdsForNames),
    ]);

    featuredProductRows = rowsOrThrow<DashboardProductRow>('featured products', featuredProductsResult as { data: DashboardProductRow[] | null; error: { message: string } | null });
    commerceNameRows = rowsOrThrow<{ id: string; nombre?: string | null }>('commerce names', commerceNamesResult);
  }

  const commerceNameById = new Map(commerceNameRows.map((row) => [row.id, row.nombre?.trim() || 'Comercio']));
  const featuredProductCountByBusiness = new Map<string, number>();

  for (const row of featuredProductRows) {
    const businessId = row.comercio_id?.toString().trim();
    if (!businessId) {
      continue;
    }

    featuredProductCountByBusiness.set(businessId, (featuredProductCountByBusiness.get(businessId) ?? 0) + 1);
  }

  const current7Orders = orderMetrics.filter((row) => row.createdAtMs >= current7Start.getTime());
  const todayOrders = orderMetrics.filter((row) => row.createdAtMs >= todayStart.getTime());
  const yesterdayOrders = orderMetrics.filter(
    (row) => row.createdAtMs >= yesterdayStart.getTime() && row.createdAtMs < todayStart.getTime(),
  );

  const revenueToday = todayOrders.reduce((sum, row) => sum + row.totalAmount, 0);
  const revenueYesterday = yesterdayOrders.reduce((sum, row) => sum + row.totalAmount, 0);
  const averageTicketToday = todayOrders.length > 0 ? revenueToday / todayOrders.length : 0;
  const averageTicketYesterday = yesterdayOrders.length > 0 ? revenueYesterday / yesterdayOrders.length : 0;
  const deliveredOrders7d = current7Orders.filter((row) => row.normalizedStatus === 'entregado').length;
  const pendingOrdersToday = todayOrders.filter((row) => ORDER_OPEN_STATUSES.has(row.normalizedStatus)).length;
  const deliveryOpenCount = pendingInvitesCount + inRouteInvitesCount;
  const deliveryCompletionRate = percentage(completedInvites7dCount, createdInvites7dCount);
  const averageTicket7d = current7Orders.length > 0
    ? current7Orders.reduce((sum, row) => sum + row.totalAmount, 0) / current7Orders.length
    : 0;
  const deliveryCoverage = percentage(deliveryBusinessesCount, activeBusinessesCount);
  const whatsappCoverage = percentage(whatsappBusinessesCount, activeBusinessesCount);

  const chartBuckets = Array.from({ length: 7 }, (_, index) => {
    const date = addDays(current7Start, index);

    return {
      label: WEEKDAY_LABELS[date.getDay()],
      key: getDayKey(toIso(date)),
      orders: 0,
      revenue: 0,
    };
  });

  for (const order of current7Orders) {
    const dayKey = getDayKey(order.created_at);
    const bucket = chartBuckets.find((entry) => entry.key === dayKey);

    if (!bucket) {
      continue;
    }

    bucket.orders += 1;
    bucket.revenue += order.totalAmount;
  }

  const orderCountByBusiness = new Map<string, number>();

  for (const order of current7Orders) {
    const businessId = order.comercio_id?.toString().trim();

    if (!businessId) {
      continue;
    }

    orderCountByBusiness.set(businessId, (orderCountByBusiness.get(businessId) ?? 0) + 1);
  }

  const featuredBusinesses = featuredBusinessRows
    .map((commerce) => ({
      id: commerce.id,
      name: commerce.nombre?.trim() || 'Comercio sin nombre',
      location: shortLocation(commerce.direccion),
      category: commerce.categoria?.trim() || 'Sin categoria',
      channel: businessChannelLabel(commerce),
      orders: orderCountByBusiness.get(commerce.id) ?? 0,
      catalogSize: featuredProductCountByBusiness.get(commerce.id) ?? 0,
      updatedAtMs: toTimestamp(commerce.updated_at),
    }))
    .sort((left, right) => right.orders - left.orders || right.updatedAtMs - left.updatedAtMs)
    .slice(0, 4)
    .map((commerce) => ({
      id: commerce.id,
      name: commerce.name,
      location: commerce.location,
      category: commerce.category,
      channel: commerce.channel,
      orders: commerce.orders,
      catalogSize: commerce.catalogSize,
    }));

  const chartData = chartBuckets.map((bucket) => ({
    label: bucket.label,
    orders: bucket.orders,
    revenue: bucket.revenue,
  }));

  const recentOrders = recentOrderRows.map((row) => {
    const normalizedStatus = normalizeOrderStatus(row.estado);
    const businessName = row.comercio_id ? commerceNameById.get(row.comercio_id) ?? 'Comercio' : 'Comercio';

    return {
      code: formatOrderCode(row),
      business: businessName,
      customer: row.nombre_cliente?.trim() || 'Cliente',
      amount: toNumber(row.total),
      status: formatOrderStatus(normalizedStatus),
      statusTone: orderTone(normalizedStatus),
      createdLabel: formatRelativeTime(row.created_at, now),
    };
  });

  const fallbackRecentActivity = [
    ...recentOrderRows.map((row) => {
      const normalizedStatus = normalizeOrderStatus(row.estado);
      const businessName = row.comercio_id ? commerceNameById.get(row.comercio_id) ?? 'Comercio' : 'Comercio';

      return {
        title: `Pedido ${formatOrderStatus(normalizedStatus)}`,
        description: `${businessName} · ${row.nombre_cliente?.trim() || 'Cliente'} · ${currencyFormatter.format(toNumber(row.total))}`,
        time: formatRelativeTime(row.created_at, now),
        tone: orderTone(normalizedStatus),
      } satisfies RecentActivityEntry;
    }),
    ...featuredBusinessRows.slice(0, 1).map((commerce) => ({
      title: 'Catalogo sincronizado',
      description: `${commerce.nombre?.trim() || 'Comercio'} mantiene presencia activa en marketplace.`,
      time: formatRelativeTime(commerce.updated_at, now),
      tone: 'info' as const,
    })),
  ].slice(0, 5);

  const recentActivity = (hasAuditAccess ? auditRows.map((row) => describeAuditEntry(row, now)) : fallbackRecentActivity).slice(0, 5);

  if (recentActivity.length === 0) {
    recentActivity.push({
      title: 'Sin actividad reciente',
      description: 'Todavia no hay eventos suficientes para poblar la bitacora operativa.',
      time: 'Hace instantes',
      tone: 'info',
    });
  }

  return {
    heroBadge: 'Supabase conectado',
    heroDescription:
      'Dashboard server-side con datos vivos de negocios, pedidos, catalogo y delivery sin exponer service role al navegador.',
    coverageLabel: hasAuditAccess ? 'Marketplace + delivery + seguridad' : 'Marketplace + delivery en vivo',
    coverageHint: hasAuditAccess
      ? 'Incluye lectura operativa y bitacora admin segun permisos del rol.'
      : 'El rol actual ve datos operativos en vivo del negocio y delivery.',
    kpis: [
      {
        title: 'Negocios activos',
        value: activeBusinessesCount.toString(),
        delta: `${updatedBusinesses24hCount} actualizados en 24h`,
        hint: `${deliveryBusinessesCount} con delivery habilitado de ${totalBusinessesCount} registrados.`,
        tone: 'violet',
      },
      {
        title: 'Pedidos hoy',
        value: todayOrders.length.toString(),
        delta: formatDelta(todayOrders.length, yesterdayOrders.length, 'vs ayer'),
        hint: `${pendingOrdersToday} siguen abiertos en la cola operativa del dia.`,
        tone: 'indigo',
      },
      {
        title: 'Productos visibles',
        value: activeProductsCount.toString(),
        delta: `${activeCategoriesCount} categorias activas`,
        hint: 'Catalogo detectado desde productos y categorias publicados en Supabase.',
        tone: 'emerald',
      },
      {
        title: 'Ingresos hoy',
        value: currencyFormatter.format(revenueToday),
        delta: formatDelta(revenueToday, revenueYesterday, 'vs ayer'),
        hint: `${currencyFormatter.format(averageTicketToday)} ticket promedio del dia.`,
        tone: 'amber',
      },
      {
        title: 'Ticket promedio',
        value: currencyFormatter.format(averageTicket7d),
        delta: formatDelta(averageTicketToday, averageTicketYesterday, 'vs ayer'),
        hint: `${deliveredOrders7d} pedidos entregados en la ventana de 7 dias.`,
        tone: 'rose',
      },
      {
        title: 'Delivery abierto',
        value: deliveryOpenCount.toString(),
        delta: `${inRouteInvitesCount} en ruta`,
        hint: `${activeCouriersCount} couriers activos y ${pendingInvitesCount} pendientes por aceptar.`,
        tone: 'slate',
      },
    ],
    chartData,
    deliveryOverview: {
      badge: `${deliveryOpenCount} abiertas`,
      title: 'Delivery operativo',
      description: 'Invitaciones y couriers vivos leidos desde las tablas operativas del flujo delivery.',
      progressLabel: `${deliveryCompletionRate}% de las invitaciones creadas en 7 dias ya quedaron completadas.`,
      progressValue: deliveryCompletionRate,
      stats: [
        {
          label: 'Couriers activos',
          value: activeCouriersCount.toString(),
        },
        {
          label: 'Completadas 7d',
          value: completedInvites7dCount.toString(),
        },
      ],
    },
    featuredBusinesses,
    businessesUpdatedLabel:
      featuredBusinessRows.length > 0
        ? `Ultima actividad ${formatRelativeTime(featuredBusinessRows[0]?.updated_at, now)}`
        : 'Sin actividad reciente en comercios',
    recentOrders,
    recentOrdersBadge: `${pendingOrdersToday} abiertos`,
    moduleSnapshots: [
      {
        id: 'orders-pending',
        label: 'Pedidos pendientes',
        value: current7Orders.filter((row) => row.normalizedStatus === 'pendiente').length.toString(),
        description: 'Ordenes pendientes detectadas en la ventana operativa reciente.',
      },
      {
        id: 'orders-transit',
        label: 'En camino',
        value: current7Orders.filter((row) => row.normalizedStatus === 'en_camino').length.toString(),
        description: 'Pedidos actualmente marcados como en camino.',
      },
      {
        id: 'orders-delivered',
        label: 'Entregados 7d',
        value: deliveredOrders7d.toString(),
        description: 'Pedidos con cierre entregado en los ultimos 7 dias.',
      },
      {
        id: 'delivery-enabled',
        label: 'Negocios con delivery',
        value: deliveryBusinessesCount.toString(),
        description: 'Comercios en linea con delivery habilitado.',
      },
      {
        id: 'whatsapp-enabled',
        label: 'WhatsApp habilitado',
        value: whatsappBusinessesCount.toString(),
        description: 'Comercios en linea que aceptan pedidos por WhatsApp.',
      },
      {
        id: 'couriers',
        label: 'Couriers activos',
        value: activeCouriersCount.toString(),
        description: 'Base activa de couriers registrados en delivery.',
      },
      {
        id: 'invites-open',
        label: 'Invitaciones abiertas',
        value: deliveryOpenCount.toString(),
        description: 'Invitaciones pendientes, aceptadas o en llegada.',
      },
      {
        id: 'admins',
        label: 'Admins activos',
        value: activeAdminsCount.toString(),
        description: 'Usuarios admin habilitados con sesion server-side.',
      },
    ],
    segmentCards: [
      {
        id: 'avg-ticket-7d',
        label: 'Ticket promedio 7d',
        value: currencyFormatter.format(averageTicket7d),
        description: 'Promedio real calculado sobre pedidos recientes.',
        tone: 'violet',
      },
      {
        id: 'delivery-coverage',
        label: 'Cobertura delivery',
        value: `${deliveryCoverage}%`,
        description: `${deliveryBusinessesCount} de ${activeBusinessesCount} negocios activos despachan delivery.`,
        tone: 'emerald',
      },
      hasAuditAccess
        ? {
            id: 'access-alerts',
            label: 'Alertas acceso 24h',
            value: deniedAccess24hCount.toString(),
            description: `${recoveryRequested24hCount} recoveries solicitados en la ventana reciente.`,
            tone: 'amber',
          }
        : {
            id: 'whatsapp-coverage',
            label: 'WhatsApp activo',
            value: `${whatsappCoverage}%`,
            description: `${whatsappBusinessesCount} negocios mantienen ese canal habilitado.`,
            tone: 'amber',
          },
    ],
    recentActivity,
  };
}