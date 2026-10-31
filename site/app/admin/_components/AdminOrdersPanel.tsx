'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  RefreshCw,
  Search,
  ShoppingCart,
  Square,
  X,
} from 'lucide-react';

import type { CurrentAdmin } from '../_lib/admin-auth';
import { AdminFilterBar, AdminFilterSelect } from './AdminFilterSelect';

type BusinessOption = {
  id: string;
  name: string;
};

type OrderListItem = {
  id: string;
  code: string;
  comercioId: string;
  businessName: string;
  customerName: string;
  customerPhone: string | null;
  status: string;
  statusLabel: string;
  managementMode: 'platform' | 'whatsapp_manual';
  amount: number;
  amountLabel: string;
  currency: string;
  usdEstimateLabel: string | null;
  paymentMethod: string | null;
  paymentReference: string | null;
  createdAt: string | null;
  createdLabel: string;
  archivedAt?: string | null;
  isArchived?: boolean;
};

type OrderDetail = OrderListItem & {
  customerEmail: string | null;
  deliveryMode: string | null;
  deliveryAddress: string | null;
  deliveryReference: string | null;
  deliveryInstructions: string | null;
  orderNotes: string | null;
  subtotalLabel: string | null;
  deliveryCostLabel: string | null;
  exchangeRate: number | null;
  baseAmountLabel: string | null;
  baseCurrency: string;
  items: Array<{
    name: string;
    quantity: number;
    unitPriceLabel: string | null;
    notes: string | null;
  }>;
  paymentMethodDetails: string[];
  comprobanteUrls: string[];
};

type ListPayload = {
  orders: OrderListItem[];
  total: number;
  limit: number;
  offset: number;
};

type AdminOrdersPanelProps = {
  admin: CurrentAdmin;
  businesses?: BusinessOption[];
  initialBusinessId?: string | null;
  initialBusinessName?: string | null;
  initialFrom?: string | null;
  initialTo?: string | null;
  initialQuery?: string | null;
  initialStatus?: string;
  initialArchived?: 'active' | 'archived' | 'all';
};

async function readJson<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(payload.error ?? 'No se pudo completar la operacion.');
  }
  return payload;
}

const STATUS_FILTERS = [
  ['all', 'Todos'],
  ['pendiente', 'Pendiente'],
  ['confirmado', 'Confirmado'],
  ['preparando', 'Preparando'],
  ['en_camino', 'En camino'],
  ['entregado', 'Entregado'],
  ['cancelado', 'Cancelado'],
] as const;

function isoToDateInput(value: string | null | undefined) {
  const raw = (value ?? '').trim();
  if (!raw) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

/** Exclusive ISO end (often next midnight) → inclusive date for <input type="date"> */
function isoToExclusiveEndDateInput(value: string | null | undefined) {
  const raw = (value ?? '').trim();
  if (!raw) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return '';
  if (
    date.getUTCHours() === 0 &&
    date.getUTCMinutes() === 0 &&
    date.getUTCSeconds() === 0 &&
    date.getUTCMilliseconds() === 0
  ) {
    return new Date(date.getTime() - 1).toISOString().slice(0, 10);
  }
  return date.toISOString().slice(0, 10);
}

function dayStartIso(dateValue: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) return null;
  return `${dateValue}T00:00:00.000Z`;
}

function dayEndExclusiveIso(dateValue: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) return null;
  const next = new Date(`${dateValue}T00:00:00.000Z`);
  if (Number.isNaN(next.getTime())) return null;
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString();
}

function formatFilterWindow(from: string | null, to: string | null) {
  if (!from && !to) return null;
  const start = from ? new Date(from) : null;
  const end = to ? new Date(to) : null;
  const fmt = (date: Date) =>
    date.toLocaleString('es-CO', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  if (start && !Number.isNaN(start.getTime()) && end && !Number.isNaN(end.getTime())) {
    return `${fmt(start)} → ${fmt(end)}`;
  }
  if (start && !Number.isNaN(start.getTime())) return `Desde ${fmt(start)}`;
  if (end && !Number.isNaN(end.getTime())) return `Hasta ${fmt(end)}`;
  return null;
}

export function AdminOrdersPanel({
  admin,
  businesses = [],
  initialBusinessId = null,
  initialBusinessName = null,
  initialFrom = null,
  initialTo = null,
  initialQuery = null,
  initialStatus = 'all',
  initialArchived = 'active',
}: AdminOrdersPanelProps) {
  const pathname = usePathname();
  const canArchive =
    admin.permissions.includes('orders.write') ||
    admin.permissions.includes('businesses.write');
  const [orders, setOrders] = useState<OrderListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState(initialQuery ?? '');
  const [debouncedQuery, setDebouncedQuery] = useState((initialQuery ?? '').trim());
  const [status, setStatus] = useState<string>(initialStatus || 'all');
  const [archived, setArchived] = useState<'active' | 'archived' | 'all'>(
    initialArchived || 'active',
  );
  const [businessId, setBusinessId] = useState<string | null>(initialBusinessId);
  const [fromIso, setFromIso] = useState<string | null>(initialFrom);
  const [toIso, setToIso] = useState<string | null>(initialTo);
  const [fromDate, setFromDate] = useState(() => isoToDateInput(initialFrom));
  const [toDate, setToDate] = useState(() => isoToExclusiveEndDateInput(initialTo));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<OrderDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkWorking, setBulkWorking] = useState(false);
  const limit = 40;

  const skipOffsetResetRef = useRef(true);
  const skipUrlSyncRef = useRef(true);

  const selectedBusinessName = useMemo(() => {
    if (!businessId) return null;
    return (
      businesses.find((row) => row.id === businessId)?.name ??
      initialBusinessName ??
      'negocio'
    );
  }, [businessId, businesses, initialBusinessName]);

  const businessOptions = useMemo(() => businesses.slice(0, 300), [businesses]);

  const windowLabel = useMemo(
    () => formatFilterWindow(fromIso, toIso),
    [fromIso, toIso],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedQuery(query.trim());
    }, 350);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (skipOffsetResetRef.current) {
      skipOffsetResetRef.current = false;
      return;
    }
    setOffset(0);
  }, [debouncedQuery, archived, status, businessId, fromIso, toIso]);

  useEffect(() => {
    setSelectedIds([]);
  }, [debouncedQuery, archived, status, offset, businessId, fromIso, toIso]);

  useEffect(() => {
    if (skipUrlSyncRef.current) {
      skipUrlSyncRef.current = false;
      return;
    }
    const params = new URLSearchParams();
    if (businessId) params.set('businessId', businessId);
    if (debouncedQuery.length >= 2) params.set('q', debouncedQuery);
    if (status && status !== 'all') params.set('status', status);
    if (archived && archived !== 'active') params.set('archived', archived);
    if (fromIso) params.set('from', fromIso);
    if (toIso) params.set('to', toIso);
    const qs = params.toString();
    const nextUrl = qs ? `${pathname}?${qs}` : pathname;
    if (typeof window !== 'undefined') {
      const current = `${window.location.pathname}${window.location.search}`;
      if (current !== nextUrl) {
        window.history.replaceState(window.history.state, '', nextUrl);
      }
    }
  }, [archived, businessId, debouncedQuery, fromIso, pathname, status, toIso]);

  const loadOrders = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('limit', String(limit));
      params.set('offset', String(offset));
      params.set('status', status);
      params.set('archived', archived);
      if (debouncedQuery.length >= 2) params.set('q', debouncedQuery);
      if (businessId) params.set('businessId', businessId);
      if (fromIso) params.set('from', fromIso);
      if (toIso) params.set('to', toIso);

      const response = await fetch(`/admin/api/pedidos?${params.toString()}`, {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store',
      });
      const payload = await readJson<{ ok: true; data: ListPayload }>(response);
      setOrders(payload.data.orders);
      setTotal(payload.data.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar pedidos.');
      setOrders([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [archived, businessId, debouncedQuery, fromIso, offset, status, toIso]);

  function applyDateFilters(nextFromDate: string, nextToDate: string) {
    setFromDate(nextFromDate);
    setToDate(nextToDate);
    setFromIso(nextFromDate ? dayStartIso(nextFromDate) : null);
    setToIso(nextToDate ? dayEndExclusiveIso(nextToDate) : null);
  }

  function clearFilters() {
    setQuery('');
    setDebouncedQuery('');
    setStatus('all');
    setArchived('active');
    setBusinessId(null);
    setFromIso(null);
    setToIso(null);
    setFromDate('');
    setToDate('');
    setOffset(0);
  }

  useEffect(() => {
    void loadOrders();
  }, [loadOrders]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }

    let cancelled = false;
    setDetailLoading(true);
    void (async () => {
      try {
        const response = await fetch(`/admin/api/pedidos/${selectedId}`, {
          method: 'GET',
          credentials: 'include',
          cache: 'no-store',
        });
        const payload = await readJson<{ ok: true; data: OrderDetail }>(response);
        if (!cancelled) setDetail(payload.data);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'No se pudo cargar el detalle.');
          setDetail(null);
        }
      } finally {
        if (!cancelled) setDetailLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  const pageLabel = useMemo(() => {
    if (total === 0) return '0 pedidos';
    const from = offset + 1;
    const to = Math.min(offset + orders.length, total);
    return `${from}–${to} de ${total}`;
  }, [offset, orders.length, total]);

  const canPrev = offset > 0;
  const canNext = offset + limit < total;

  const pageIds = useMemo(() => orders.map((order) => order.id), [orders]);
  const allPageSelected =
    pageIds.length > 0 && pageIds.every((id) => selectedIds.includes(id));
  const somePageSelected =
    pageIds.some((id) => selectedIds.includes(id)) && !allPageSelected;

  function toggleSelectAllPage() {
    if (allPageSelected) {
      setSelectedIds((prev) => prev.filter((id) => !pageIds.includes(id)));
      return;
    }
    setSelectedIds((prev) => [...new Set([...prev, ...pageIds])]);
  }

  function toggleSelectOne(orderId: string) {
    setSelectedIds((prev) =>
      prev.includes(orderId)
        ? prev.filter((id) => id !== orderId)
        : [...prev, orderId],
    );
  }

  async function bulkSetArchived(nextArchived: boolean) {
    if (!canArchive || bulkWorking || selectedIds.length === 0) return;
    const count = selectedIds.length;
    if (
      !window.confirm(
        nextArchived
          ? `Archivar ${count} pedido(s)? No se borran; se ocultan de la cola activa.`
          : `Recuperar ${count} pedido(s) a la cola activa?`,
      )
    ) {
      return;
    }

    setBulkWorking(true);
    setError(null);
    setStatusMessage(null);
    try {
      const response = await fetch('/admin/api/pedidos', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: selectedIds, archived: nextArchived }),
      });
      const payload = await readJson<{
        ok: true;
        data: { updated: number; skipped: number };
      }>(response);
      setSelectedIds([]);
      if (selectedId && selectedIds.includes(selectedId) && nextArchived && archived === 'active') {
        setSelectedId(null);
      }
      setStatusMessage(
        nextArchived
          ? `${payload.data.updated} pedido(s) archivados.`
          : `${payload.data.updated} pedido(s) recuperados.`,
      );
      await loadOrders();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'No se pudo completar la accion en lote.',
      );
    } finally {
      setBulkWorking(false);
    }
  }

  async function toggleArchive(nextArchived: boolean) {
    if (!detail || !canArchive || archiving) return;
    const verb = nextArchived ? 'archivar' : 'recuperar';
    if (
      !window.confirm(
        nextArchived
          ? 'Archivar este pedido? No se borra; solo se oculta de la cola activa. Se puede recuperar.'
          : 'Recuperar este pedido a la cola activa?',
      )
    ) {
      return;
    }

    setArchiving(true);
    setError(null);
    setStatusMessage(null);
    try {
      const response = await fetch(`/admin/api/pedidos/${detail.id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archived: nextArchived }),
      });
      const payload = await readJson<{ ok: true; data: OrderDetail }>(response);
      setDetail(payload.data);
      setStatusMessage(
        nextArchived
          ? 'Pedido archivado de forma segura (soft archive).'
          : 'Pedido recuperado a la cola activa.',
      );
      await loadOrders();
      if (archived === 'active' && nextArchived) {
        setSelectedId(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : `No se pudo ${verb} el pedido.`);
    } finally {
      setArchiving(false);
    }
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <section className="overflow-hidden rounded-2xl border border-slate-900/10 bg-[linear-gradient(135deg,#0f172a_0%,#1e1b4b_55%,#312e81_100%)] p-4 text-white sm:rounded-[2rem] sm:p-6 lg:p-8">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-black uppercase tracking-[0.16em] text-violet-200/70">
              Pedidos
            </p>
            <h1 className="mt-1 font-[var(--font-display)] text-2xl font-black tracking-[-0.04em] sm:mt-2 sm:text-3xl">
              {businessId
                ? selectedBusinessName || 'Negocio'
                : 'Cola de pedidos'}
            </h1>
            {windowLabel ? (
              <p className="mt-2 truncate text-xs font-bold text-violet-100/90">
                {windowLabel}
              </p>
            ) : (
              <p className="mt-1 hidden text-sm text-violet-100/80 sm:block">
                Filtra por restaurante, fechas, cliente o estado.
              </p>
            )}
          </div>
          <div className="flex shrink-0 gap-2">
            {businessId ? (
              <Link
                href={`/admin/negocios/${businessId}`}
                className="inline-flex h-10 items-center gap-1 rounded-xl border border-white/15 bg-white/10 px-3 text-xs font-bold hover:bg-white/15"
              >
                <ChevronLeft className="h-4 w-4" />
                <span className="hidden sm:inline">Negocio</span>
              </Link>
            ) : null}
            <button
              type="button"
              onClick={clearFilters}
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/15 bg-white/10 hover:bg-white/15"
              aria-label="Limpiar filtros"
            >
              <X className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => void loadOrders()}
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/15 bg-white/10 hover:bg-white/15"
              aria-label="Recargar"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </section>

      {(error || statusMessage) && (
        <div
          className={[
            'rounded-[1.35rem] border px-4 py-3 text-sm font-medium',
            error
              ? 'border-rose-200 bg-rose-50 text-rose-700'
              : 'border-emerald-200 bg-emerald-50 text-emerald-700',
          ].join(' ')}
        >
          {error ?? statusMessage}
        </div>
      )}

      <section className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_20px_60px_-40px_rgba(15,23,42,0.35)] sm:rounded-[1.8rem] sm:p-6">
        <div className="flex flex-col gap-3 sm:gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="font-[var(--font-display)] text-lg font-black tracking-[-0.03em] text-slate-950 sm:text-xl">
              Listado
            </h2>
            <p className="mt-1 text-xs text-slate-500 sm:text-sm">{pageLabel}</p>
          </div>
          <label className="relative w-full sm:min-w-[240px] sm:max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Cliente, telefono…"
              className="w-full rounded-xl border border-slate-200 py-2.5 pl-10 pr-4 text-sm text-slate-900 outline-none ring-violet-200 transition focus:ring-4 sm:rounded-[1rem] sm:py-3"
            />
          </label>
        </div>

        <AdminFilterBar className="mt-4">
          <AdminFilterSelect
            label="Restaurante"
            value={businessId ?? ''}
            onChange={(value) => setBusinessId(value.trim() || null)}
            className="sm:min-w-[14rem] lg:min-w-[16rem]"
            options={[
              { value: '', label: 'Todos los restaurantes' },
              ...(businessId &&
              !businessOptions.some((row) => row.id === businessId) &&
              selectedBusinessName
                ? [{ value: businessId, label: selectedBusinessName }]
                : []),
              ...businessOptions.map((row) => ({ value: row.id, label: row.name })),
            ]}
          />
          <AdminFilterSelect
            label="Estado"
            value={status}
            onChange={(value) => {
              setOffset(0);
              setStatus(value);
            }}
            options={STATUS_FILTERS.map(([value, label]) => ({ value, label }))}
          />
          <AdminFilterSelect
            label="Visibilidad"
            value={archived}
            onChange={(value) => {
              setOffset(0);
              setArchived(value as 'active' | 'archived' | 'all');
            }}
            options={[
              { value: 'active', label: 'Activos' },
              { value: 'archived', label: 'Archivados' },
              { value: 'all', label: 'Todos' },
            ]}
          />
          <AdminFilterSelect
            label="Rango rapido"
            value=""
            onChange={(value) => {
              if (value === 'clear') {
                applyDateFilters('', '');
                return;
              }
              const daysBack = Number(value);
              if (!Number.isFinite(daysBack)) return;
              const end = new Date();
              const start = new Date();
              start.setUTCDate(end.getUTCDate() - daysBack);
              applyDateFilters(
                start.toISOString().slice(0, 10),
                end.toISOString().slice(0, 10),
              );
            }}
            options={[
              { value: '', label: fromDate || toDate ? 'Personalizado' : 'Elegir…' },
              { value: '0', label: 'Hoy' },
              { value: '6', label: 'Ultimos 7 dias' },
              { value: '29', label: 'Ultimos 30 dias' },
              { value: 'clear', label: 'Sin fechas' },
            ]}
          />
        </AdminFilterBar>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block min-w-0">
            <span className="mb-1 block text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
              Desde
            </span>
            <input
              type="date"
              value={fromDate}
              onChange={(event) => {
                const nextFrom = event.target.value;
                const nextTo = toDate && nextFrom && toDate < nextFrom ? nextFrom : toDate;
                applyDateFilters(nextFrom, nextTo);
              }}
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold text-slate-900 outline-none ring-violet-200 focus:ring-4"
            />
          </label>
          <label className="block min-w-0">
            <span className="mb-1 block text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
              Hasta
            </span>
            <input
              type="date"
              value={toDate}
              onChange={(event) => {
                const nextTo = event.target.value;
                const nextFrom =
                  fromDate && nextTo && fromDate > nextTo ? nextTo : fromDate;
                applyDateFilters(nextFrom, nextTo);
              }}
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold text-slate-900 outline-none ring-violet-200 focus:ring-4"
            />
          </label>
        </div>

        {canArchive ? (
          <div className="mt-4 flex flex-wrap items-center gap-2 rounded-[1.2rem] border border-violet-200 bg-violet-50 px-4 py-3">
            <p className="text-sm font-bold text-violet-900">
              {selectedIds.length > 0
                ? `${selectedIds.length} seleccionado${selectedIds.length === 1 ? '' : 's'}`
                : 'Acciones en lote'}
            </p>
            <button
              type="button"
              disabled={bulkWorking || orders.length === 0}
              onClick={toggleSelectAllPage}
              className="rounded-full border border-violet-300 bg-white px-3.5 py-1.5 text-xs font-bold text-violet-800 disabled:opacity-50"
            >
              {allPageSelected ? 'Quitar pagina' : 'Seleccionar pagina'}
            </button>
            <button
              type="button"
              disabled={bulkWorking || selectedIds.length === 0}
              onClick={() => void bulkSetArchived(true)}
              className="rounded-full bg-slate-900 px-3.5 py-1.5 text-xs font-bold text-white disabled:opacity-40"
            >
              {bulkWorking ? 'Procesando…' : 'Archivar'}
            </button>
            <button
              type="button"
              disabled={bulkWorking || selectedIds.length === 0}
              onClick={() => void bulkSetArchived(false)}
              className="rounded-full border border-slate-300 bg-white px-3.5 py-1.5 text-xs font-bold text-slate-700 disabled:opacity-40"
            >
              Recuperar
            </button>
            {selectedIds.length > 0 ? (
              <button
                type="button"
                disabled={bulkWorking}
                onClick={() => setSelectedIds([])}
                className="rounded-full px-3 py-1.5 text-xs font-bold text-violet-700 hover:underline disabled:opacity-50"
              >
                Limpiar
              </button>
            ) : (
              <p className="text-xs text-violet-700/80">
                Usa la columna izquierda para marcar pedidos.
              </p>
            )}
          </div>
        ) : (
          <div className="mt-4 rounded-[1.2rem] border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
            Tu rol puede ver pedidos, pero no archivarlos en lote.
          </div>
        )}

        {/* Mobile compact cards */}
        <div className="mt-4 space-y-2 lg:hidden">
          {loading ? (
            <p className="py-8 text-center text-sm text-slate-500">Cargando…</p>
          ) : orders.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">Sin pedidos.</p>
          ) : (
            orders.map((order) => {
              const isChecked = selectedIds.includes(order.id);
              return (
                <div
                  key={order.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedId(order.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      setSelectedId(order.id);
                    }
                  }}
                  className={`rounded-xl border px-3 py-3 ${
                    isChecked
                      ? 'border-violet-300 bg-violet-50/80'
                      : 'border-slate-200 bg-slate-50/70'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    {canArchive ? (
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          toggleSelectOne(order.id);
                        }}
                        aria-label={`Seleccionar ${order.code}`}
                        className={[
                          'mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border-2',
                          isChecked
                            ? 'border-violet-600 bg-violet-600 text-white'
                            : 'border-slate-300 bg-white text-slate-400',
                        ].join(' ')}
                      >
                        {isChecked ? (
                          <Check className="h-3.5 w-3.5" strokeWidth={3} />
                        ) : (
                          <Square className="h-3 w-3" />
                        )}
                      </button>
                    ) : null}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate font-bold text-slate-950">{order.code}</p>
                          <p className="truncate text-[11px] text-slate-500">
                            {order.customerName}
                            {!businessId ? ` · ${order.businessName}` : ''}
                          </p>
                        </div>
                        <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-700">
                          {order.statusLabel}
                        </span>
                      </div>
                      <div className="mt-1.5 flex items-baseline justify-between gap-2">
                        <p className="text-sm font-semibold tabular-nums text-slate-950">
                          {order.amountLabel}
                          <span className="ml-1 text-[10px] font-bold text-slate-500">
                            {order.currency}
                          </span>
                        </p>
                        <p className="text-[10px] text-slate-500">{order.createdLabel}</p>
                      </div>
                    </div>
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
                  {canArchive ? (
                    <th className="sticky left-0 z-10 w-14 bg-slate-50 px-2 py-3">
                      <button
                        type="button"
                        onClick={toggleSelectAllPage}
                        aria-label="Seleccionar todos en esta pagina"
                        className={[
                          'inline-flex h-8 w-8 items-center justify-center rounded-lg border-2 transition',
                          allPageSelected
                            ? 'border-violet-600 bg-violet-600 text-white'
                            : somePageSelected
                              ? 'border-violet-500 bg-violet-100 text-violet-700'
                              : 'border-slate-300 bg-white text-slate-400 hover:border-violet-400',
                        ].join(' ')}
                      >
                        {allPageSelected || somePageSelected ? (
                          <Check className="h-4 w-4" strokeWidth={3} />
                        ) : (
                          <Square className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </th>
                  ) : null}
                  <th className="px-4 py-3">Pedido</th>
                  {!businessId ? <th className="px-4 py-3">Negocio</th> : null}
                  <th className="px-4 py-3">Cliente</th>
                  <th className="px-4 py-3">Estado</th>
                  <th className="px-4 py-3">Moneda</th>
                  <th className="px-4 py-3">Total</th>
                  <th className="px-4 py-3">Cuando</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {loading ? (
                  <tr>
                    <td
                      colSpan={(businessId ? 6 : 7) + (canArchive ? 1 : 0)}
                      className="px-4 py-8 text-center text-slate-500"
                    >
                      Cargando pedidos…
                    </td>
                  </tr>
                ) : orders.length === 0 ? (
                  <tr>
                    <td
                      colSpan={(businessId ? 6 : 7) + (canArchive ? 1 : 0)}
                      className="px-4 py-8 text-center text-slate-500"
                    >
                      No hay pedidos para este filtro.
                    </td>
                  </tr>
                ) : (
                  orders.map((order) => {
                    const isChecked = selectedIds.includes(order.id);
                    return (
                      <tr
                        key={order.id}
                        className={`cursor-pointer align-top hover:bg-violet-50/40 ${
                          isChecked ? 'bg-violet-50/70' : ''
                        }`}
                        onClick={() => setSelectedId(order.id)}
                      >
                        {canArchive ? (
                          <td
                            className={`sticky left-0 z-10 px-2 py-3 ${
                              isChecked ? 'bg-violet-50' : 'bg-white'
                            }`}
                            onClick={(event) => event.stopPropagation()}
                          >
                            <button
                              type="button"
                              onClick={() => toggleSelectOne(order.id)}
                              aria-label={`Seleccionar ${order.code}`}
                              aria-pressed={isChecked}
                              className={[
                                'inline-flex h-8 w-8 items-center justify-center rounded-lg border-2 transition',
                                isChecked
                                  ? 'border-violet-600 bg-violet-600 text-white'
                                  : 'border-slate-300 bg-white text-slate-400 hover:border-violet-400',
                              ].join(' ')}
                            >
                              {isChecked ? (
                                <Check className="h-4 w-4" strokeWidth={3} />
                              ) : (
                                <Square className="h-3.5 w-3.5" />
                              )}
                            </button>
                          </td>
                        ) : null}
                        <td className="px-4 py-4">
                          <p className="font-semibold text-slate-950">{order.code}</p>
                          <p className="mt-0.5 text-xs text-slate-500">
                            {order.paymentMethod || 'Sin metodo'}
                          </p>
                        </td>
                        {!businessId ? (
                          <td className="px-4 py-4">
                            <Link
                              href={`/admin/negocios/${order.comercioId}`}
                              onClick={(event) => event.stopPropagation()}
                              className="font-semibold text-violet-700 hover:underline"
                            >
                              {order.businessName}
                            </Link>
                          </td>
                        ) : null}
                        <td className="px-4 py-4">
                          <p className="font-medium text-slate-900">{order.customerName}</p>
                          <p className="text-xs text-slate-500">
                            {order.customerPhone || 'Sin telefono'}
                          </p>
                        </td>
                        <td className="px-4 py-4">
                          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700">
                            {order.statusLabel}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-xs font-bold text-slate-600">
                          {order.currency}
                        </td>
                        <td className="px-4 py-4">
                          <p className="font-semibold tabular-nums text-slate-950">
                            {order.amountLabel}
                          </p>
                          {order.usdEstimateLabel ? (
                            <p className="text-xs text-slate-500">≈ {order.usdEstimateLabel}</p>
                          ) : null}
                        </td>
                        <td className="px-4 py-4 text-xs text-slate-500">{order.createdLabel}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between">
          <button
            type="button"
            disabled={!canPrev || loading}
            onClick={() => setOffset((value) => Math.max(0, value - limit))}
            className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700 disabled:opacity-40"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Anterior
          </button>
          <button
            type="button"
            disabled={!canNext || loading}
            onClick={() => setOffset((value) => value + limit)}
            className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700 disabled:opacity-40"
          >
            Siguiente
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </section>

      {selectedId ? (
        <div className="fixed inset-0 z-40 flex justify-end bg-slate-950/40 p-0 sm:p-4">
          <button
            type="button"
            aria-label="Cerrar detalle"
            className="absolute inset-0 cursor-default"
            onClick={() => setSelectedId(null)}
          />
          <aside className="relative z-10 flex h-full w-full max-w-lg flex-col overflow-hidden bg-white shadow-2xl sm:rounded-[1.5rem]">
            <div className="flex items-start justify-between border-b border-slate-200 px-5 py-4">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">
                  Detalle del pedido
                </p>
                <h3 className="mt-1 font-[var(--font-display)] text-xl font-black text-slate-950">
                  {detail?.code ?? '…'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedId(null)}
                className="rounded-full border border-slate-200 p-2 text-slate-500 hover:bg-slate-50"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4">
              {detailLoading || !detail ? (
                <p className="text-sm text-slate-500">Cargando detalle…</p>
              ) : (
                <div className="space-y-5 text-sm">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Info label="Estado" value={detail.statusLabel} />
                    <Info
                      label="Archivo"
                      value={detail.isArchived ? 'Archivado' : 'Activo'}
                    />
                    <Info label="Negocio" value={detail.businessName} />
                    <Info label="Cliente" value={detail.customerName} />
                    <Info label="Telefono" value={detail.customerPhone || '—'} />
                    <Info label="Email" value={detail.customerEmail || '—'} />
                    <Info label="Creado" value={detail.createdLabel} />
                  </div>

                  {canArchive ? (
                    <button
                      type="button"
                      disabled={archiving}
                      onClick={() => void toggleArchive(!detail.isArchived)}
                      className="w-full rounded-[1rem] border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
                    >
                      {archiving
                        ? 'Guardando…'
                        : detail.isArchived
                          ? 'Recuperar pedido'
                          : 'Archivar pedido'}
                    </button>
                  ) : null}

                  <div className="rounded-[1.25rem] border border-violet-100 bg-violet-50/70 p-4">
                    <p className="text-[11px] font-black uppercase tracking-[0.14em] text-violet-700">
                      Totales
                    </p>
                    <p className="mt-2 text-2xl font-black text-slate-950">{detail.amountLabel}</p>
                    <p className="mt-1 text-xs text-slate-600">
                      Checkout {detail.currency}
                      {detail.usdEstimateLabel ? ` · ≈ ${detail.usdEstimateLabel}` : ''}
                    </p>
                    {detail.baseAmountLabel ? (
                      <p className="mt-1 text-xs text-slate-500">
                        Base menu: {detail.baseAmountLabel} ({detail.baseCurrency})
                        {detail.exchangeRate != null
                          ? ` · tasa ${detail.exchangeRate}`
                          : ''}
                      </p>
                    ) : null}
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      <Info label="Subtotal" value={detail.subtotalLabel || '—'} />
                      <Info label="Delivery" value={detail.deliveryCostLabel || '—'} />
                    </div>
                  </div>

                  <div>
                    <p className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">
                      Pago
                    </p>
                    <p className="mt-2 font-semibold text-slate-900">
                      {detail.paymentMethod || 'Sin metodo'}
                    </p>
                    {detail.paymentReference ? (
                      <p className="text-xs text-slate-500">Ref: {detail.paymentReference}</p>
                    ) : null}
                    {detail.paymentMethodDetails.length > 0 ? (
                      <ul className="mt-2 space-y-1 text-xs text-slate-600">
                        {detail.paymentMethodDetails.map((line) => (
                          <li key={line}>{line}</li>
                        ))}
                      </ul>
                    ) : null}
                    {detail.comprobanteUrls.length > 0 ? (
                      <ComprobanteButtons orderId={detail.id} count={detail.comprobanteUrls.length} />
                    ) : null}
                  </div>

                  {(detail.deliveryAddress || detail.deliveryMode) && (
                    <div>
                      <p className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">
                        Entrega
                      </p>
                      <p className="mt-2 text-slate-800">
                        {detail.deliveryMode || 'Delivery'} ·{' '}
                        {detail.deliveryAddress || 'Sin direccion'}
                      </p>
                      {detail.deliveryReference ? (
                        <p className="text-xs text-slate-500">Ref: {detail.deliveryReference}</p>
                      ) : null}
                      {detail.deliveryInstructions ? (
                        <p className="mt-1 text-xs text-slate-600">{detail.deliveryInstructions}</p>
                      ) : null}
                    </div>
                  )}

                  {detail.orderNotes ? (
                    <div>
                      <p className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">
                        Notas
                      </p>
                      <p className="mt-2 text-slate-700">{detail.orderNotes}</p>
                    </div>
                  ) : null}

                  <div>
                    <p className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">
                      Items ({detail.items.length})
                    </p>
                    <ul className="mt-2 divide-y divide-slate-100 rounded-[1.1rem] border border-slate-200">
                      {detail.items.length === 0 ? (
                        <li className="px-3 py-3 text-slate-500">Sin items parseables.</li>
                      ) : (
                        detail.items.map((item, index) => (
                          <li key={`${item.name}-${index}`} className="px-3 py-3">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="font-semibold text-slate-900">
                                  {item.quantity}× {item.name}
                                </p>
                                {item.notes ? (
                                  <p className="text-xs text-slate-500">{item.notes}</p>
                                ) : null}
                              </div>
                              <p className="text-xs font-bold tabular-nums text-slate-700">
                                {item.unitPriceLabel || '—'}
                              </p>
                            </div>
                          </li>
                        ))
                      )}
                    </ul>
                  </div>

                  <Link
                    href={`/admin/negocios/${detail.comercioId}`}
                    className="inline-flex items-center gap-2 rounded-[1rem] bg-violet-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-violet-500"
                  >
                    <ShoppingCart className="h-4 w-4" />
                    Abrir ficha del negocio
                  </Link>
                </div>
              )}
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[1rem] border border-slate-200 bg-slate-50/80 px-3 py-2">
      <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">{label}</p>
      <p className="mt-1 font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function ComprobanteButtons({ orderId, count }: { orderId: string; count: number }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function openComprobantes() {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/admin/api/pedidos/${orderId}/comprobantes`, {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store',
      });
      const payload = await readJson<{
        ok: true;
        data: {
          publicUrl: string | null;
          items: Array<{ label: string; url: string }>;
        };
      }>(response);

      const target =
        payload.data.publicUrl ||
        payload.data.items[0]?.url ||
        null;
      if (!target) {
        throw new Error('No hay URL de comprobante disponible.');
      }

      // Prefer /p/{code} (multi-proof viewer). Else short-lived signed storage URL.
      window.open(target, '_blank', 'noopener,noreferrer');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo abrir el comprobante.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-2 space-y-1">
      <button
        type="button"
        onClick={() => void openComprobantes()}
        disabled={loading}
        className="inline-flex items-center gap-1 text-xs font-bold text-violet-700 hover:underline disabled:opacity-50"
      >
        {loading
          ? 'Abriendo…'
          : count > 1
            ? `Ver comprobantes (${count})`
            : 'Comprobante'}
        <ExternalLink className="h-3 w-3" />
      </button>
      {error ? <p className="text-xs text-rose-600">{error}</p> : null}
    </div>
  );
}
