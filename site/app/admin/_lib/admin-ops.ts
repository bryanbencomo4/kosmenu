import 'server-only';

import { resolveBusinessScheduleStatus } from '../../api/_lib/business-hours';
import { selectWithMissingColumnFallback } from './admin-safe-query';
import { getAdminSupabaseClient } from './admin-supabase';

export type OpsLiveRestaurant = {
  id: string;
  nombre: string;
  slug: string;
  enLinea: boolean;
  scheduleOpen: boolean;
  scheduleConfigured: boolean;
  scheduleCaption: string;
  menuAcceptingOrders: boolean;
  permiteDelivery: boolean;
  isPlatformDemo: boolean;
  lastOrderAt: string | null;
  ordersToday: number;
  ordersOpen: number;
};

export type OpsExcludableBusiness = {
  id: string;
  nombre: string;
  slug: string;
  isPlatformDemo: boolean;
};

export type OpsTopRow = {
  comercioId: string;
  nombre: string;
  slug: string;
  count: number;
};

export type OpsPeakHour = {
  hour: number;
  label: string;
  orders: number;
};

export type OpsActivityItem = {
  id: string;
  ts: string;
  kind: 'order' | 'menu_view' | 'qr_scan' | 'add_to_cart' | 'checkout_started' | 'order_completed';
  comercioId: string;
  businessName: string;
  summary: string;
};

export type OpsOverview = {
  generatedAt: string;
  windowDays: number;
  topLimit: number;
  filters: {
    excludeDemos: boolean;
    excludedIds: string[];
    excludedCount: number;
  };
  catalog: OpsExcludableBusiness[];
  dataQuality: {
    ordersScanned: number;
    eventsScanned: number;
    complete: boolean;
    notes: string[];
  };
  live: {
    onlineCount: number;
    scheduleOpenCount: number;
    acceptingOrdersCount: number;
    offlineCount: number;
    restaurants: OpsLiveRestaurant[];
  };
  tops: {
    visits: OpsTopRow[];
    qr: OpsTopRow[];
    carts: OpsTopRow[];
    checkouts: OpsTopRow[];
    orders: OpsTopRow[];
  };
  peakHours: OpsPeakHour[];
  activity: OpsActivityItem[];
  funnelTotals: {
    visits: number;
    qr: number;
    carts: number;
    checkouts: number;
    orders: number;
  };
};

const OPEN_ORDER_STATUSES = new Set(['pendiente', 'confirmado', 'preparando', 'en_camino']);
const EVENT_TYPES = [
  'menu_view',
  'qr_scan',
  'add_to_cart',
  'checkout_started',
  'order_completed',
] as const;

const PAGE_SIZE = 1000;
const MAX_EVENT_ROWS = 80_000;
const MAX_ORDER_ROWS = 40_000;

function asTrimmed(value: unknown) {
  if (value == null) return null;
  const text = String(value).trim();
  return text || null;
}

function startOfCaracasDay(now = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Caracas',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const day = formatter.format(now);
  return new Date(`${day}T00:00:00-04:00`);
}

function caracasHour(iso: string | null | undefined) {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const hour = Number(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Caracas',
      hour: '2-digit',
      hourCycle: 'h23',
    }).format(date),
  );
  return Number.isFinite(hour) ? hour : null;
}

function hourLabel(hour: number) {
  const suffix = hour >= 12 ? 'p. m.' : 'a. m.';
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour12}:00 ${suffix}`;
}

async function loadBusinessNames(ids: string[]) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) {
    return new Map<string, { nombre: string; slug: string }>();
  }
  const supabase = getAdminSupabaseClient();
  const map = new Map<string, { nombre: string; slug: string }>();

  for (let i = 0; i < unique.length; i += 200) {
    const chunk = unique.slice(i, i + 200);
    const { data, error } = await supabase.from('comercios').select('id,nombre,slug').in('id', chunk);
    if (error) throw new Error(error.message);
    for (const row of (data ?? []) as Array<{
      id?: string;
      nombre?: string | null;
      slug?: string | null;
    }>) {
      map.set(String(row.id ?? ''), {
        nombre: (row.nombre ?? '').trim() || 'Comercio',
        slug: (row.slug ?? '').trim() || '',
      });
    }
  }

  return map;
}

function rankCounts(
  counts: Map<string, number>,
  names: Map<string, { nombre: string; slug: string }>,
  limit: number,
): OpsTopRow[] {
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([comercioId, count]) => ({
      comercioId,
      nombre: names.get(comercioId)?.nombre ?? 'Comercio',
      slug: names.get(comercioId)?.slug ?? '',
      count,
    }));
}

async function fetchAllOrderRows(windowStart: string) {
  const supabase = getAdminSupabaseClient();
  const rows: Array<{
    id: string;
    comercio_id?: string | null;
    estado?: string | null;
    created_at?: string | null;
    nombre_cliente?: string | null;
  }> = [];

  for (let from = 0; from < MAX_ORDER_ROWS; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('pedidos')
      .select('id,comercio_id,estado,created_at,nombre_cliente')
      .is('archived_at', null)
      .gte('created_at', windowStart)
      .order('created_at', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw new Error(error.message);
    const page = (data ?? []) as typeof rows;
    rows.push(...page);
    if (page.length < PAGE_SIZE) {
      return { rows, complete: true };
    }
  }

  return { rows, complete: false };
}

async function fetchAllEventRows(windowStart: string) {
  const supabase = getAdminSupabaseClient();
  const rows: Array<{ comercio_id?: string | null; event_type?: string | null }> = [];

  for (let from = 0; from < MAX_EVENT_ROWS; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('menu_analytics_events')
      .select('comercio_id,event_type')
      .in('event_type', [...EVENT_TYPES])
      .gte('created_at', windowStart)
      .order('created_at', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw new Error(error.message);
    const page = (data ?? []) as typeof rows;
    rows.push(...page);
    if (page.length < PAGE_SIZE) {
      return { rows, complete: true };
    }
  }

  return { rows, complete: false };
}

export async function getAdminOpsOverview(options?: {
  days?: number;
  topLimit?: number;
  activityLimit?: number;
  excludeDemos?: boolean;
  excludedIds?: string[];
}): Promise<OpsOverview> {
  const days = Math.min(Math.max(options?.days ?? 7, 1), 30);
  const topLimit = Math.min(Math.max(options?.topLimit ?? 10, 1), 100);
  const activityLimit = Math.min(Math.max(options?.activityLimit ?? 40, 10), 100);
  const excludeDemos = options?.excludeDemos !== false;
  const excludedIds = new Set(
    (options?.excludedIds ?? [])
      .map((id) => id.trim())
      .filter((id) => /^[0-9a-f-]{36}$/i.test(id)),
  );
  const now = new Date();
  const windowStart = new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
  const todayStart = startOfCaracasDay(now).toISOString();
  const supabase = getAdminSupabaseClient();

  const [businessesPage, ordersPage, eventsPage, recentOrdersResult, recentEventsResult] =
    await Promise.all([
      selectWithMissingColumnFallback(
        (select) =>
          supabase
            .from('comercios')
            .select(select)
            .order('updated_at', { ascending: false })
            .limit(800),
        'id,nombre,slug,en_linea,horarios,permite_delivery,updated_at,mostrar_en_directorio_publico,is_platform_demo',
      ),
      fetchAllOrderRows(windowStart),
      fetchAllEventRows(windowStart),
      supabase
        .from('pedidos')
        .select('id,comercio_id,estado,created_at,nombre_cliente,total,detalles')
        .is('archived_at', null)
        .order('created_at', { ascending: false })
        .limit(25),
      supabase
        .from('menu_analytics_events')
        .select('id,comercio_id,event_type,created_at,origin')
        .in('event_type', [
          'menu_view',
          'qr_scan',
          'add_to_cart',
          'checkout_started',
          'order_completed',
        ])
        .order('created_at', { ascending: false })
        .limit(40),
    ]);

  if (recentOrdersResult.error) throw new Error(recentOrdersResult.error.message);
  if (recentEventsResult.error) throw new Error(recentEventsResult.error.message);

  const businesses = ((businessesPage.data ?? []) as unknown) as Array<{
    id: string;
    nombre?: string | null;
    slug?: string | null;
    en_linea?: boolean | null;
    horarios?: unknown;
    permite_delivery?: boolean | null;
    updated_at?: string | null;
    is_platform_demo?: boolean | null;
  }>;

  const catalog: OpsExcludableBusiness[] = businesses
    .map((row) => ({
      id: row.id,
      nombre: (row.nombre ?? '').trim() || 'Comercio',
      slug: (row.slug ?? '').trim() || '',
      isPlatformDemo: row.is_platform_demo === true,
    }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre));

  const excludedByFilter = new Set<string>();
  for (const row of businesses) {
    if (excludedIds.has(row.id)) {
      excludedByFilter.add(row.id);
      continue;
    }
    if (excludeDemos && row.is_platform_demo === true) {
      excludedByFilter.add(row.id);
    }
  }

  const isExcluded = (comercioId: string | null | undefined) => {
    const id = asTrimmed(comercioId);
    return !id || excludedByFilter.has(id);
  };

  const orders = ordersPage.rows;
  const events = eventsPage.rows;
  const notes: string[] = [
    'Visitas = sesiones de menu publico (dedupe por sesion). No incluye pedidos solo por WhatsApp.',
    'Pedidos = pedidos reales no archivados en la ventana.',
    'QR cuenta trafico con ?src=qr, ?source=qr, ?qr=1 o ?catalogo=1 (evento qr_scan).',
  ];
  if (excludeDemos) {
    notes.push('Demos de plataforma (is_platform_demo) excluidos del ranking y del live.');
  }
  if (excludedIds.size > 0) {
    notes.push(`${excludedIds.size} restaurante(s) excluidos manualmente.`);
  }
  if (!ordersPage.complete) {
    notes.push('Se alcanzo el tope de pedidos escaneados; el ranking puede estar incompleto.');
  }
  if (!eventsPage.complete) {
    notes.push('Se alcanzo el tope de eventos de menu escaneados; visitas/QR/carritos pueden estar incompletos.');
  }

  const orderCountByBusiness = new Map<string, number>();
  const ordersTodayByBusiness = new Map<string, number>();
  const openOrdersByBusiness = new Map<string, number>();
  const lastOrderByBusiness = new Map<string, string>();
  const peak = Array.from({ length: 24 }, () => 0);
  let ordersCounted = 0;

  for (const order of orders) {
    const comercioId = asTrimmed(order.comercio_id);
    if (!comercioId || isExcluded(comercioId)) continue;

    const status = (order.estado ?? '').trim().toLowerCase();
    const cancelled =
      status === 'cancelado' || status === 'rechazado' || status === 'anulado';

    const created = order.created_at ?? null;
    if (created) {
      const previous = lastOrderByBusiness.get(comercioId);
      if (!previous || created > previous) {
        lastOrderByBusiness.set(comercioId, created);
      }
    }

    // Cancelled orders stay out of revenue/ranking totals.
    if (cancelled) continue;

    ordersCounted += 1;
    orderCountByBusiness.set(comercioId, (orderCountByBusiness.get(comercioId) ?? 0) + 1);

    if (created && created >= todayStart) {
      ordersTodayByBusiness.set(comercioId, (ordersTodayByBusiness.get(comercioId) ?? 0) + 1);
    }

    if (created) {
      const hour = caracasHour(created);
      if (hour != null) peak[hour] += 1;
    }
  }

  // Open pedidos can be older than the ranking window — load active open queue separately.
  const { data: openQueue, error: openQueueError } = await supabase
    .from('pedidos')
    .select('comercio_id,estado')
    .is('archived_at', null)
    .in('estado', [...OPEN_ORDER_STATUSES])
    .limit(5000);
  if (openQueueError) throw new Error(openQueueError.message);
  for (const row of (openQueue ?? []) as Array<{ comercio_id?: string | null; estado?: string | null }>) {
    const comercioId = asTrimmed(row.comercio_id);
    if (!comercioId || isExcluded(comercioId)) continue;
    openOrdersByBusiness.set(comercioId, (openOrdersByBusiness.get(comercioId) ?? 0) + 1);
  }

  const visitCounts = new Map<string, number>();
  const qrCounts = new Map<string, number>();
  const cartCounts = new Map<string, number>();
  const checkoutCounts = new Map<string, number>();
  const funnelTotals = { visits: 0, qr: 0, carts: 0, checkouts: 0, orders: ordersCounted };

  for (const event of events) {
    const comercioId = asTrimmed(event.comercio_id);
    if (!comercioId || isExcluded(comercioId)) continue;
    switch (event.event_type) {
      case 'menu_view':
        visitCounts.set(comercioId, (visitCounts.get(comercioId) ?? 0) + 1);
        funnelTotals.visits += 1;
        break;
      case 'qr_scan':
        qrCounts.set(comercioId, (qrCounts.get(comercioId) ?? 0) + 1);
        funnelTotals.qr += 1;
        break;
      case 'add_to_cart':
        cartCounts.set(comercioId, (cartCounts.get(comercioId) ?? 0) + 1);
        funnelTotals.carts += 1;
        break;
      case 'checkout_started':
        checkoutCounts.set(comercioId, (checkoutCounts.get(comercioId) ?? 0) + 1);
        funnelTotals.checkouts += 1;
        break;
      default:
        break;
    }
  }

  const nameIds = [
    ...businesses.map((row) => row.id),
    ...orders.map((row) => row.comercio_id ?? ''),
    ...events.map((row) => row.comercio_id ?? ''),
    ...((recentOrdersResult.data ?? []) as Array<{ comercio_id?: string | null }>).map(
      (row) => row.comercio_id ?? '',
    ),
    ...((recentEventsResult.data ?? []) as Array<{ comercio_id?: string | null }>).map(
      (row) => row.comercio_id ?? '',
    ),
  ];
  const names = await loadBusinessNames(nameIds);

  const restaurants: OpsLiveRestaurant[] = businesses
    .filter((row) => !isExcluded(row.id))
    .map((row) => {
      const schedule = resolveBusinessScheduleStatus(row.horarios, now);
      const enLinea = row.en_linea === true;
      const menuAcceptingOrders = enLinea && (!schedule.configured || schedule.isOpen);
      return {
        id: row.id,
        nombre: (row.nombre ?? '').trim() || 'Comercio',
        slug: (row.slug ?? '').trim() || '',
        enLinea,
        scheduleOpen: schedule.configured ? schedule.isOpen : false,
        scheduleConfigured: schedule.configured,
        scheduleCaption: schedule.caption,
        menuAcceptingOrders,
        permiteDelivery: row.permite_delivery === true,
        isPlatformDemo: row.is_platform_demo === true,
        lastOrderAt: lastOrderByBusiness.get(row.id) ?? null,
        ordersToday: ordersTodayByBusiness.get(row.id) ?? 0,
        ordersOpen: openOrdersByBusiness.get(row.id) ?? 0,
      };
    });

  restaurants.sort((left, right) => {
    if (left.menuAcceptingOrders !== right.menuAcceptingOrders) {
      return left.menuAcceptingOrders ? -1 : 1;
    }
    if (left.ordersOpen !== right.ordersOpen) return right.ordersOpen - left.ordersOpen;
    if (left.ordersToday !== right.ordersToday) return right.ordersToday - left.ordersToday;
    return left.nombre.localeCompare(right.nombre);
  });

  const activity: OpsActivityItem[] = [];

  for (const row of (recentOrdersResult.data ?? []) as Array<{
    id?: string;
    comercio_id?: string | null;
    estado?: string | null;
    created_at?: string | null;
    nombre_cliente?: string | null;
  }>) {
    const comercioId = asTrimmed(row.comercio_id);
    const id = asTrimmed(row.id);
    if (!comercioId || !id || !row.created_at || isExcluded(comercioId)) continue;
    activity.push({
      id: `order:${id}`,
      ts: row.created_at,
      kind: 'order',
      comercioId,
      businessName: names.get(comercioId)?.nombre ?? 'Comercio',
      summary: `Pedido ${(row.estado ?? 'pendiente').replace(/_/g, ' ')} · ${
        (row.nombre_cliente ?? '').trim() || 'Cliente'
      }`,
    });
  }

  for (const row of (recentEventsResult.data ?? []) as Array<{
    id?: string | number;
    comercio_id?: string | null;
    event_type?: string | null;
    created_at?: string | null;
    origin?: string | null;
  }>) {
    const comercioId = asTrimmed(row.comercio_id);
    const kind = asTrimmed(row.event_type) as OpsActivityItem['kind'] | null;
    if (!comercioId || !kind || !row.created_at || isExcluded(comercioId)) continue;
    if (
      !['menu_view', 'qr_scan', 'add_to_cart', 'checkout_started', 'order_completed'].includes(kind)
    ) {
      continue;
    }
    const labels: Record<string, string> = {
      menu_view: 'Vista de menu',
      qr_scan: 'Escaneo QR',
      add_to_cart: 'Agrego al carrito',
      checkout_started: 'Inicio checkout',
      order_completed: 'Checkout completado',
    };
    activity.push({
      id: `event:${row.id}`,
      ts: row.created_at,
      kind,
      comercioId,
      businessName: names.get(comercioId)?.nombre ?? 'Comercio',
      summary: `${labels[kind] ?? kind}${row.origin ? ` · ${row.origin}` : ''}`,
    });
  }

  activity.sort((a, b) => (a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0));

  return {
    generatedAt: now.toISOString(),
    windowDays: days,
    topLimit,
    filters: {
      excludeDemos,
      excludedIds: [...excludedIds],
      excludedCount: excludedByFilter.size,
    },
    catalog,
    dataQuality: {
      ordersScanned: orders.length,
      eventsScanned: events.length,
      complete: ordersPage.complete && eventsPage.complete,
      notes,
    },
    live: {
      onlineCount: restaurants.filter((row) => row.enLinea).length,
      scheduleOpenCount: restaurants.filter((row) => row.scheduleOpen).length,
      acceptingOrdersCount: restaurants.filter((row) => row.menuAcceptingOrders).length,
      offlineCount: restaurants.filter((row) => !row.enLinea).length,
      restaurants: restaurants.slice(0, 120),
    },
    tops: {
      visits: rankCounts(visitCounts, names, topLimit),
      qr: rankCounts(qrCounts, names, topLimit),
      carts: rankCounts(cartCounts, names, topLimit),
      checkouts: rankCounts(checkoutCounts, names, topLimit),
      orders: rankCounts(orderCountByBusiness, names, topLimit),
    },
    peakHours: peak.map((ordersCount, hour) => ({
      hour,
      label: hourLabel(hour),
      orders: ordersCount,
    })),
    activity: activity.slice(0, activityLimit),
    funnelTotals,
  };
}

export async function setAdminOrderArchived(orderId: string, archived: boolean) {
  const supabase = getAdminSupabaseClient();
  const { data: current, error: loadError } = await supabase
    .from('pedidos')
    .select('id,comercio_id,estado,archived_at,nombre_cliente,detalles')
    .eq('id', orderId)
    .maybeSingle();

  if (loadError) throw new Error(loadError.message);
  if (!current?.id) throw new Error('Pedido no encontrado.');

  const nextArchivedAt = archived ? new Date().toISOString() : null;
  const { data, error } = await supabase
    .from('pedidos')
    .update({ archived_at: nextArchivedAt })
    .eq('id', orderId)
    .select('id,comercio_id,estado,archived_at,nombre_cliente,created_at')
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error('No se pudo actualizar el pedido.');

  return {
    before: current as {
      id: string;
      comercio_id?: string | null;
      estado?: string | null;
      archived_at?: string | null;
      nombre_cliente?: string | null;
    },
    after: data as {
      id: string;
      comercio_id?: string | null;
      estado?: string | null;
      archived_at?: string | null;
      nombre_cliente?: string | null;
      created_at?: string | null;
    },
  };
}
