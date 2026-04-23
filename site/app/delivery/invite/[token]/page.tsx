// @ts-nocheck
'use client';

import { MapPin, Navigation, Package, Phone, RefreshCcw, Store, User } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';

type InvitePayload = {
  invitation?: {
    id?: string;
    status?: string;
    invitedPhone?: string | null;
    invitedNote?: string | null;
    expiresAt?: string | null;
    acceptedAt?: string | null;
    arrivedAt?: string | null;
    completedAt?: string | null;
  };
  order?: {
    orderId?: string;
    status?: string;
    clientName?: string;
    clientPhone?: string;
    clientEmail?: string;
    total?: number;
    currency?: string;
    items?: Array<{ nombre?: string; cantidad?: number; precio?: number }>;
    notes?: string;
  };
  delivery?: {
    mode?: string;
    address?: string;
    reference?: string;
    instructions?: string;
    coordinates?: { lat?: number; lng?: number } | null;
  };
  comercio?: {
    name?: string;
    address?: string;
    phone?: string;
    logoUrl?: string;
    lat?: number;
    lng?: number;
  };
  actions?: {
    canAccept?: boolean;
    canMarkArrived?: boolean;
  };
};

function normalizeStatus(value: string | null | undefined) {
  const raw = (value ?? '').toString().trim().toLowerCase();
  if (!raw) return 'pending';
  return raw;
}

function formatAmount(value: number, currency: string) {
  const safeValue = Number.isFinite(value) ? value : 0;
  const normalized = (currency || 'COP').trim().toUpperCase();
  try {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: normalized,
      maximumFractionDigits: normalized === 'COP' ? 0 : 2,
    }).format(safeValue);
  } catch {
    return `${safeValue.toFixed(2)} ${normalized}`;
  }
}

function statusLabel(status: string) {
  switch (status) {
    case 'accepted':
      return 'Aceptado';
    case 'arrived':
      return 'Llegue al punto';
    case 'completed':
      return 'Completado';
    case 'expired':
      return 'Expirado';
    case 'revoked':
      return 'Revocado';
    case 'pending':
    default:
      return 'Pendiente de aceptar';
  }
}

function orderStatusLabel(status: string) {
  switch ((status || '').toLowerCase()) {
    case 'pendiente':
      return 'Pendiente';
    case 'confirmado':
      return 'Confirmado';
    case 'preparando':
      return 'Preparando';
    case 'en_camino':
      return 'En camino';
    case 'entregado':
      return 'Entregado';
    case 'cancelado':
      return 'Cancelado';
    default:
      return 'Pendiente';
  }
}

function timeLabel(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('es-CO', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export default function DeliveryInvitePage() {
  const params = useParams<{ token: string }>();
  const token = decodeURIComponent((params?.token ?? '').toString().trim());
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [payload, setPayload] = useState<InvitePayload | null>(null);
  const [courierName, setCourierName] = useState('');

  const refresh = useCallback(async () => {
    if (!token) {
      setError('Enlace de delivery invalido.');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError('');
      const response = await fetch(`/api/delivery/invite/${encodeURIComponent(token)}`, {
        method: 'GET',
        cache: 'no-store',
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.ok || !data?.data) {
        setPayload(null);
        setError((data?.message ?? data?.error ?? 'No se pudo abrir el enlace de delivery.').toString());
        return;
      }
      setPayload(data.data as InvitePayload);
    } catch {
      setError('No se pudo cargar la informacion del delivery.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const invitationStatus = normalizeStatus(payload?.invitation?.status);
  const orderStatus = normalizeStatus(payload?.order?.status);
  const canAccept = Boolean(payload?.actions?.canAccept);
  const canMarkArrived = Boolean(payload?.actions?.canMarkArrived);

  const navigationUrl = useMemo(() => {
    const coords = payload?.delivery?.coordinates;
    if (coords?.lat != null && coords?.lng != null) {
      return `https://www.google.com/maps/dir/?api=1&destination=${coords.lat},${coords.lng}&travelmode=driving`;
    }
    if (payload?.delivery?.address) {
      return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(payload.delivery.address)}`;
    }
    return '';
  }, [payload?.delivery?.address, payload?.delivery?.coordinates]);

  const mapEmbedUrl = useMemo(() => {
    const coords = payload?.delivery?.coordinates;
    if (coords?.lat != null && coords?.lng != null) {
      return `https://www.google.com/maps?q=${encodeURIComponent(`${coords.lat},${coords.lng}`)}&z=16&output=embed`;
    }
    if (payload?.delivery?.address) {
      return `https://www.google.com/maps?q=${encodeURIComponent(payload.delivery.address)}&z=16&output=embed`;
    }
    return '';
  }, [payload?.delivery?.address, payload?.delivery?.coordinates]);

  async function submitAction(action: 'accept' | 'arrived') {
    if (!token || submitting) return;

    try {
      setSubmitting(true);
      setError('');
      const response = await fetch(`/api/delivery/invite/${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action,
          acceptedByName: courierName.trim(),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.ok || !data?.data) {
        setError((data?.error ?? 'No se pudo actualizar la mision de delivery.').toString());
        return;
      }
      setPayload(data.data as InvitePayload);
    } catch {
      setError('No se pudo actualizar la mision de delivery.');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-100 px-5">
        <div className="text-center">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-slate-300 border-t-slate-700" />
          <p className="mt-3 text-sm font-semibold text-slate-600">Cargando entrega...</p>
        </div>
      </main>
    );
  }

  if (error || !payload) {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-100 px-5">
        <section className="w-full max-w-md rounded-3xl border border-rose-200 bg-white p-6 text-center shadow-sm">
          <h1 className="text-xl font-black text-slate-900">Enlace no disponible</h1>
          <p className="mt-3 text-sm text-slate-600">{error || 'No fue posible abrir esta invitacion.'}</p>
          <button
            type="button"
            onClick={() => void refresh()}
            className="mt-5 inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white"
          >
            <RefreshCcw className="h-4 w-4" />
            Reintentar
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f8fafc_0%,#eef2ff_100%)] px-4 py-5 text-slate-900 sm:px-6">
      <section className="mx-auto w-full max-w-lg space-y-4">
        <article className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_18px_42px_rgba(15,23,42,0.10)]">
          <div className="bg-[linear-gradient(135deg,#0f172a,#334155)] px-5 py-4 text-white">
            <p className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-200">Mision de delivery</p>
            <div className="mt-2 flex items-center justify-between gap-3">
              <h1 className="text-xl font-black">Pedido #{payload.order?.orderId || 'N/A'}</h1>
              <span className="rounded-full bg-white/20 px-3 py-1 text-xs font-black">
                {statusLabel(invitationStatus)}
              </span>
            </div>
            <p className="mt-2 text-xs font-semibold text-slate-200">
              Estado del pedido: {orderStatusLabel(orderStatus)}
            </p>
          </div>

          <div className="space-y-4 px-5 py-5">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3.5 py-3">
              <div className="flex items-start gap-2.5">
                <Store className="mt-0.5 h-4 w-4 text-slate-500" />
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.1em] text-slate-500">Comercio</p>
                  <p className="text-sm font-bold text-slate-900">{payload.comercio?.name || 'Comercio'}</p>
                  {payload.comercio?.phone ? (
                    <p className="mt-0.5 text-xs text-slate-600">{payload.comercio.phone}</p>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white px-3.5 py-3">
              <div className="flex items-start gap-2.5">
                <User className="mt-0.5 h-4 w-4 text-slate-500" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-black uppercase tracking-[0.1em] text-slate-500">Cliente</p>
                  <p className="truncate text-sm font-bold text-slate-900">{payload.order?.clientName || 'Cliente'}</p>
                  {payload.order?.clientPhone ? (
                    <p className="mt-0.5 text-xs text-slate-600">{payload.order.clientPhone}</p>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white px-3.5 py-3">
              <div className="flex items-start gap-2.5">
                <MapPin className="mt-0.5 h-4 w-4 text-slate-500" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-black uppercase tracking-[0.1em] text-slate-500">Entrega</p>
                  <p className="text-sm font-bold text-slate-900">{payload.delivery?.address || 'Direccion no disponible'}</p>
                  {payload.delivery?.reference ? (
                    <p className="mt-1 text-xs text-slate-600">Referencia: {payload.delivery.reference}</p>
                  ) : null}
                  {payload.delivery?.instructions ? (
                    <p className="mt-1 text-xs text-slate-600">Indicaciones: {payload.delivery.instructions}</p>
                  ) : null}
                </div>
              </div>
            </div>

            {mapEmbedUrl ? (
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-100">
                <iframe
                  title="Mapa de entrega"
                  src={mapEmbedUrl}
                  className="h-56 w-full border-0"
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                />
              </div>
            ) : null}

            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3.5 py-3">
              <p className="text-xs font-black uppercase tracking-[0.1em] text-slate-500">Total</p>
              <p className="mt-1 text-base font-black text-slate-950">
                {formatAmount(Number(payload.order?.total ?? 0), payload.order?.currency || 'COP')}
              </p>
              <p className="mt-1 text-xs font-semibold text-slate-500">
                Items: {Array.isArray(payload.order?.items) ? payload.order?.items.length : 0}
              </p>
            </div>

            {payload.invitation?.acceptedAt ? (
              <p className="text-xs font-semibold text-slate-600">
                Aceptado: {timeLabel(payload.invitation.acceptedAt)}
              </p>
            ) : null}
            {payload.invitation?.arrivedAt ? (
              <p className="text-xs font-semibold text-slate-600">
                Llegada registrada: {timeLabel(payload.invitation.arrivedAt)}
              </p>
            ) : null}

            <div className="space-y-2.5">
              {canAccept ? (
                <>
                  <input
                    value={courierName}
                    onChange={(event) => setCourierName(event.target.value)}
                    placeholder="Tu nombre (opcional)"
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-semibold outline-none focus:border-slate-500"
                  />
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => void submitAction('accept')}
                    className="inline-flex w-full items-center justify-center rounded-xl bg-emerald-600 px-4 py-3 text-sm font-black text-white disabled:opacity-60"
                  >
                    {submitting ? 'Aceptando...' : 'Aceptar entrega'}
                  </button>
                </>
              ) : null}

              {navigationUrl ? (
                <a
                  href={navigationUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-black text-slate-800"
                >
                  <Navigation className="h-4 w-4" />
                  Abrir ruta
                </a>
              ) : null}

              {canMarkArrived ? (
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => void submitAction('arrived')}
                  className="inline-flex w-full items-center justify-center rounded-xl bg-amber-500 px-4 py-3 text-sm font-black text-slate-950 disabled:opacity-60"
                >
                  {submitting ? 'Guardando...' : 'Ya llegue al punto'}
                </button>
              ) : null}

              <button
                type="button"
                onClick={() => void refresh()}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-black text-slate-800"
              >
                <RefreshCcw className="h-4 w-4" />
                Actualizar estado
              </button>
            </div>

            {error ? (
              <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">
                {error}
              </p>
            ) : null}
          </div>
        </article>

        <p className="px-1 text-center text-xs font-semibold text-slate-500">
          Esta pantalla funciona sin registro y usa un enlace unico de delivery.
        </p>
      </section>
    </main>
  );
}
