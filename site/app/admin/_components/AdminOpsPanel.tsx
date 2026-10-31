'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Clock3,
  QrCode,
  RefreshCw,
  ShoppingBag,
  Store,
  TrendingUp,
  Users,
} from 'lucide-react';

import type { CurrentAdmin } from '../_lib/admin-auth';
import {
  persistAdminExclusions,
  readAdminExclusionsFromLocalStorage,
} from '../_lib/admin-exclusions';
import { AdminFilterBar, AdminFilterSelect } from './AdminFilterSelect';

type OpsTopRow = {
  comercioId: string;
  nombre: string;
  slug: string;
  count: number;
};

type OpsLiveRestaurant = {
  id: string;
  nombre: string;
  slug: string;
  enLinea: boolean;
  scheduleOpen: boolean;
  scheduleConfigured: boolean;
  scheduleCaption: string;
  menuAcceptingOrders: boolean;
  permiteDelivery: boolean;
  lastOrderAt: string | null;
  ordersToday: number;
  ordersOpen: number;
};

type OpsExcludableBusiness = {
  id: string;
  nombre: string;
  slug: string;
  isPlatformDemo: boolean;
};

type OpsOverview = {
  generatedAt: string;
  windowDays: number;
  topLimit: number;
  filters?: {
    excludeDemos: boolean;
    excludedIds: string[];
    excludedCount: number;
  };
  catalog?: OpsExcludableBusiness[];
  dataQuality?: {
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
  peakHours: Array<{ hour: number; label: string; orders: number }>;
  activity: Array<{
    id: string;
    ts: string;
    kind: string;
    comercioId: string;
    businessName: string;
    summary: string;
  }>;
  funnelTotals: {
    visits: number;
    qr: number;
    carts: number;
    checkouts: number;
    orders: number;
  };
};

type AdminOpsPanelProps = {
  admin: CurrentAdmin;
};

async function readJson<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(payload.error ?? 'No se pudo completar la operacion.');
  }
  return payload;
}

function relativeTime(iso: string, now = new Date()) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  const diff = Math.max(0, now.getTime() - date.getTime());
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Ahora';
  if (mins < 60) return `Hace ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Hace ${hours} h`;
  return `Hace ${Math.floor(hours / 24)} d`;
}

const TOP_OPTIONS = [5, 10, 20, 30, 50] as const;
const DAY_OPTIONS = [1, 7, 14, 30] as const;
const METRIC_TABS = [
  ['orders', 'Pedidos'],
  ['visits', 'Visitas menu'],
  ['qr', 'Escaneos QR'],
  ['carts', 'Carritos'],
  ['checkouts', 'Checkouts'],
] as const;

export function AdminOpsPanel({ admin: _admin }: AdminOpsPanelProps) {
  const [data, setData] = useState<OpsOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState<(typeof DAY_OPTIONS)[number]>(7);
  const [top, setTop] = useState<(typeof TOP_OPTIONS)[number]>(10);
  const [metric, setMetric] =
    useState<(typeof METRIC_TABS)[number][0]>('orders');
  const [liveFilter, setLiveFilter] = useState<'accepting' | 'online' | 'all'>(
    'accepting',
  );
  const [excludeDemos, setExcludeDemos] = useState(true);
  const [excludedIds, setExcludedIds] = useState<string[]>([]);
  const [excludeQuery, setExcludeQuery] = useState('');
  const [filtersReady, setFiltersReady] = useState(false);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const stored = readAdminExclusionsFromLocalStorage();
    setExcludeDemos(stored.excludeDemos);
    setExcludedIds(stored.excludedIds);
    // Seed cookie for dashboard SSR on first visit after deploy.
    persistAdminExclusions(stored);
    setFiltersReady(true);
  }, []);

  useEffect(() => {
    if (!filtersReady) return;
    persistAdminExclusions({ excludeDemos, excludedIds });
  }, [excludeDemos, excludedIds, filtersReady]);

  const load = useCallback(async () => {
    if (!filtersReady) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        days: String(days),
        top: String(top),
        excludeDemos: excludeDemos ? '1' : '0',
      });
      if (excludedIds.length > 0) {
        params.set('exclude', excludedIds.join(','));
      }
      const response = await fetch(`/admin/api/ops/overview?${params}`, {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store',
      });
      if (response.status === 401 || response.status === 403) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(
          payload?.error ??
            'No autorizado para Ops. Recarga la pagina o vuelve a iniciar sesion.',
        );
      }
      const payload = await readJson<{ ok: true; data: OpsOverview }>(response);
      setData(payload.data);
      setNow(new Date());
    } catch (err) {
      // Keep last successful snapshot so a failed refresh does not blank the panel.
      setError(err instanceof Error ? err.message : 'No se pudo cargar ops.');
    } finally {
      setLoading(false);
    }
  }, [days, excludeDemos, excludedIds, filtersReady, top]);

  useEffect(() => {
    void load();
  }, [load]);

  const ranked = useMemo(() => {
    if (!data) return [];
    return data.tops[metric] ?? [];
  }, [data, metric]);

  const peakMax = useMemo(
    () => Math.max(...(data?.peakHours.map((row) => row.orders) ?? [0]), 1),
    [data],
  );

  const liveRows = useMemo(() => {
    const rows = data?.live.restaurants ?? [];
    if (liveFilter === 'accepting') return rows.filter((row) => row.menuAcceptingOrders);
    if (liveFilter === 'online') return rows.filter((row) => row.enLinea);
    return rows;
  }, [data, liveFilter]);

  const catalog = data?.catalog ?? [];
  const excludeCandidates = useMemo(() => {
    const q = excludeQuery.trim().toLowerCase();
    return catalog
      .filter((row) => !excludedIds.includes(row.id))
      .filter((row) => {
        if (!q) return row.isPlatformDemo;
        return (
          row.nombre.toLowerCase().includes(q) ||
          row.slug.toLowerCase().includes(q)
        );
      })
      .slice(0, 8);
  }, [catalog, excludeQuery, excludedIds]);

  const excludedRows = useMemo(
    () => catalog.filter((row) => excludedIds.includes(row.id)),
    [catalog, excludedIds],
  );

  return (
    <div className="space-y-4 sm:space-y-6">
      <section className="overflow-hidden rounded-2xl border border-slate-900/10 bg-[linear-gradient(135deg,#0b1220_0%,#1e1b4b_48%,#4c1d95_100%)] p-4 text-white sm:rounded-[2rem] sm:p-6 lg:p-8">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-black uppercase tracking-[0.16em] text-violet-200/70">
              Ops en vivo
            </p>
            <h1 className="mt-1 font-[var(--font-display)] text-2xl font-black tracking-[-0.04em] sm:mt-2 sm:text-3xl">
              Actividad por restaurante
            </h1>
            <p className="mt-1 hidden text-sm text-violet-100/80 sm:block">
              Menus abiertos, visitas, QR, carritos, pedidos y horas pico.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex h-10 shrink-0 items-center gap-2 rounded-xl border border-white/15 bg-white/10 px-3 text-sm font-bold hover:bg-white/15 disabled:opacity-60 sm:px-4"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Actualizar</span>
          </button>
        </div>

        <AdminFilterBar className="mt-5">
          <AdminFilterSelect
            tone="dark"
            label="Ventana"
            value={String(days)}
            onChange={(value) =>
              setDays(Number(value) as (typeof DAY_OPTIONS)[number])
            }
            options={DAY_OPTIONS.map((value) => ({
              value: String(value),
              label: value === 1 ? 'Hoy / 24h' : `${value} dias`,
            }))}
          />
          <AdminFilterSelect
            tone="dark"
            label="Top"
            value={String(top)}
            onChange={(value) =>
              setTop(Number(value) as (typeof TOP_OPTIONS)[number])
            }
            options={TOP_OPTIONS.map((value) => ({
              value: String(value),
              label: `Top ${value}`,
            }))}
          />
        </AdminFilterBar>
      </section>

      {error ? (
        <div className="rounded-[1.35rem] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      <details className="group rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_20px_60px_-40px_rgba(15,23,42,0.35)] sm:rounded-[1.8rem] sm:p-5">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
          <div>
            <h2 className="font-[var(--font-display)] text-base font-black tracking-[-0.03em] text-slate-950 sm:text-lg">
              Excluir de Ops
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 sm:text-sm">
              {excludedRows.length} manuales · demos {excludeDemos ? 'off' : 'on'}
            </p>
          </div>
          <span className="rounded-full border border-slate-200 px-2.5 py-1 text-[10px] font-bold text-slate-600 group-open:bg-slate-100">
            Ajustar
          </span>
        </summary>

        <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <p className="hidden text-sm text-slate-500 sm:block">
            Quita demos o restaurantes de prueba del ranking y del live.
          </p>
          <label className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700">
            <input
              type="checkbox"
              checked={excludeDemos}
              onChange={(event) => setExcludeDemos(event.target.checked)}
            />
            Excluir demos
          </label>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(240px,0.8fr)]">
          <div>
            <input
              value={excludeQuery}
              onChange={(event) => setExcludeQuery(event.target.value)}
              placeholder="Buscar para excluir…"
              className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none ring-violet-200 focus:ring-4"
            />
            <div className="mt-2 flex flex-wrap gap-2">
              {excludeCandidates.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  onClick={() =>
                    setExcludedIds((prev) =>
                      prev.includes(row.id) ? prev : [...prev, row.id],
                    )
                  }
                  className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-violet-50 hover:text-violet-700"
                >
                  + {row.nombre}
                  {row.isPlatformDemo ? ' (demo)' : ''}
                </button>
              ))}
              {excludeQuery.trim() && excludeCandidates.length === 0 ? (
                <p className="text-xs text-slate-500">Sin coincidencias.</p>
              ) : null}
            </div>
          </div>

          <div className="rounded-[1.2rem] border border-slate-200 bg-slate-50/80 p-3">
            <p className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">
              Excluidos ({excludedRows.length})
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {excludedRows.length === 0 ? (
                <p className="text-xs text-slate-500">Ninguno.</p>
              ) : (
                excludedRows.map((row) => (
                  <button
                    key={row.id}
                    type="button"
                    onClick={() =>
                      setExcludedIds((prev) => prev.filter((id) => id !== row.id))
                    }
                    className="rounded-full bg-slate-900 px-3 py-1.5 text-xs font-bold text-white"
                    title="Quitar exclusion"
                  >
                    {row.nombre} ×
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      </details>

      <section className="grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-5">
        {(
          [
            { label: 'Aceptando', value: data?.live.acceptingOrdersCount ?? '—', Icon: Store },
            { label: 'En linea', value: data?.live.onlineCount ?? '—', Icon: Activity },
            { label: 'Visitas', value: data?.funnelTotals.visits ?? '—', Icon: Users },
            { label: 'Carritos', value: data?.funnelTotals.carts ?? '—', Icon: ShoppingBag },
            { label: 'Pedidos', value: data?.funnelTotals.orders ?? '—', Icon: TrendingUp },
          ] as const
        ).map((card) => (
          <div
            key={card.label}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 shadow-[0_16px_40px_-36px_rgba(15,23,42,0.4)] sm:rounded-[1.35rem] sm:px-4 sm:py-3"
          >
            <div className="flex items-center justify-between gap-1">
              <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500 sm:text-[11px]">
                {card.label}
              </p>
              <card.Icon className="hidden h-4 w-4 text-violet-600 sm:block" />
            </div>
            <p className="mt-1 text-xl font-black tabular-nums text-slate-950 sm:mt-2 sm:text-2xl">
              {card.value}
            </p>
          </div>
        ))}
      </section>

      <div className="space-y-1 text-xs text-slate-500">
        <p>
          Ultima lectura:{' '}
          {data ? relativeTime(data.generatedAt, now) : loading ? 'cargando…' : '—'} · ventana{' '}
          {data?.windowDays ?? days}d
          {data?.dataQuality
            ? ` · escaneados ${data.dataQuality.ordersScanned} pedidos / ${data.dataQuality.eventsScanned} eventos`
            : ''}
        </p>
        {(data?.dataQuality?.notes ?? []).map((note) => (
          <p key={note} className="text-slate-500">
            {note}
          </p>
        ))}
      </div>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
        <article className="rounded-[1.8rem] border border-slate-200/80 bg-white p-6 shadow-[0_20px_60px_-40px_rgba(15,23,42,0.35)]">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-[var(--font-display)] text-xl font-black tracking-[-0.03em] text-slate-950">
                Menus abiertos ahora
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Combina toggle en linea + horario real del negocio.
              </p>
            </div>
            <AdminFilterSelect
              label="Mostrar"
              value={liveFilter}
              onChange={(value) =>
                setLiveFilter(value as 'accepting' | 'online' | 'all')
              }
              options={[
                { value: 'accepting', label: 'Aceptando pedidos' },
                { value: 'online', label: 'En linea' },
                { value: 'all', label: 'Todos' },
              ]}
            />
          </div>

          <div className="mt-4 overflow-hidden rounded-[1.25rem] border border-slate-200">
            <div className="max-h-[480px] overflow-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="sticky top-0 bg-slate-50 text-left text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Restaurante</th>
                    <th className="px-3 py-2">Estado</th>
                    <th className="px-3 py-2">Hoy</th>
                    <th className="px-3 py-2">Abiertos</th>
                    <th className="px-3 py-2">Ultimo pedido</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {liveRows.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-3 py-8 text-center text-slate-500">
                        {loading ? 'Cargando…' : 'Sin restaurantes en este filtro.'}
                      </td>
                    </tr>
                  ) : (
                    liveRows.map((row) => (
                      <tr key={row.id} className="align-top">
                        <td className="px-3 py-3">
                          <Link
                            href={`/admin/negocios/${row.id}`}
                            className="font-semibold text-slate-950 hover:text-violet-700 hover:underline"
                          >
                            {row.nombre}
                          </Link>
                          <p className="text-xs text-slate-500">/{row.slug}</p>
                          <p className="mt-1 text-[11px] text-slate-500">{row.scheduleCaption}</p>
                        </td>
                        <td className="px-3 py-3">
                          <span
                            className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold ${
                              row.menuAcceptingOrders
                                ? 'bg-emerald-50 text-emerald-700'
                                : row.enLinea
                                  ? 'bg-amber-50 text-amber-700'
                                  : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {row.menuAcceptingOrders
                              ? 'Aceptando'
                              : row.enLinea
                                ? 'En linea / cerrado'
                                : 'Offline'}
                          </span>
                        </td>
                        <td className="px-3 py-3 font-semibold tabular-nums">{row.ordersToday}</td>
                        <td className="px-3 py-3 font-semibold tabular-nums">{row.ordersOpen}</td>
                        <td className="px-3 py-3 text-xs text-slate-500">
                          {row.lastOrderAt ? relativeTime(row.lastOrderAt, now) : '—'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </article>

        <article className="rounded-[1.8rem] border border-slate-200/80 bg-white p-6 shadow-[0_20px_60px_-40px_rgba(15,23,42,0.35)]">
          <div className="flex items-center gap-2">
            <Clock3 className="h-4 w-4 text-violet-600" />
            <h2 className="font-[var(--font-display)] text-xl font-black tracking-[-0.03em] text-slate-950">
              Horas pico de pedidos
            </h2>
          </div>
          <p className="mt-1 text-sm text-slate-500">Zona horaria America/Caracas.</p>
          <div className="mt-4 space-y-1.5">
            {(data?.peakHours ?? []).map((row) => (
              <div key={row.hour} className="flex items-center gap-3 text-xs">
                <span className="w-16 shrink-0 tabular-nums text-slate-500">{row.label}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-violet-500"
                    style={{ width: `${(row.orders / peakMax) * 100}%` }}
                  />
                </div>
                <span className="w-8 text-right font-bold tabular-nums text-slate-700">
                  {row.orders}
                </span>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.85fr)]">
        <article className="rounded-[1.8rem] border border-slate-200/80 bg-white p-6 shadow-[0_20px_60px_-40px_rgba(15,23,42,0.35)]">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-[var(--font-display)] text-xl font-black tracking-[-0.03em] text-slate-950">
                Ranking de restaurantes
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Top {top} por {metric === 'orders' ? 'pedidos reales' : 'eventos de menu'} en{' '}
                {days} dias. Por defecto usamos Pedidos (mas fiable para negocio).
              </p>
            </div>
            <AdminFilterSelect
              label="Ordenar por"
              value={metric}
              onChange={(value) => setMetric(value as typeof metric)}
              options={METRIC_TABS.map(([value, label]) => ({ value, label }))}
            />
          </div>

          <ol className="mt-4 divide-y divide-slate-100 overflow-hidden rounded-[1.25rem] border border-slate-200">
            {ranked.length === 0 ? (
              <li className="px-4 py-8 text-center text-sm text-slate-500">
                {loading ? 'Cargando ranking…' : 'Sin datos para esta metrica.'}
              </li>
            ) : (
              ranked.map((row, index) => (
                <li
                  key={row.comercioId}
                  className="flex items-center justify-between gap-3 px-4 py-3"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-violet-50 text-xs font-black text-violet-700">
                      {index + 1}
                    </span>
                    <div className="min-w-0">
                      <Link
                        href={`/admin/negocios/${row.comercioId}`}
                        className="truncate font-semibold text-slate-950 hover:text-violet-700 hover:underline"
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
                  <span className="text-lg font-black tabular-nums text-slate-950">{row.count}</span>
                </li>
              ))
            )}
          </ol>
        </article>

        <article className="rounded-[1.8rem] border border-slate-200/80 bg-white p-6 shadow-[0_20px_60px_-40px_rgba(15,23,42,0.35)]">
          <div className="flex items-center gap-2">
            <QrCode className="h-4 w-4 text-violet-600" />
            <h2 className="font-[var(--font-display)] text-xl font-black tracking-[-0.03em] text-slate-950">
              Actividad reciente
            </h2>
          </div>
          <div className="mt-4 max-h-[560px] space-y-2 overflow-auto">
            {(data?.activity ?? []).length === 0 ? (
              <p className="text-sm text-slate-500">
                {loading ? 'Cargando…' : 'Sin actividad reciente.'}
              </p>
            ) : (
              (data?.activity ?? []).map((item) => (
                <div
                  key={item.id}
                  className="rounded-[1.1rem] border border-slate-200 bg-slate-50/80 px-3 py-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <Link
                        href={`/admin/negocios/${item.comercioId}`}
                        className="text-sm font-bold text-slate-950 hover:text-violet-700 hover:underline"
                      >
                        {item.businessName}
                      </Link>
                      <p className="mt-0.5 text-xs text-slate-600">{item.summary}</p>
                    </div>
                    <span className="shrink-0 text-[11px] font-semibold text-slate-500">
                      {relativeTime(item.ts, now)}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </article>
      </section>
    </div>
  );
}
