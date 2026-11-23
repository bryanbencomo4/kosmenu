'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  CheckCircle2,
  Clock3,
  ExternalLink,
  FileText,
  RefreshCw,
  ShieldCheck,
  XCircle,
  Zap,
} from 'lucide-react';

import type { CurrentAdmin } from '../_lib/admin-auth';
import { canReviewPayments } from '../_lib/admin-billing';

type QueueRow = {
  id: string;
  business_name: string;
  business_slug: string | null;
  method_code: string;
  method_label: string;
  status: string;
  months: number;
  amount_usd: number;
  declared_amount: number | null;
  declared_currency: string | null;
  reference: string | null;
  payer_name: string | null;
  review_note: string | null;
  created_at: string;
  receipt_url: string | null;
  advisor_name: string | null;
  advisor_code: string | null;
  mode: 'manual';
};

type LedgerRow = {
  id: string;
  business_name: string;
  business_slug: string | null;
  amount: number;
  currency: string;
  status: string;
  paid_at: string;
  period_end: string | null;
  provider: string;
  mode: 'automatic' | 'manual' | 'unknown';
  method_label: string;
  reference: string | null;
  payer_name: string | null;
  receipt_url: string | null;
  bdv_payment_id: string | null;
  order_id: string | null;
};

async function readJson<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(payload.error ?? 'No se pudo completar la operación.');
  }
  return payload;
}

function money(amount: number, currency = 'USD') {
  try {
    return new Intl.NumberFormat('es-VE', {
      style: 'currency',
      currency: currency === 'BS' ? 'VES' : currency,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount} ${currency}`;
  }
}

function when(value: string | null | undefined) {
  if (!value) return '—';
  return new Date(value).toLocaleString('es-VE');
}

export function AdminPaymentsPanel({ admin }: { admin: CurrentAdmin }) {
  const canReview = canReviewPayments(admin.role);
  const [tab, setTab] = useState<'queue' | 'ledger'>('queue');
  const [queueStatus, setQueueStatus] = useState('pending');
  const [queue, setQueue] = useState<QueueRow[]>([]);
  const [ledger, setLedger] = useState<LedgerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (tab === 'queue') {
        const response = await fetch(
          `/admin/api/billing/payments?tab=queue&status=${encodeURIComponent(queueStatus)}`,
          { credentials: 'include', cache: 'no-store' },
        );
        const payload = await readJson<{ ok: true; data: QueueRow[] }>(response);
        setQueue(payload.data);
      } else {
        const response = await fetch('/admin/api/billing/payments?tab=ledger', {
          credentials: 'include',
          cache: 'no-store',
        });
        const payload = await readJson<{ ok: true; data: LedgerRow[] }>(response);
        setLedger(payload.data);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'No se pudo cargar.');
    } finally {
      setLoading(false);
    }
  }, [tab, queueStatus]);

  useEffect(() => {
    void load();
  }, [load]);

  async function review(id: string, action: 'approve' | 'reject') {
    if (!canReview) return;
    setBusyId(id);
    setError(null);
    try {
      const response = await fetch('/admin/api/billing/submissions', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action, note: note[id] }),
      });
      await readJson(response);
      await load();
    } catch (reviewError) {
      setError(reviewError instanceof Error ? reviewError.message : 'No se pudo revisar.');
    } finally {
      setBusyId(null);
    }
  }

  const pendingCount = queueStatus === 'pending' ? queue.length : null;

  return (
    <div className="space-y-4 sm:space-y-6">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-black uppercase tracking-[0.16em] text-violet-600">
            Finanzas
          </p>
          <h1 className="mt-1 font-[var(--font-display)] text-2xl font-black text-slate-900 sm:text-3xl">
            Pagos
          </h1>
          <p className="mt-1 hidden max-w-2xl text-sm text-slate-500 sm:block">
            Cola de verificación e historial. Al aprobar o rechazar se notifica por correo.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex h-10 shrink-0 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 sm:px-4"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          <span className="hidden sm:inline">Actualizar</span>
        </button>
      </header>

      <div className="flex flex-wrap gap-2">
        <TabButton active={tab === 'queue'} onClick={() => setTab('queue')}>
          <Clock3 className="h-4 w-4" />
          Cola de revisión
          {pendingCount != null ? (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800">
              {pendingCount}
            </span>
          ) : null}
        </TabButton>
        <TabButton active={tab === 'ledger'} onClick={() => setTab('ledger')}>
          <FileText className="h-4 w-4" />
          Historial
        </TabButton>
        <a
          href="/admin/pagos-bdv"
          className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600"
        >
          Pagos BDV (bridge)
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>

      {error ? (
        <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </p>
      ) : null}

      {tab === 'queue' ? (
        <section className="rounded-[1.8rem] border border-slate-200/80 bg-white p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-[var(--font-display)] text-xl font-black">Solicitudes</h2>
              <p className="mt-1 text-sm text-slate-500">
                Aprueba solo si el comprobante, el monto y la referencia coinciden.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {['pending', 'approved', 'rejected', 'cancelled', 'all'].map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setQueueStatus(value)}
                  className={[
                    'rounded-full px-3 py-1.5 text-xs font-bold uppercase tracking-wider',
                    queueStatus === value
                      ? 'bg-violet-600 text-white'
                      : 'bg-slate-100 text-slate-600',
                  ].join(' ')}
                >
                  {value}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-5 space-y-4">
            {loading ? <p className="text-sm text-slate-500">Cargando…</p> : null}
            {!loading && queue.length === 0 ? (
              <p className="text-sm text-slate-500">No hay solicitudes en este filtro.</p>
            ) : null}
            {queue.map((row) => (
              <article
                key={row.id}
                className="rounded-[1.2rem] border border-slate-200 p-4 shadow-sm shadow-slate-100/60"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-bold text-slate-900">{row.business_name}</p>
                      <ModeBadge mode="manual" />
                      <StatusBadge status={row.status} />
                    </div>
                    <p className="mt-1 text-sm text-slate-500">
                      {row.method_label} · {money(row.amount_usd, 'USD')} · {row.months} mes
                      {row.months === 1 ? '' : 'es'} · {when(row.created_at)}
                    </p>
                    {row.reference ? (
                      <p className="mt-1 text-sm">
                        <span className="text-slate-500">Ref:</span>{' '}
                        <span className="font-semibold">{row.reference}</span>
                      </p>
                    ) : null}
                    {row.payer_name ? (
                      <p className="text-sm text-slate-600">Pagador: {row.payer_name}</p>
                    ) : null}
                    {row.declared_amount != null ? (
                      <p className="text-sm text-slate-600">
                        Declaró {row.declared_amount} {row.declared_currency}
                      </p>
                    ) : null}
                    {row.advisor_name ? (
                      <p className="text-sm text-slate-600">
                        Asesor: {row.advisor_name} ({row.advisor_code})
                      </p>
                    ) : null}
                    {row.review_note ? (
                      <p className="mt-2 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">
                        {row.review_note}
                      </p>
                    ) : null}
                  </div>
                  {row.receipt_url ? (
                    <a
                      href={row.receipt_url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 rounded-full bg-violet-50 px-4 py-2 text-sm font-semibold text-violet-700"
                    >
                      <FileText className="h-4 w-4" />
                      Ver comprobante
                    </a>
                  ) : (
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold uppercase text-slate-500">
                      Sin comprobante
                    </span>
                  )}
                </div>

                {canReview && row.status === 'pending' ? (
                  <div className="mt-4 space-y-2 border-t border-slate-100 pt-4">
                    <textarea
                      value={note[row.id] ?? ''}
                      onChange={(event) =>
                        setNote((current) => ({ ...current, [row.id]: event.target.value }))
                      }
                      placeholder="Nota para el cliente (obligatoria al rechazar)"
                      className="w-full rounded-[1rem] border border-slate-200 px-3 py-2 text-sm"
                      rows={2}
                    />
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={busyId === row.id}
                        onClick={() => void review(row.id, 'approve')}
                        className="inline-flex items-center gap-2 rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                      >
                        <CheckCircle2 className="h-4 w-4" />
                        Aprobar, activar y enviar recibo
                      </button>
                      <button
                        type="button"
                        disabled={busyId === row.id}
                        onClick={() => void review(row.id, 'reject')}
                        className="inline-flex items-center gap-2 rounded-full border border-rose-200 px-4 py-2 text-sm font-semibold text-rose-700 disabled:opacity-60"
                      >
                        <XCircle className="h-4 w-4" />
                        Rechazar y notificar
                      </button>
                    </div>
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        </section>
      ) : (
        <section className="overflow-hidden rounded-[1.8rem] border border-slate-200/80 bg-white">
          <div className="border-b border-slate-100 px-6 py-5">
            <h2 className="font-[var(--font-display)] text-xl font-black">Historial de pagos</h2>
            <p className="mt-1 text-sm text-slate-500">
              Ledger de activaciones: Binance, gift cards, BDV histórico y aprobaciones manuales.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-3">Fecha</th>
                  <th className="px-4 py-3">Negocio</th>
                  <th className="px-4 py-3">Método</th>
                  <th className="px-4 py-3">Tipo</th>
                  <th className="px-4 py-3">Monto</th>
                  <th className="px-4 py-3">Estado</th>
                  <th className="px-4 py-3">Comprobante / detalle</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-slate-500">
                      Cargando…
                    </td>
                  </tr>
                ) : null}
                {!loading && ledger.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-slate-500">
                      Aún no hay pagos registrados.
                    </td>
                  </tr>
                ) : null}
                {ledger.map((row) => (
                  <tr key={row.id} className="border-t border-slate-100">
                    <td className="px-4 py-3 whitespace-nowrap text-slate-600">
                      {when(row.paid_at)}
                    </td>
                    <td className="px-4 py-3 font-semibold text-slate-900">
                      {row.business_name}
                      {row.business_slug ? (
                        <span className="mt-0.5 block text-xs font-normal text-slate-400">
                          /{row.business_slug}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">{row.method_label}</td>
                    <td className="px-4 py-3">
                      <ModeBadge mode={row.mode} />
                    </td>
                    <td className="px-4 py-3 font-semibold">
                      {money(Number(row.amount), row.currency || 'USD')}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={row.status} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1">
                        {row.reference ? (
                          <span className="text-xs text-slate-500">Ref {row.reference}</span>
                        ) : null}
                        {row.receipt_url ? (
                          <a
                            href={row.receipt_url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-sm font-semibold text-violet-700"
                          >
                            Comprobante <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        ) : null}
                        {row.bdv_payment_id ? (
                          <a
                            href="/admin/pagos-bdv"
                            className="inline-flex items-center gap-1 text-sm font-semibold text-slate-600"
                          >
                            Ver en BDV <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        ) : null}
                        {!row.receipt_url && !row.bdv_payment_id && !row.reference ? (
                          <span className="text-xs text-slate-400">—</span>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold',
        active
          ? 'bg-slate-900 text-white'
          : 'border border-slate-200 bg-white text-slate-600',
      ].join(' ')}
    >
      {children}
    </button>
  );
}

function ModeBadge({ mode }: { mode: 'automatic' | 'manual' | 'unknown' }) {
  if (mode === 'manual') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-amber-800">
        <ShieldCheck className="h-3 w-3" />
        Manual
      </span>
    );
  }
  if (mode === 'automatic') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-emerald-800">
        <Zap className="h-3 w-3" />
        Automático
      </span>
    );
  }
  return (
    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold uppercase text-slate-500">
      —
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending: 'bg-amber-100 text-amber-800',
    approved: 'bg-emerald-100 text-emerald-800',
    completed: 'bg-emerald-100 text-emerald-800',
    rejected: 'bg-rose-100 text-rose-800',
    cancelled: 'bg-slate-100 text-slate-600',
    failed: 'bg-rose-100 text-rose-800',
    open: 'bg-sky-100 text-sky-800',
  };
  return (
    <span
      className={[
        'rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide',
        styles[status] ?? 'bg-slate-100 text-slate-600',
      ].join(' ')}
    >
      {status}
    </span>
  );
}
