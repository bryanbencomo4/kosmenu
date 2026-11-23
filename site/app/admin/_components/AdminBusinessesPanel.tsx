'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ExternalLink,
  Megaphone,
  RefreshCw,
  Search,
  Store,
  ToggleLeft,
  ToggleRight,
} from 'lucide-react';

import type { CurrentAdmin } from '../_lib/admin-auth';
import { foldSearchText } from '../../_lib/search-text';
import { AdminFilterBar, AdminFilterSelect } from './AdminFilterSelect';

type AdminBusiness = {
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
  ordersTotal?: number;
};

type FilterMode = 'all' | 'promoted' | 'directory' | 'offline';

type PromoStatsRow = {
  comercioId: string;
  impressions: number;
  uniqueVisitors: number;
  clicks: number;
  orders: number;
  ctr: number;
  cvr: number;
};

type AdminBusinessesPanelProps = {
  admin: CurrentAdmin;
  initialFilter?: FilterMode;
};

function formatPct(value: number) {
  if (!Number.isFinite(value) || value <= 0) return '0%';
  return `${(value * 100).toFixed(value >= 0.1 ? 1 : 2)}%`;
}

async function readJson<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(payload.error ?? 'No se pudo completar la operacion.');
  }
  return payload;
}

export function AdminBusinessesPanel({
  admin,
  initialFilter = 'all',
}: AdminBusinessesPanelProps) {
  const canWrite = admin.permissions.includes('businesses.write');
  const [businesses, setBusinesses] = useState<AdminBusiness[]>([]);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterMode>(initialFilter);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [promoStats, setPromoStats] = useState<Map<string, PromoStatsRow>>(new Map());

  const loadBusinesses = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [businessesResponse, statsResponse] = await Promise.all([
        fetch('/admin/api/negocios', {
          method: 'GET',
          credentials: 'include',
          cache: 'no-store',
        }),
        fetch('/admin/api/negocios/promo-stats', {
          method: 'GET',
          credentials: 'include',
          cache: 'no-store',
        }),
      ]);
      const payload = await readJson<{ ok: true; data: AdminBusiness[] }>(businessesResponse);
      setBusinesses(payload.data);

      try {
        const statsPayload = await readJson<{ ok: true; data: PromoStatsRow[] }>(statsResponse);
        setPromoStats(new Map(statsPayload.data.map((row) => [row.comercioId, row])));
      } catch {
        setPromoStats(new Map());
      }
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : 'No se pudieron cargar los negocios.',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadBusinesses();
  }, [loadBusinesses]);

  const filtered = useMemo(() => {
    const normalizedQuery = foldSearchText(query);
    return businesses.filter((business) => {
      if (filter === 'promoted' && !business.promovido) return false;
      if (filter === 'directory' && !business.mostrar_en_directorio_publico) return false;
      if (filter === 'offline' && business.en_linea) return false;
      if (!normalizedQuery) return true;
      const haystack = foldSearchText(
        [
          business.nombre,
          business.slug,
          business.categoria ?? '',
          business.direccion ?? '',
        ].join(' '),
      );
      return haystack.includes(normalizedQuery);
    });
  }, [businesses, filter, query]);

  const stats = useMemo(() => {
    const total = businesses.length;
    const promoted = businesses.filter((item) => item.promovido).length;
    const directory = businesses.filter((item) => item.mostrar_en_directorio_publico).length;
    const online = businesses.filter((item) => item.en_linea).length;
    return { total, promoted, directory, online };
  }, [businesses]);

  async function patchBusiness(
    id: string,
    patch: Partial<
      Pick<AdminBusiness, 'promovido' | 'mostrar_en_directorio_publico' | 'en_linea'>
    >,
  ) {
    if (!canWrite) return;
    setSavingId(id);
    setError(null);
    setStatusMessage(null);
    try {
      const response = await fetch('/admin/api/negocios', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...patch }),
      });
      const payload = await readJson<{ ok: true; data: AdminBusiness }>(response);
      setBusinesses((prev) =>
        prev.map((item) => (item.id === id ? payload.data : item)),
      );
      setStatusMessage(`Actualizado: ${payload.data.nombre}`);
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : 'No se pudo actualizar el negocio.',
      );
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <section className="overflow-hidden rounded-2xl border border-violet-200/70 bg-[linear-gradient(135deg,#1e1b4b_0%,#312e81_48%,#4c1d95_100%)] p-4 text-white shadow-[0_24px_80px_-48px_rgba(76,29,149,0.85)] sm:rounded-[1.8rem] sm:p-6 lg:p-8">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1.5 sm:space-y-2">
            <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] text-violet-100">
              <Store className="h-3.5 w-3.5" />
              Negocios
            </span>
            <h1 className="font-[var(--font-display)] text-2xl font-black tracking-[-0.04em] sm:text-3xl lg:text-4xl">
              Negocios registrados
            </h1>
            <p className="hidden max-w-2xl text-sm leading-7 text-violet-100/82 sm:block">
              Visibilidad, promo y pedidos por comercio.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadBusinesses()}
            disabled={loading || savingId != null}
            className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/10 px-3 text-sm font-semibold text-white hover:bg-white/16 disabled:opacity-60 sm:px-4"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Recargar</span>
          </button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 sm:mt-6 sm:grid-cols-4 sm:gap-3">
          {[
            ['Total', stats.total],
            ['En linea', stats.online],
            ['Directorio', stats.directory],
            ['Promo', stats.promoted],
          ].map(([label, value]) => (
            <div
              key={label}
              className="rounded-xl border border-white/10 bg-white/8 px-3 py-2.5 sm:rounded-[1.25rem] sm:px-4 sm:py-3"
            >
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-violet-100/70 sm:text-[11px]">
                {label}
              </p>
              <p className="mt-0.5 text-xl font-black tabular-nums sm:mt-1 sm:text-2xl">
                {value}
              </p>
            </div>
          ))}
        </div>
      </section>

      {(error || statusMessage) && (
        <div
          className={[
            'rounded-xl border px-4 py-3 text-sm font-medium',
            error
              ? 'border-rose-200 bg-rose-50 text-rose-700'
              : 'border-emerald-200 bg-emerald-50 text-emerald-700',
          ].join(' ')}
        >
          {error ?? statusMessage}
        </div>
      )}

      {!canWrite ? (
        <section className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Tu rol puede consultar negocios. Escribir requiere permiso extra.
        </section>
      ) : null}

      <section className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_20px_60px_-40px_rgba(15,23,42,0.35)] sm:rounded-[1.8rem] sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="font-[var(--font-display)] text-lg font-black tracking-[-0.03em] text-slate-950 sm:text-xl">
              Listado
            </h2>
            <p className="mt-1 text-xs text-slate-500 sm:text-sm">
              {filtered.length} de {businesses.length}
            </p>
          </div>
          <label className="relative w-full sm:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar nombre o slug…"
              className="w-full rounded-xl border border-slate-200 py-2.5 pl-10 pr-3 text-sm text-slate-900 outline-none ring-violet-200 focus:ring-4"
            />
          </label>
        </div>

        <AdminFilterBar className="mt-3">
          <AdminFilterSelect
            label="Filtro"
            value={filter}
            onChange={(value) => setFilter(value as FilterMode)}
            options={[
              { value: 'all', label: 'Todos' },
              { value: 'promoted', label: 'Promocionados' },
              { value: 'directory', label: 'En directorio' },
              { value: 'offline', label: 'Fuera de linea' },
            ]}
          />
        </AdminFilterBar>

        {/* Mobile compact cards */}
        <div className="mt-4 space-y-2 lg:hidden">
          {loading ? (
            <p className="py-8 text-center text-sm text-slate-500">Cargando…</p>
          ) : filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">Sin resultados.</p>
          ) : (
            filtered.map((business) => {
              const busy = savingId === business.id;
              return (
                <div
                  key={business.id}
                  className="rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <Link
                        href={`/admin/negocios/${business.id}`}
                        className="block truncate font-bold text-slate-950"
                      >
                        {business.nombre}
                      </Link>
                      <p className="truncate text-[11px] text-slate-500">
                        {business.categoria || 'Sin categoria'} · {business.ordersTotal ?? 0}{' '}
                        pedidos
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={!canWrite || busy}
                      onClick={() =>
                        void patchBusiness(business.id, { en_linea: !business.en_linea })
                      }
                      className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold ${
                        business.en_linea
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-slate-200 text-slate-600'
                      }`}
                    >
                      {business.en_linea ? 'Online' : 'Off'}
                    </button>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Link
                      href={`/admin/pedidos?businessId=${business.id}`}
                      className="text-[11px] font-bold text-violet-700"
                    >
                      Pedidos
                    </Link>
                    <Link
                      href={business.menuUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[11px] font-bold text-slate-500"
                    >
                      Menu
                    </Link>
                    <Link
                      href={`/admin/negocios/${business.id}`}
                      className="text-[11px] font-bold text-slate-500"
                    >
                      Detalle
                    </Link>
                    {canWrite ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          void patchBusiness(business.id, {
                            promovido: !business.promovido,
                          })
                        }
                        className={`text-[11px] font-bold ${
                          business.promovido ? 'text-violet-700' : 'text-slate-500'
                        }`}
                      >
                        {business.promovido ? 'Promo on' : 'Promo'}
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Desktop table */}
        <div className="mt-5 hidden overflow-hidden rounded-[1.35rem] border border-slate-200 lg:block">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">
                <tr>
                  <th className="px-4 py-3">Negocio</th>
                  <th className="px-4 py-3">Estado</th>
                  <th className="px-4 py-3">Directorio</th>
                  <th className="px-4 py-3">Promo</th>
                  <th className="px-4 py-3">Pedidos</th>
                  <th className="px-4 py-3">CTR</th>
                  <th className="px-4 py-3">Menu</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                      Cargando negocios…
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                      No hay negocios que coincidan con el filtro.
                    </td>
                  </tr>
                ) : (
                  filtered.map((business) => {
                    const busy = savingId === business.id;
                    const rowStats = promoStats.get(business.id);
                    return (
                      <tr key={business.id}>
                        <td className="px-4 py-3">
                          <Link
                            href={`/admin/negocios/${business.id}`}
                            className="font-semibold text-slate-950 hover:text-violet-700 hover:underline"
                          >
                            {business.nombre}
                          </Link>
                          <p className="text-xs text-slate-500">
                            {business.categoria || 'Sin categoria'}
                          </p>
                          <Link
                            href={`/admin/pedidos?businessId=${business.id}`}
                            className="mt-1 inline-flex text-[11px] font-bold text-violet-700 hover:underline"
                          >
                            Ver pedidos ({business.ordersTotal ?? 0})
                          </Link>
                        </td>
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            disabled={!canWrite || busy}
                            onClick={() =>
                              void patchBusiness(business.id, {
                                en_linea: !business.en_linea,
                              })
                            }
                            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold disabled:opacity-60 ${
                              business.en_linea
                                ? 'bg-emerald-50 text-emerald-700'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {business.en_linea ? (
                              <ToggleRight className="h-3.5 w-3.5" />
                            ) : (
                              <ToggleLeft className="h-3.5 w-3.5" />
                            )}
                            {business.en_linea ? 'En linea' : 'Offline'}
                          </button>
                        </td>
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            disabled={!canWrite || busy}
                            onClick={() =>
                              void patchBusiness(business.id, {
                                mostrar_en_directorio_publico:
                                  !business.mostrar_en_directorio_publico,
                              })
                            }
                            className={`rounded-full px-3 py-1.5 text-xs font-bold disabled:opacity-60 ${
                              business.mostrar_en_directorio_publico
                                ? 'bg-violet-50 text-violet-700'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {business.mostrar_en_directorio_publico ? 'Visible' : 'Oculto'}
                          </button>
                        </td>
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            disabled={!canWrite || busy}
                            onClick={() =>
                              void patchBusiness(business.id, {
                                promovido: !business.promovido,
                              })
                            }
                            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold disabled:opacity-60 ${
                              business.promovido
                                ? 'bg-[#6D28D9] text-white'
                                : 'border border-slate-200 bg-white text-slate-600'
                            }`}
                          >
                            <Megaphone className="h-3.5 w-3.5" />
                            {business.promovido ? 'On' : 'Off'}
                          </button>
                        </td>
                        <td className="px-4 py-3 text-xs font-semibold tabular-nums text-slate-700">
                          {business.ordersTotal ?? 0}
                        </td>
                        <td className="px-4 py-3 text-xs tabular-nums text-slate-600">
                          {business.promovido ? formatPct(rowStats?.ctr ?? 0) : '—'}
                        </td>
                        <td className="px-4 py-3">
                          <Link
                            href={business.menuUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-xs font-bold text-violet-700 hover:underline"
                          >
                            Ver
                            <ExternalLink className="h-3.5 w-3.5" />
                          </Link>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
