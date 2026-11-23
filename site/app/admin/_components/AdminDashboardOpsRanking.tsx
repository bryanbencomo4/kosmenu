'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  persistAdminExclusions,
  readAdminExclusionsFromLocalStorage,
} from '../_lib/admin-exclusions';
import { AdminFilterSelect } from './AdminFilterSelect';

type RankingRow = {
  comercioId: string;
  nombre: string;
  slug: string;
  count: number;
};

type FallbackRow = {
  id: string;
  name: string;
  slug?: string | null;
  orders: number;
};

type OpsOverviewLite = {
  tops: {
    orders: RankingRow[];
    visits: RankingRow[];
    qr: RankingRow[];
    carts: RankingRow[];
    checkouts: RankingRow[];
  };
  windowDays: number;
  topLimit: number;
};

const METRIC_OPTIONS = [
  { value: 'orders', label: 'Pedidos' },
  { value: 'visits', label: 'Visitas menu' },
  { value: 'qr', label: 'Escaneos QR' },
  { value: 'carts', label: 'Carritos' },
  { value: 'checkouts', label: 'Checkouts' },
] as const;

type MetricKey = (typeof METRIC_OPTIONS)[number]['value'];

type AdminDashboardOpsRankingProps = {
  fallbackRows?: FallbackRow[];
};

export function AdminDashboardOpsRanking({
  fallbackRows = [],
}: AdminDashboardOpsRankingProps) {
  const [data, setData] = useState<OpsOverviewLite | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [metric, setMetric] = useState<MetricKey>('orders');
  const [filtersReady, setFiltersReady] = useState(false);
  const [excludeDemos, setExcludeDemos] = useState(true);
  const [excludedIds, setExcludedIds] = useState<string[]>([]);

  useEffect(() => {
    const stored = readAdminExclusionsFromLocalStorage();
    setExcludeDemos(stored.excludeDemos);
    setExcludedIds(stored.excludedIds);
    persistAdminExclusions(stored);
    setFiltersReady(true);
  }, []);

  const load = useCallback(async () => {
    if (!filtersReady) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        days: '7',
        top: '10',
        excludeDemos: excludeDemos ? '1' : '0',
      });
      if (excludedIds.length > 0) {
        params.set('exclude', excludedIds.join(','));
      }
      const response = await fetch(`/admin/api/ops/overview?${params.toString()}`, {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store',
      });
      const payload = (await response.json()) as {
        ok?: boolean;
        error?: string;
        data?: OpsOverviewLite;
      };
      if (!response.ok || !payload.data) {
        throw new Error(payload.error ?? 'No se pudo cargar el ranking.');
      }
      setData(payload.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar el ranking.');
    } finally {
      setLoading(false);
    }
  }, [excludeDemos, excludedIds, filtersReady]);

  useEffect(() => {
    void load();
  }, [load]);

  const ranked = useMemo(() => {
    if (data?.tops?.[metric]) return data.tops[metric];
    if (metric !== 'orders') return [];
    return fallbackRows.map((row) => ({
      comercioId: row.id,
      nombre: row.name,
      slug: row.slug ?? '',
      count: row.orders,
    }));
  }, [data, fallbackRows, metric]);

  const days = data?.windowDays ?? 7;
  const top = data?.topLimit ?? 10;
  const metricLabel =
    METRIC_OPTIONS.find((option) => option.value === metric)?.label ?? 'Pedidos';

  return (
    <article
      id="businesses"
      className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_20px_60px_-40px_rgba(15,23,42,0.35)] sm:rounded-[1.8rem] sm:p-6"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="font-[var(--font-display)] text-lg font-black tracking-[-0.03em] text-slate-950 sm:text-xl">
            Ranking de restaurantes
          </h2>
          <p className="mt-1 text-xs text-slate-500 sm:text-sm">
            Top {top} por {metric === 'orders' ? 'pedidos' : metricLabel.toLowerCase()} en{' '}
            {days}d · mismo que Ops.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <AdminFilterSelect
            label="Ordenar por"
            value={metric}
            onChange={(value) => setMetric(value as MetricKey)}
            options={[...METRIC_OPTIONS]}
          />
          <Link
            href="/admin/ops"
            className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold text-violet-700 hover:bg-violet-50"
          >
            Ver en Ops
          </Link>
        </div>
      </div>

      {error && !data ? (
        <p className="mt-4 rounded-[1rem] border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {error} Mostrando respaldo del dashboard.
        </p>
      ) : null}

      <ol className="mt-4 max-h-[360px] divide-y divide-slate-100 overflow-y-auto overscroll-contain rounded-xl border border-slate-200 sm:max-h-none sm:rounded-[1.25rem]">
        {ranked.length === 0 ? (
          <li className="px-4 py-8 text-center text-sm text-slate-500">
            {loading ? 'Cargando ranking…' : 'Sin datos para esta metrica.'}
          </li>
        ) : (
          ranked.map((row, index) => (
            <li
              key={row.comercioId}
              className="flex items-center justify-between gap-3 px-3 py-2.5 sm:px-4 sm:py-3"
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-50 text-xs font-black text-violet-700">
                  {index + 1}
                </span>
                <div className="min-w-0">
                  <Link
                    href={`/admin/negocios/${row.comercioId}`}
                    className="block truncate font-semibold text-slate-950 hover:text-violet-700 hover:underline"
                  >
                    {row.nombre}
                  </Link>
                  <div className="mt-0.5 flex flex-wrap gap-2 text-[11px]">
                    <Link
                      href={`/admin/pedidos?businessId=${row.comercioId}`}
                      className="font-bold text-violet-700 hover:underline"
                    >
                      Pedidos
                    </Link>
                    {row.slug ? (
                      <Link
                        href={`https://elmenuxfa.com/v/${encodeURIComponent(row.slug)}`}
                        target="_blank"
                        rel="noreferrer"
                        className="font-bold text-slate-500 hover:underline"
                      >
                        Menu
                      </Link>
                    ) : null}
                  </div>
                </div>
              </div>
              <span className="shrink-0 text-lg font-black tabular-nums text-slate-950">
                {row.count}
              </span>
            </li>
          ))
        )}
      </ol>
    </article>
  );
}
