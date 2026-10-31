'use client';

import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, ExternalLink, Package, RefreshCw, Truck, XCircle } from 'lucide-react';

import type { CurrentAdmin } from '../_lib/admin-auth';
import { canReviewPayments } from '../_lib/admin-billing';

type KitRow = {
  id: string;
  code: string;
  created_at: string;
  gift_qty: number;
  extras_qty: number;
  product_total_usd: number;
  recipient_name: string;
  phone: string;
  email: string;
  ci: string;
  estado: string;
  ciudad: string;
  zoom_office: string;
  payment_reference: string | null;
  receipt_url: string | null;
  declared_amount: number | null;
  declared_currency: string | null;
  status: string;
  admin_note: string | null;
  zoom_tracking: string | null;
};

function money(amount: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(amount);
}

function when(value: string) {
  return new Date(value).toLocaleString('es-VE');
}

function statusLabel(status: string) {
  switch (status) {
    case 'pending_payment':
      return 'Pendiente pago';
    case 'pending_ship':
      return 'Pendiente envío';
    case 'shipped':
      return 'Enviado';
    case 'cancelled':
      return 'Cancelado';
    default:
      return status;
  }
}

export function AdminKitShipmentsPanel({ admin }: { admin: CurrentAdmin }) {
  const canReview = canReviewPayments(admin.role);
  const [rows, setRows] = useState<KitRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [tracking, setTracking] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/admin/api/kit/shipments', { credentials: 'include' });
      const json = await res.json();
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || 'No se pudo cargar.');
      }
      setRows(json.data as KitRow[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function patch(
    id: string,
    body: Record<string, unknown>,
  ) {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch('/admin/api/kit/shipments', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id,
          zoom_tracking: tracking[id]?.trim() || null,
          admin_note: notes[id]?.trim() || null,
          ...body,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || 'No se pudo actualizar.');
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-white sm:text-2xl">Envíos Kit</h1>
          <p className="mt-1 hidden text-sm text-slate-400 sm:block">
            Obsequio + extras, destino Zoom.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex h-10 shrink-0 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 text-sm font-semibold text-slate-200 hover:bg-white/10"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          <span className="hidden sm:inline">Actualizar</span>
        </button>
      </div>

      {error ? (
        <p className="rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
          {error}
        </p>
      ) : null}

      {loading && rows.length === 0 ? (
        <p className="text-sm text-slate-400">Cargando…</p>
      ) : rows.length === 0 ? (
        <p className="rounded-xl border border-white/10 bg-white/5 px-4 py-8 text-center text-sm text-slate-400">
          Aún no hay pedidos de kit.
        </p>
      ) : (
        <ul className="space-y-3">
          {rows.map((row) => (
            <li
              key={row.id}
              className="rounded-xl border border-white/10 bg-[#0b1220]/90 p-3 sm:rounded-2xl sm:p-5"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 sm:text-xs">
                    {row.code} · {when(row.created_at)}
                  </p>
                  <h2 className="mt-0.5 truncate text-base font-bold text-white sm:text-lg">
                    {row.recipient_name}
                  </h2>
                  <p className="truncate text-xs text-slate-400 sm:text-sm">
                    {row.phone}
                    <span className="hidden sm:inline">
                      {' '}
                      · {row.email} · CI {row.ci}
                    </span>
                  </p>
                </div>
                <span className="shrink-0 rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-[10px] font-semibold text-slate-200 sm:px-3 sm:text-xs">
                  {statusLabel(row.status)}
                </span>
              </div>

              <div className="mt-3 grid gap-2 text-xs text-slate-300 sm:mt-4 sm:grid-cols-2 sm:gap-3 sm:text-sm">
                <p>
                  <Package className="mr-1.5 inline h-4 w-4 text-slate-500" />
                  {row.gift_qty} gift + {row.extras_qty} extras · {money(Number(row.product_total_usd))}
                </p>
                <p className="truncate">
                  <Truck className="mr-1.5 inline h-4 w-4 text-slate-500" />
                  {row.zoom_office}, {row.ciudad}
                </p>
                {row.payment_reference ? (
                  <p>
                    Ref. pago: <span className="font-semibold text-white">{row.payment_reference}</span>
                    {row.declared_amount != null
                      ? ` · ${row.declared_amount} ${row.declared_currency || 'VES'}`
                      : ''}
                  </p>
                ) : null}
                {row.receipt_url ? (
                  <a
                    href={row.receipt_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[#FDE68A] hover:underline"
                  >
                    Ver comprobante <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                ) : null}
              </div>

              {canReview && row.status !== 'cancelled' && row.status !== 'shipped' ? (
                <div className="mt-4 grid gap-3 border-t border-white/10 pt-4 sm:grid-cols-2">
                  <label>
                    <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500">
                      Guía Zoom
                    </span>
                    <input
                      value={tracking[row.id] ?? row.zoom_tracking ?? ''}
                      onChange={(e) =>
                        setTracking((prev) => ({ ...prev, [row.id]: e.target.value }))
                      }
                      className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
                    />
                  </label>
                  <label>
                    <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500">
                      Nota interna
                    </span>
                    <input
                      value={notes[row.id] ?? row.admin_note ?? ''}
                      onChange={(e) =>
                        setNotes((prev) => ({ ...prev, [row.id]: e.target.value }))
                      }
                      className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
                    />
                  </label>
                  <div className="flex flex-wrap gap-2 sm:col-span-2">
                    {row.status === 'pending_payment' ? (
                      <button
                        type="button"
                        disabled={busyId === row.id}
                        onClick={() => void patch(row.id, { confirm_payment: true })}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
                      >
                        <CheckCircle2 className="h-4 w-4" />
                        Confirmar pago
                      </button>
                    ) : null}
                    {(row.status === 'pending_ship' || row.status === 'pending_payment') && (
                      <button
                        type="button"
                        disabled={busyId === row.id}
                        onClick={() => void patch(row.id, { status: 'shipped' })}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-[#FACC15] px-3 py-2 text-sm font-semibold text-[#1a1200] hover:bg-[#fde047] disabled:opacity-50"
                      >
                        <Truck className="h-4 w-4" />
                        Marcar enviado
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={busyId === row.id}
                      onClick={() => void patch(row.id, { status: 'cancelled' })}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-2 text-sm font-semibold text-slate-300 hover:bg-white/5 disabled:opacity-50"
                    >
                      <XCircle className="h-4 w-4" />
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : null}

              {row.zoom_tracking ? (
                <p className="mt-3 text-xs text-slate-400">Tracking: {row.zoom_tracking}</p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
