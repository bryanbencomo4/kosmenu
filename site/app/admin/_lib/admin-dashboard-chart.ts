import 'server-only';

import {
  defaultAdminExclusions,
  type AdminExclusions,
} from './admin-exclusions';
import {
  aggregateMoneyByCurrency,
  extractOrderMoney,
  sumUsdEstimates,
  type AdminMoney,
} from './admin-money';
import { getAdminSupabaseClient } from './admin-supabase';
import {
  loadAdminBusinessUnitsPerUsd,
  loadAdminMarketUnitsPerUsd,
  mergeUnitsPerUsd,
} from './admin-usd-rates';

export const DASHBOARD_CHART_RANGES = ['24h', '7d', '30d', '90d'] as const;
export type DashboardChartRange = (typeof DASHBOARD_CHART_RANGES)[number];

export type DashboardChartPoint = {
  label: string;
  key: string;
  /** Inclusive window start (ISO) for deep-link into /admin/pedidos */
  from: string;
  /** Exclusive window end (ISO) for deep-link into /admin/pedidos */
  to: string;
  orders: number;
  byCurrency: Array<{ currency: string; amount: number; count: number }>;
  usdEstimate: number;
  usdCoveredOrders: number;
};

export type DashboardChartPayload = {
  range: DashboardChartRange;
  generatedAt: string;
  points: DashboardChartPoint[];
  availableCurrencies: string[];
};

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const WEEKDAY_LABELS = ['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab'] as const;

function parseDate(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isCancelledOrderStatus(value: string | null | undefined) {
  const normalized = (value ?? '').trim().toLowerCase();
  return (
    normalized === 'cancelado' ||
    normalized === 'rechazado' ||
    normalized === 'anulado'
  );
}

function toIso(date: Date) {
  return date.toISOString();
}

function startOfLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
}

function startOfLocalHour(date: Date) {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    date.getHours(),
    0,
    0,
    0,
  );
}

function dayKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function hourKey(date: Date) {
  return `${dayKey(date)}T${String(date.getHours()).padStart(2, '0')}`;
}

function weekKey(date: Date) {
  const start = startOfLocalDay(date);
  const day = (start.getDay() + 6) % 7; // Monday=0
  start.setDate(start.getDate() - day);
  return dayKey(start);
}

function formatDayLabel(date: Date) {
  return `${WEEKDAY_LABELS[date.getDay()]} ${date.getDate()}/${date.getMonth() + 1}`;
}

function formatHourLabel(date: Date) {
  return `${String(date.getHours()).padStart(2, '0')}:00`;
}

function formatWeekLabel(weekStart: Date) {
  const end = new Date(weekStart);
  end.setDate(end.getDate() + 6);
  return `${weekStart.getDate()}/${weekStart.getMonth() + 1}–${end.getDate()}/${end.getMonth() + 1}`;
}

export function isDashboardChartRange(value: string): value is DashboardChartRange {
  return (DASHBOARD_CHART_RANGES as readonly string[]).includes(value);
}

async function loadExcludedBusinessIds(
  exclusions: AdminExclusions,
): Promise<Set<string>> {
  const excluded = new Set(
    exclusions.excludedIds.map((id) => id.trim()).filter(Boolean),
  );
  if (!exclusions.excludeDemos) return excluded;

  const supabase = getAdminSupabaseClient();
  try {
    const { data, error } = await supabase
      .from('comercios')
      .select('id')
      .eq('is_platform_demo', true)
      .limit(800);
    if (error) {
      console.warn('[admin-dashboard-chart] demo exclusion skipped', error.message);
      return excluded;
    }
    for (const row of (data ?? []) as Array<{ id?: string | null }>) {
      const id = row.id?.toString().trim();
      if (id) excluded.add(id);
    }
  } catch (error) {
    console.warn(
      '[admin-dashboard-chart] demo exclusion skipped',
      error instanceof Error ? error.message : error,
    );
  }
  return excluded;
}

type BucketSpec = {
  key: string;
  label: string;
  startMs: number;
  endMs: number;
};

function buildBuckets(range: DashboardChartRange, now: Date): {
  windowStart: Date;
  buckets: BucketSpec[];
} {
  if (range === '24h') {
    const endHour = startOfLocalHour(now);
    const windowStart = new Date(endHour.getTime() - 23 * HOUR_MS);
    const buckets = Array.from({ length: 24 }, (_, index) => {
      const start = new Date(windowStart.getTime() + index * HOUR_MS);
      return {
        key: hourKey(start),
        label: formatHourLabel(start),
        startMs: start.getTime(),
        endMs: start.getTime() + HOUR_MS,
      };
    });
    return { windowStart, buckets };
  }

  if (range === '30d') {
    const today = startOfLocalDay(now);
    const windowStart = new Date(today.getTime() - 29 * DAY_MS);
    const buckets = Array.from({ length: 30 }, (_, index) => {
      const start = new Date(windowStart.getTime() + index * DAY_MS);
      return {
        key: dayKey(start),
        label: `${start.getDate()}/${start.getMonth() + 1}`,
        startMs: start.getTime(),
        endMs: start.getTime() + DAY_MS,
      };
    });
    return { windowStart, buckets };
  }

  if (range === '90d') {
    const today = startOfLocalDay(now);
    const windowStart = new Date(today.getTime() - 89 * DAY_MS);
    // Align first bucket to week start (Mon).
    const first = startOfLocalDay(windowStart);
    const offset = (first.getDay() + 6) % 7;
    first.setDate(first.getDate() - offset);
    const buckets: BucketSpec[] = [];
    for (let cursor = new Date(first); cursor.getTime() <= today.getTime(); ) {
      const start = new Date(cursor);
      const end = new Date(cursor);
      end.setDate(end.getDate() + 7);
      buckets.push({
        key: weekKey(start),
        label: formatWeekLabel(start),
        startMs: start.getTime(),
        endMs: end.getTime(),
      });
      cursor = end;
    }
    return { windowStart: first, buckets };
  }

  // 7d default
  const today = startOfLocalDay(now);
  const windowStart = new Date(today.getTime() - 6 * DAY_MS);
  const buckets = Array.from({ length: 7 }, (_, index) => {
    const start = new Date(windowStart.getTime() + index * DAY_MS);
    return {
      key: dayKey(start),
      label: WEEKDAY_LABELS[start.getDay()],
      startMs: start.getTime(),
      endMs: start.getTime() + DAY_MS,
    };
  });
  return { windowStart, buckets };
}

function bucketKeyForOrder(range: DashboardChartRange, createdAt: Date): string {
  if (range === '24h') return hourKey(createdAt);
  if (range === '90d') return weekKey(createdAt);
  return dayKey(createdAt);
}

export async function getAdminDashboardChartData(options?: {
  range?: DashboardChartRange;
  exclusions?: AdminExclusions;
}): Promise<DashboardChartPayload> {
  const range = options?.range ?? '7d';
  const exclusions = options?.exclusions ?? defaultAdminExclusions();
  const now = new Date();
  const { windowStart, buckets } = buildBuckets(range, now);
  const supabase = getAdminSupabaseClient();

  const [ordersResult, excludedIds, marketUnits] = await Promise.all([
    supabase
      .from('pedidos')
      .select('id,comercio_id,estado,total,created_at,detalles')
      .is('archived_at', null)
      .gte('created_at', toIso(windowStart))
      .order('created_at', { ascending: true })
      .limit(range === '90d' ? 8000 : range === '30d' ? 5000 : 3000),
    loadExcludedBusinessIds(exclusions),
    loadAdminMarketUnitsPerUsd(),
  ]);

  if (ordersResult.error) {
    throw new Error(ordersResult.error.message);
  }

  const orderRows = (
    (ordersResult.data ?? []) as Array<{
      comercio_id?: string | null;
      estado?: string | null;
      total?: number | string | null;
      created_at?: string | null;
      detalles?: unknown;
    }>
  ).filter((row) => !isCancelledOrderStatus(row.estado));

  const businessIds = orderRows
    .map((row) => row.comercio_id?.toString().trim() ?? '')
    .filter((id) => id && !excludedIds.has(id));
  const businessUnits = await loadAdminBusinessUnitsPerUsd(businessIds);

  const moneyByKey = new Map<string, AdminMoney[]>();
  for (const bucket of buckets) {
    moneyByKey.set(bucket.key, []);
  }

  for (const row of orderRows) {
    const comercioId = row.comercio_id?.toString().trim();
    if (comercioId && excludedIds.has(comercioId)) continue;
    const created = parseDate(row.created_at);
    if (!created) continue;
    const key = bucketKeyForOrder(range, created);
    const list = moneyByKey.get(key);
    if (!list) continue;
    list.push(
      extractOrderMoney(row, {
        unitsPerUsd: mergeUnitsPerUsd(
          marketUnits,
          comercioId ? businessUnits.get(comercioId) : null,
        ),
      }),
    );
  }

  const points: DashboardChartPoint[] = buckets.map((bucket) => {
    const money = moneyByKey.get(bucket.key) ?? [];
    const usd = sumUsdEstimates(money);
    return {
      label: bucket.label,
      key: bucket.key,
      from: toIso(new Date(bucket.startMs)),
      to: toIso(new Date(bucket.endMs)),
      orders: money.length,
      byCurrency: aggregateMoneyByCurrency(money),
      usdEstimate: usd.total,
      usdCoveredOrders: usd.coveredCount,
    };
  });

  const availableCurrencies = Array.from(
    new Set(points.flatMap((point) => point.byCurrency.map((row) => row.currency))),
  ).sort((left, right) => {
    const rank = (code: string) =>
      code === 'USD' ? 0 : code === 'EUR' ? 1 : code === 'COP' ? 2 : code === 'VES' ? 3 : 9;
    return rank(left) - rank(right) || left.localeCompare(right);
  });

  return {
    range,
    generatedAt: now.toISOString(),
    points,
    availableCurrencies,
  };
}
