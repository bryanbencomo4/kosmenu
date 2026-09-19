'use client';

import { useCallback, useEffect, useState } from 'react';
import { Landmark, RefreshCw, Search } from 'lucide-react';

import { BDV_EVENT_LABELS, BDV_PAYMENT_STATUSES, bdvStatusClassName, formatBdvAmount } from '../_lib/admin-bdv';
import type { CurrentAdmin } from '../_lib/admin-auth';
import { canReviewPayments } from '../_lib/admin-billing';

type BdvPayment = {
  id: string;
  payment_id: string;
  amount: number | string | null;
  currency: string;
  reference: string | null;
  operation_number: string | null;
  sender_phone: string | null;
  sender_name: string | null;
  bank_date: string | null;
  bank_time: string | null;
  raw_text: string | null;
  status: string;
  match_reason: string | null;
  created_at: string;
  updated_at: string;
  business_name: string | null;
  order_label: string | null;
  matched_order_id: string | null;
  device_id: string | null;
  plan_name?: string | null;
  plan_code?: string | null;
  months?: number | null;
  activated_at?: string | null;
  processed_by?: string | null;
};

type BdvEvent = {
  id: string;
  event_type: string;
  payload: Record<string, unknown> | null;
  processing_error: string | null;
  created_at: string;
};

type PendingOrder = {
  id: string;
  business_id: string;
  amount_usd: number;
  expected_amount_ves: number | null;
  expected_phone: string | null;
  reference: string | null;
  status: string;
  months: number;
  created_at: string;
  business_name: string | null;
};

type BusinessOption = { id: string; nombre: string; slug: string | null };

async function readJson<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(payload.error ?? 'No se pudo completar la operacion.');
  }
  return payload;
}

function dash(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : '—';
}

function formatWhen(value: string | null | undefined) {
  if (!value) return '—';
  return new Date(value).toLocaleString('es-VE');
}

export function AdminBdvPaymentsPanel({ admin }: { admin: CurrentAdmin }) {
  const canReview = canReviewPayments(admin.role);
  const [rows, setRows] = useState<BdvPayment[]>([]);
  const [pendingOrders, setPendingOrders] = useState<PendingOrder[]>([]);
  const [businesses, setBusinesses] = useState<BusinessOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reference, setReference] = useState('');
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [status, setStatus] = useState('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<BdvPayment | null>(null);
  const [events, setEvents] = useState<BdvEvent[]>([]);
  const [assignOrderId, setAssignOrderId] = useState('');
  const [rejectNote, setRejectNote] = useState('');
  const [newBusinessId, setNewBusinessId] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (reference.trim()) params.set('reference', reference.trim());
      if (phone.trim()) params.set('phone', phone.trim());
      if (name.trim()) params.set('name', name.trim());
      if (status) params.set('status', status);
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      const response = await fetch(`/admin/api/billing/bdv?${params.toString()}`, {
        credentials: 'include',
        cache: 'no-store',
      });
      const payload = await readJson<{
        ok: true;
        data: BdvPayment[];
        businesses: BusinessOption[];
        pending_orders: PendingOrder[];
      }>(response);
      setRows(payload.data);
      setBusinesses(payload.businesses);
      setPendingOrders(payload.pending_orders);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'No se pudieron cargar los pagos BDV.');
    } finally {
      setLoading(false);
    }
  }, [from, name, phone, reference, status, to]);

  const loadDetail = useCallback(async (id: string) => {
    const response = await fetch(`/admin/api/billing/bdv?id=${id}`, { credentials: 'include', cache: 'no-store' });
    const payload = await readJson<{
      ok: true;
      payment: BdvPayment;
      events: BdvEvent[];
      pending_orders: PendingOrder[];
    }>(response);
    setDetail(payload.payment);
    setEvents(payload.events);
    setPendingOrders(payload.pending_orders);
    setAssignOrderId('');
    setRejectNote('');
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function openDetail(id: string) {
    setSelectedId(id);
    setError(null);
    try {
      await loadDetail(id);
    } catch (detailError) {
      setError(detailError instanceof Error ? detailError.message : 'No se pudo abrir el pago.');
    }
  }

  async function runAction(body: Record<string, unknown>) {
    if (!canReview) return;
    setSaving(true);
    setError(null);
    try {
      await readJson(
        await fetch('/admin/api/billing/bdv', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }),
      );
      await load();
      if (selectedId) {
        await loadDetail(selectedId);
      }
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'No se pudo completar la accion.');
    } finally {
      setSaving(false);
    }
  }

  const selectedCanAct = canReview && detail && detail.status !== 'CONFIRMED';

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(139,92,246,0.24),transparent_34%),linear-gradient(180deg,#101226_0%,#171a3d_100%)] px-6 py-7 text-white shadow-[0_30px_80px_-48px_rgba(15,23,42,0.9)] sm:px-8">
        <p className="inline-flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.18em] text-violet-200/70">
          <Landmark className="h-4 w-4" />
          Banco de Venezuela
        </p>
        <h1 className="mt-2 font-[var(--font-display)] text-3xl font-black tracking-[-0.04em] sm:text-4xl">Pagos BDV</h1>
        <p className="mt-3 max-w-2xl text-sm leading-7 text-violet-100/80">
          Monitorea todos los pagos recibidos por BDV Payment Bridge. El matching y la activacion automatica no cambian
          aqui: esta vista sirve para revisar, reprocesar y asociar a mano cuando haga falta.
        </p>
      </section>

      {error ? (
        <div className="rounded-[1.35rem] border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
          {error}
        </div>
      ) : null}

      <section className="rounded-[1.8rem] border border-slate-200/80 bg-white p-6 shadow-[0_20px_60px_-40px_rgba(15,23,42,0.35)]">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="font-[var(--font-display)] text-xl font-black tracking-[-0.03em] text-slate-950">Filtros</h2>
            <p className="mt-1 text-sm text-slate-500">Busca por los datos que manda el Bridge, no por el comercio.</p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center justify-center gap-2 rounded-[1rem] border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Recargar
          </button>
        </div>

        <form
          className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-6"
          onSubmit={(event) => {
            event.preventDefault();
            void load();
          }}
        >
          <label className="block">
            <span className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-400">Referencia</span>
            <span className="relative mt-2 block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={reference}
                onChange={(event) => setReference(event.target.value)}
                placeholder="Ref BDV"
                className="w-full rounded-[1rem] border border-slate-200 py-3 pl-10 pr-3 text-sm outline-none ring-violet-200 focus:ring-4"
              />
            </span>
          </label>
          <label className="block">
            <span className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-400">Telefono</span>
            <input
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="Emisor"
              className="mt-2 w-full rounded-[1rem] border border-slate-200 px-3 py-3 text-sm outline-none ring-violet-200 focus:ring-4"
            />
          </label>
          <label className="block">
            <span className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-400">Nombre</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Pagador"
              className="mt-2 w-full rounded-[1rem] border border-slate-200 px-3 py-3 text-sm outline-none ring-violet-200 focus:ring-4"
            />
          </label>
          <label className="block">
            <span className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-400">Estado</span>
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              className="mt-2 w-full rounded-[1rem] border border-slate-200 px-3 py-3 text-sm outline-none ring-violet-200 focus:ring-4"
            >
              <option value="all">Todos</option>
              {BDV_PAYMENT_STATUSES.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-400">Desde</span>
            <input
              type="date"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
              className="mt-2 w-full rounded-[1rem] border border-slate-200 px-3 py-3 text-sm outline-none ring-violet-200 focus:ring-4"
            />
          </label>
          <label className="block">
            <span className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-400">Hasta</span>
            <input
              type="date"
              value={to}
              onChange={(event) => setTo(event.target.value)}
              className="mt-2 w-full rounded-[1rem] border border-slate-200 px-3 py-3 text-sm outline-none ring-violet-200 focus:ring-4"
            />
          </label>
          <div className="md:col-span-2 xl:col-span-6">
            <button type="submit" className="rounded-full bg-violet-600 px-4 py-2 text-sm font-semibold text-white">
              Aplicar filtros
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-[1.8rem] border border-slate-200/80 bg-white p-6 shadow-[0_20px_60px_-40px_rgba(15,23,42,0.35)]">
        <h2 className="font-[var(--font-display)] text-xl font-black tracking-[-0.03em] text-slate-950">
          Pagos recibidos
        </h2>
        <p className="mt-1 text-sm text-slate-500">{rows.length} registro{rows.length === 1 ? '' : 's'} en esta vista.</p>
        <div className="mt-5 overflow-hidden rounded-[1.35rem] border border-slate-200">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">
                <tr>
                  <th className="px-4 py-3">Fecha de recepcion</th>
                  <th className="px-4 py-3">Monto (Bs)</th>
                  <th className="px-4 py-3">Referencia BDV</th>
                  <th className="px-4 py-3">Operacion</th>
                  <th className="px-4 py-3">Telefono emisor</th>
                  <th className="px-4 py-3">Nombre emisor</th>
                  <th className="px-4 py-3">Estado</th>
                  <th className="px-4 py-3">Pedido asociado</th>
                  <th className="px-4 py-3">Restaurante</th>
                  <th className="px-4 py-3">Accion</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {loading ? (
                  <tr>
                    <td colSpan={10} className="px-4 py-8 text-center text-slate-500">
                      Cargando pagos…
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-4 py-8 text-center text-slate-500">
                      No hay pagos BDV con esos filtros.
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => (
                    <tr
                      key={row.id}
                      className={selectedId === row.id ? 'bg-violet-50/80' : 'hover:bg-slate-50'}
                    >
                      <td className="whitespace-nowrap px-4 py-3 text-slate-600">{formatWhen(row.created_at)}</td>
                      <td className="whitespace-nowrap px-4 py-3 font-semibold text-slate-950">
                        {formatBdvAmount(row.amount)}
                      </td>
                      <td className="px-4 py-3">{dash(row.reference)}</td>
                      <td className="px-4 py-3">{dash(row.operation_number)}</td>
                      <td className="px-4 py-3">{dash(row.sender_phone)}</td>
                      <td className="px-4 py-3">{dash(row.sender_name)}</td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-3 py-1 text-[11px] font-bold uppercase ${bdvStatusClassName(row.status)}`}>
                          {row.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">{dash(row.order_label)}</td>
                      <td className="px-4 py-3">{dash(row.business_name)}</td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => void openDetail(row.id)}
                          className="text-sm font-semibold text-violet-700"
                        >
                          Ver detalle
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {detail ? (
        <section className="rounded-[1.8rem] border border-slate-200/80 bg-white p-6 shadow-[0_20px_60px_-40px_rgba(15,23,42,0.35)]">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-400">Detalle de pago</p>
              <h2 className="mt-1 font-[var(--font-display)] text-xl font-black text-slate-950">{detail.payment_id}</h2>
            </div>
            <span className={`rounded-full px-3 py-1 text-[11px] font-bold uppercase ${bdvStatusClassName(detail.status)}`}>
              {detail.status}
            </span>
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <article className="rounded-[1.2rem] border border-slate-200 p-4">
              <h3 className="font-bold text-slate-900">Informacion BDV</h3>
              <dl className="mt-3 space-y-2 text-sm">
                <DetailRow label="payment_id" value={detail.payment_id} />
                <DetailRow label="Monto" value={`Bs. ${formatBdvAmount(detail.amount)}`} />
                <DetailRow label="Moneda" value={dash(detail.currency)} />
                <DetailRow label="Referencia" value={dash(detail.reference)} />
                <DetailRow label="Operacion" value={dash(detail.operation_number)} />
                <DetailRow label="Telefono" value={dash(detail.sender_phone)} />
                <DetailRow label="Nombre" value={dash(detail.sender_name)} />
                <DetailRow label="Fecha banco" value={dash(detail.bank_date)} />
                <DetailRow label="Hora banco" value={dash(detail.bank_time)} />
              </dl>
              <p className="mt-4 text-[11px] font-black uppercase tracking-[0.14em] text-slate-400">Texto original</p>
              <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded-[1rem] bg-slate-950 p-3 text-xs text-emerald-100">
                {detail.raw_text || 'Sin raw_text'}
              </pre>
            </article>

            <article className="rounded-[1.2rem] border border-slate-200 p-4">
              <h3 className="font-bold text-slate-900">Informacion del sistema</h3>
              <dl className="mt-3 space-y-2 text-sm">
                <DetailRow label="Orden asociada" value={dash(detail.order_label)} />
                <DetailRow label="Restaurante" value={dash(detail.business_name)} />
                <DetailRow
                  label="Plan comprado"
                  value={detail.plan_name ? `${detail.plan_name}${detail.months ? ` · ${detail.months} mes${detail.months === 1 ? '' : 'es'}` : ''}` : '—'}
                />
                <DetailRow label="Fecha de activacion" value={formatWhen(detail.activated_at)} />
                <DetailRow label="Dispositivo Bridge" value={dash(detail.device_id)} />
                <DetailRow label="Usuario que proceso" value={dash(detail.processed_by)} />
                <DetailRow label="Motivo de match" value={dash(detail.match_reason)} />
              </dl>
            </article>
          </div>

          {canReview ? (
            <div className="mt-6 grid gap-4 lg:grid-cols-3">
              <article className="rounded-[1.2rem] border border-slate-200 p-4">
                <h3 className="font-bold text-slate-900">Reprocesar pago</h3>
                <p className="mt-1 text-sm text-slate-500">Vuelve a correr el matching y, si hay orden, la activacion.</p>
                <button
                  type="button"
                  disabled={saving || detail.status === 'CONFIRMED'}
                  onClick={() => void runAction({ action: 'reprocess', id: detail.id })}
                  className="mt-3 rounded-full bg-violet-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  Reprocesar
                </button>
              </article>
              <article className="rounded-[1.2rem] border border-slate-200 p-4">
                <h3 className="font-bold text-slate-900">Asociar manualmente</h3>
                <p className="mt-1 text-sm text-slate-500">Vincula este pago a una orden pendiente y activa el plan.</p>
                <select
                  value={assignOrderId}
                  onChange={(event) => setAssignOrderId(event.target.value)}
                  disabled={!selectedCanAct}
                  className="mt-3 w-full rounded-[1rem] border border-slate-200 px-3 py-2 text-sm"
                >
                  <option value="">Selecciona una orden pendiente</option>
                  {pendingOrders.map((order) => (
                    <option key={order.id} value={order.id}>
                      {order.business_name ?? order.business_id} · ${order.amount_usd}
                      {order.expected_amount_ves != null ? ` · Bs. ${order.expected_amount_ves}` : ''}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={saving || !assignOrderId || !selectedCanAct}
                  onClick={() => void runAction({ action: 'assign_order', id: detail.id, order_id: assignOrderId })}
                  className="mt-3 rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  Vincular y activar
                </button>
              </article>
              <article className="rounded-[1.2rem] border border-slate-200 p-4">
                <h3 className="font-bold text-slate-900">Marcar como rechazado</h3>
                <textarea
                  value={rejectNote}
                  onChange={(event) => setRejectNote(event.target.value)}
                  disabled={!selectedCanAct}
                  placeholder="Motivo del rechazo"
                  className="mt-3 min-h-20 w-full rounded-[1rem] border border-slate-200 px-3 py-2 text-sm"
                />
                <button
                  type="button"
                  disabled={saving || rejectNote.trim().length < 3 || !selectedCanAct}
                  onClick={() => void runAction({ action: 'reject', id: detail.id, note: rejectNote.trim() })}
                  className="mt-3 rounded-full border border-rose-200 px-4 py-2 text-sm font-semibold text-rose-700 disabled:opacity-50"
                >
                  Rechazar
                </button>
              </article>
            </div>
          ) : (
            <p className="mt-4 text-sm text-amber-800">Tu rol puede consultar pagos, pero no reprocesar ni rechazar.</p>
          )}

          <article className="mt-6 rounded-[1.2rem] border border-slate-200 p-4">
            <h3 className="font-bold text-slate-900">Historial de eventos</h3>
            {events.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">
                Todavia no hay filas en payment_events para este pago. Los nuevos ingresos del Bridge quedaran
                registrados aqui.
              </p>
            ) : (
              <ol className="mt-3 space-y-3">
                {events.map((event) => (
                  <li key={event.id} className="rounded-[1rem] bg-slate-50 px-3 py-2">
                    <p className="text-sm font-semibold text-slate-900">
                      {BDV_EVENT_LABELS[event.event_type] ?? event.event_type}
                    </p>
                    <p className="text-xs text-slate-500">{formatWhen(event.created_at)}</p>
                    {event.processing_error ? (
                      <p className="mt-1 text-sm text-rose-700">{event.processing_error}</p>
                    ) : null}
                  </li>
                ))}
              </ol>
            )}
          </article>
        </section>
      ) : null}

      {canReview ? (
        <section className="rounded-[1.8rem] border border-slate-200/80 bg-white p-6">
          <h2 className="font-[var(--font-display)] text-xl font-black">Orden pendiente de prueba</h2>
          <p className="mt-1 text-sm text-slate-500">
            Crea una orden para poder asociar un pago recibido. No cambia el matching automatico.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <select
              value={newBusinessId}
              onChange={(event) => setNewBusinessId(event.target.value)}
              className="min-w-[16rem] flex-1 rounded-[1rem] border border-slate-200 px-3 py-2 text-sm"
            >
              <option value="">Selecciona un negocio</option>
              {businesses.map((business) => (
                <option key={business.id} value={business.id}>
                  {business.nombre}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={saving || !newBusinessId}
              onClick={() => void runAction({ action: 'create_order', business_id: newBusinessId, months: 1 })}
              className="rounded-full bg-violet-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              Crear orden
            </button>
          </div>
          {pendingOrders.length > 0 ? (
            <div className="mt-4 space-y-1">
              {pendingOrders.map((order) => (
                <p key={order.id} className="text-sm text-slate-600">
                  {order.business_name ?? order.business_id} · ${order.amount_usd} USD
                  {order.expected_amount_ves != null ? ` · Bs. ${order.expected_amount_ves}` : ''}
                </p>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-right font-medium text-slate-900">{value}</dd>
    </div>
  );
}
