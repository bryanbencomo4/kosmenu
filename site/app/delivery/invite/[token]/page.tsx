'use client';

import {
  Bike,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Copy,
  MapPinned,
  MessageCircle,
  Navigation,
  Package,
  Phone,
  RefreshCcw,
  Store,
  User,
} from 'lucide-react';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

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
    createdAt?: string | null;
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

function compactDateTime(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('es-CO', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function digitsOnly(value?: string | null) {
  return (value ?? '').replace(/\D/g, '');
}

function buildPhoneHref(value?: string | null) {
  const digits = digitsOnly(value);
  if (!digits) return '';
  return `tel:+${digits}`;
}

function buildWhatsappHref(value?: string | null, message?: string) {
  const digits = digitsOnly(value);
  if (!digits) return '';
  const text = (message ?? '').trim();
  if (!text) return `https://wa.me/${digits}`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

function safeNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const rad = (v: number) => (v * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return 6371 * c;
}

function estimateTrip(distanceKm: number) {
  // Proxy for courier ETA when no routing API is available.
  const averageUrbanSpeedKmH = 22;
  const minutes = Math.max(2, Math.round((distanceKm / averageUrbanSpeedKmH) * 60));
  return {
    distanceText: `${distanceKm.toFixed(1)} km`,
    etaText: `${minutes} min`,
  };
}

function timelineIndex(status: string) {
  switch (status) {
    case 'accepted':
      return 1;
    case 'arrived':
      return 2;
    case 'completed':
      return 3;
    case 'pending':
    default:
      return 0;
  }
}

type TimelineStep = {
  key: string;
  label: string;
  Icon: typeof CheckCircle2;
};

const timelineSteps: TimelineStep[] = [
  { key: 'accepted', label: 'Aceptado', Icon: CheckCircle2 },
  { key: 'en_camino', label: 'En camino', Icon: Bike },
  { key: 'arrived', label: 'Llegue al punto', Icon: MapPinned },
  { key: 'completed', label: 'Entregado', Icon: Package },
];

function stepState(index: number, activeIndex: number) {
  if (index < activeIndex) return 'done';
  if (index === activeIndex) return 'active';
  return 'idle';
}

function statusBadgeClass(status: string) {
  if (status === 'arrived' || status === 'completed') {
    return 'bg-emerald-400/20 text-emerald-100 ring-1 ring-inset ring-emerald-300/30';
  }
  if (status === 'accepted') {
    return 'bg-sky-400/20 text-sky-100 ring-1 ring-inset ring-sky-300/30';
  }
  if (status === 'pending') {
    return 'bg-amber-300/20 text-amber-100 ring-1 ring-inset ring-amber-200/40';
  }
  return 'bg-rose-300/20 text-rose-100 ring-1 ring-inset ring-rose-200/40';
}

function DeliverySkeleton() {
  return (
    <main className="min-h-screen bg-[#F3F6FB] px-4 py-5 sm:px-6">
      <section className="mx-auto w-full max-w-xl space-y-4">
        <div className="h-36 animate-pulse rounded-3xl bg-slate-800/90" />
        <div className="h-24 animate-pulse rounded-3xl bg-white" />
        <div className="h-20 animate-pulse rounded-3xl bg-white" />
        <div className="h-20 animate-pulse rounded-3xl bg-white" />
        <div className="h-64 animate-pulse rounded-3xl bg-white" />
        <div className="h-12 animate-pulse rounded-2xl bg-orange-200" />
        <div className="h-12 animate-pulse rounded-2xl bg-white" />
      </section>
    </main>
  );
}

function InfoCard({
  title,
  icon,
  children,
  action,
}: {
  title: string;
  icon: ReactNode;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <article className="rounded-3xl border border-slate-200/80 bg-white p-4 shadow-[0_10px_30px_rgba(15,23,42,0.06)]">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="grid h-9 w-9 place-items-center rounded-2xl bg-slate-100 text-slate-600">{icon}</div>
          <p className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">{title}</p>
        </div>
        {action}
      </div>
      {children}
    </article>
  );
}

export default function DeliveryInvitePage() {
  const params = useParams<{ token: string }>();
  const token = decodeURIComponent((params?.token ?? '').toString().trim());
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [payload, setPayload] = useState<InvitePayload | null>(null);
  const [courierName, setCourierName] = useState('');
  const [arrivedOptimistic, setArrivedOptimistic] = useState(false);

  const refresh = useCallback(async (options?: { silent?: boolean }) => {
    const silent = Boolean(options?.silent);
    if (!token) {
      setError('Enlace de delivery invalido.');
      setLoading(false);
      return;
    }

    try {
      if (!silent) {
        setLoading(true);
      }
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
      if (!silent) {
        setLoading(false);
      }
    }
  }, [token]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!token) return;

    const intervalId = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      if (submitting) return;
      void refresh({ silent: true });
    }, 10000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [refresh, submitting, token]);

  const invitationStatus = normalizeStatus(payload?.invitation?.status);
  const effectiveInvitationStatus = arrivedOptimistic ? 'arrived' : invitationStatus;
  const orderStatus = normalizeStatus(payload?.order?.status);
  const canAccept = Boolean(payload?.actions?.canAccept);
  const canMarkArrived = Boolean(payload?.actions?.canMarkArrived);
  const showArrivedButton =
    canMarkArrived && effectiveInvitationStatus !== 'arrived' && effectiveInvitationStatus !== 'completed';
  const showArrivalNotice = effectiveInvitationStatus === 'arrived';
  const shouldShowBottomBar = canAccept || showArrivedButton || showArrivalNotice;

  const orderId = (payload?.order?.orderId ?? '').toString().trim();
  const invitationCreatedAt =
    payload?.invitation?.acceptedAt ?? payload?.order?.createdAt ?? payload?.invitation?.expiresAt ?? null;
  const invitationStatusLabel = statusLabel(invitationStatus);
  const activeStepIndex = timelineIndex(effectiveInvitationStatus);
  const commercePhoneHref = buildPhoneHref(payload?.comercio?.phone);
  const clientPhoneHref = buildPhoneHref(payload?.order?.clientPhone);
  const commerceWhatsappHref = buildWhatsappHref(
    payload?.comercio?.phone,
    `Hola, te escribo por el pedido ${orderId || ''}.`,
  );
  const clientWhatsappHref = buildWhatsappHref(
    payload?.order?.clientPhone,
    `Hola, soy el repartidor de tu pedido ${orderId || ''}.`,
  );

  const navigationUrl = useMemo(() => {
    const coords = payload?.delivery?.coordinates;
    if (coords?.lat != null && coords?.lng != null) {
      const srcLat = safeNumber(payload?.comercio?.lat);
      const srcLng = safeNumber(payload?.comercio?.lng);
      if (srcLat != null && srcLng != null) {
        return `https://www.google.com/maps/dir/?api=1&origin=${srcLat},${srcLng}&destination=${coords.lat},${coords.lng}&travelmode=driving`;
      }
      return `https://www.google.com/maps/dir/?api=1&destination=${coords.lat},${coords.lng}&travelmode=driving`;
    }
    if (payload?.delivery?.address) {
      return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(payload.delivery.address)}`;
    }
    return '';
  }, [payload?.comercio?.lat, payload?.comercio?.lng, payload?.delivery?.address, payload?.delivery?.coordinates]);

  const mapEmbedUrl = useMemo(() => {
    const dst = payload?.delivery?.coordinates;
    const srcLat = safeNumber(payload?.comercio?.lat);
    const srcLng = safeNumber(payload?.comercio?.lng);

    if (dst?.lat != null && dst?.lng != null && srcLat != null && srcLng != null) {
      return `https://www.google.com/maps?saddr=${srcLat},${srcLng}&daddr=${dst.lat},${dst.lng}&output=embed`;
    }
    if (dst?.lat != null && dst?.lng != null) {
      return `https://www.google.com/maps?q=${encodeURIComponent(`${dst.lat},${dst.lng}`)}&z=16&output=embed`;
    }
    if (payload?.delivery?.address) {
      return `https://www.google.com/maps?q=${encodeURIComponent(payload.delivery.address)}&z=16&output=embed`;
    }
    return '';
  }, [payload?.comercio?.lat, payload?.comercio?.lng, payload?.delivery?.address, payload?.delivery?.coordinates]);

  const routeMeta = useMemo(() => {
    const dstLat = safeNumber(payload?.delivery?.coordinates?.lat);
    const dstLng = safeNumber(payload?.delivery?.coordinates?.lng);
    const srcLat = safeNumber(payload?.comercio?.lat);
    const srcLng = safeNumber(payload?.comercio?.lng);
    if (dstLat == null || dstLng == null || srcLat == null || srcLng == null) {
      return { etaText: '--', distanceText: '--' };
    }
    const km = haversineKm(srcLat, srcLng, dstLat, dstLng);
    return estimateTrip(km);
  }, [payload?.comercio?.lat, payload?.comercio?.lng, payload?.delivery?.coordinates?.lat, payload?.delivery?.coordinates?.lng]);

  const [copyFeedback, setCopyFeedback] = useState('');

  async function copyAddress() {
    const address = (payload?.delivery?.address ?? '').trim();
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setCopyFeedback('Direccion copiada');
      window.setTimeout(() => setCopyFeedback(''), 1800);
    } catch {
      setCopyFeedback('No se pudo copiar');
      window.setTimeout(() => setCopyFeedback(''), 1800);
    }
  }

  async function submitAction(action: 'accept' | 'arrived') {
    if (!token || submitting) return;

    if (action === 'arrived') {
      setArrivedOptimistic(true);
    }

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
        if (action === 'arrived') {
          setArrivedOptimistic(false);
        }
        setError((data?.error ?? 'No se pudo actualizar la mision de delivery.').toString());
        return;
      }
      setPayload(data.data as InvitePayload);
      if (action === 'arrived') {
        const nextStatus = normalizeStatus((data.data as InvitePayload)?.invitation?.status);
        setArrivedOptimistic(nextStatus === 'arrived' || nextStatus === 'completed');
      }
    } catch {
      if (action === 'arrived') {
        setArrivedOptimistic(false);
      }
      setError('No se pudo actualizar la mision de delivery.');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return <DeliverySkeleton />;
  }

  if (error || !payload) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#F3F6FB] px-5">
        <section className="w-full max-w-md rounded-3xl border border-rose-200 bg-white p-6 text-center shadow-[0_20px_40px_rgba(190,24,93,0.10)]">
          <h1 className="text-xl font-black text-slate-900">Enlace no disponible</h1>
          <p className="mt-3 text-sm text-slate-600">{error || 'No fue posible abrir esta invitacion.'}</p>
          <button
            type="button"
            onClick={() => void refresh()}
            className="mt-5 inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-bold text-white"
          >
            <RefreshCcw className="h-4 w-4" />
            Reintentar
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#F3F6FB] px-4 py-5 text-slate-900 sm:px-6">
      <section className="mx-auto w-full max-w-xl space-y-4 pb-40">
        <article className="overflow-hidden rounded-[28px] bg-[linear-gradient(145deg,#050a16_0%,#0f172a_55%,#1f2f4a_100%)] p-5 text-white shadow-[0_26px_52px_rgba(2,6,23,0.45)]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-slate-300">Mision de delivery</p>
              <h1 className="mt-2 text-2xl font-black leading-tight">Pedido #{orderId || 'N/A'}</h1>
              <p className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-300">
                <Clock3 className="h-3.5 w-3.5" />
                {compactDateTime(invitationCreatedAt) || 'Fecha no disponible'}
              </p>
            </div>
            <div className="flex flex-col items-end gap-2">
              <span
                className={`rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-[0.08em] ${statusBadgeClass(invitationStatus)}`}
              >
                {invitationStatusLabel}
              </span>
              <div className="grid h-10 w-10 place-items-center rounded-2xl bg-white/10 ring-1 ring-white/20">
                <Bike className="h-5 w-5" />
              </div>
            </div>
          </div>
          <p className="mt-4 text-xs font-semibold text-slate-300">
            Estado pedido: <span className="font-black text-white">{orderStatusLabel(orderStatus)}</span>
          </p>
        </article>

        <article className="rounded-3xl border border-slate-200/80 bg-white p-4 shadow-[0_10px_30px_rgba(15,23,42,0.06)]">
          <p className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">Progreso de entrega</p>
          <div className="mt-4 flex items-start justify-between gap-1.5">
            {timelineSteps.map((step, index) => {
              const state = stepState(index, activeStepIndex);
              const isDone = state === 'done';
              const isActive = state === 'active';
              const iconClass = isDone
                ? 'bg-emerald-500 text-white border-emerald-500'
                : isActive
                ? 'bg-orange-500 text-white border-orange-500'
                : 'bg-slate-100 text-slate-400 border-slate-200';
              const lineClass = index < activeStepIndex ? 'bg-emerald-500' : 'bg-slate-200';
              return (
                <div key={step.key} className="flex min-w-0 flex-1 items-start">
                  <div className="flex min-w-0 flex-1 flex-col items-center">
                    <div className={`grid h-9 w-9 place-items-center rounded-full border-2 ${iconClass}`}>
                      <step.Icon className="h-4.5 w-4.5" />
                    </div>
                    <p className="mt-2 text-center text-[11px] font-bold leading-4 text-slate-600">{step.label}</p>
                  </div>
                  {index < timelineSteps.length - 1 ? (
                    <div className="mt-4 h-[3px] flex-1 rounded-full bg-slate-200">
                      <div className={`h-full rounded-full ${lineClass}`} />
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </article>

        <InfoCard
          title="Comercio"
          icon={<Store className="h-4.5 w-4.5" />}
          action={
            <div className="flex items-center gap-2">
              {commerceWhatsappHref ? (
                <a
                  href={commerceWhatsappHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="grid h-9 w-9 place-items-center rounded-xl border border-slate-200 text-emerald-700 transition hover:bg-emerald-50"
                  aria-label="WhatsApp comercio"
                >
                  <MessageCircle className="h-4 w-4" />
                </a>
              ) : null}
              {commercePhoneHref ? (
                <a
                  href={commercePhoneHref}
                  className="grid h-9 w-9 place-items-center rounded-xl border border-slate-200 text-slate-700 transition hover:bg-slate-50"
                  aria-label="Llamar comercio"
                >
                  <Phone className="h-4 w-4" />
                </a>
              ) : null}
            </div>
          }
        >
          <p className="text-base font-black text-slate-900">{payload.comercio?.name || 'Comercio'}</p>
          <p className="mt-1 text-sm font-semibold text-slate-500">{payload.comercio?.phone || 'Telefono no disponible'}</p>
        </InfoCard>

        <InfoCard
          title="Cliente"
          icon={<User className="h-4.5 w-4.5" />}
          action={
            <div className="flex items-center gap-2">
              {clientWhatsappHref ? (
                <a
                  href={clientWhatsappHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="grid h-9 w-9 place-items-center rounded-xl border border-slate-200 text-emerald-700 transition hover:bg-emerald-50"
                  aria-label="WhatsApp cliente"
                >
                  <MessageCircle className="h-4 w-4" />
                </a>
              ) : null}
              {clientPhoneHref ? (
                <a
                  href={clientPhoneHref}
                  className="grid h-9 w-9 place-items-center rounded-xl border border-slate-200 text-slate-700 transition hover:bg-slate-50"
                  aria-label="Llamar cliente"
                >
                  <Phone className="h-4 w-4" />
                </a>
              ) : null}
            </div>
          }
        >
          <p className="text-base font-black text-slate-900">{payload.order?.clientName || 'Cliente'}</p>
          <p className="mt-1 text-sm font-semibold text-slate-500">{payload.order?.clientPhone || 'Telefono no disponible'}</p>
        </InfoCard>

        <InfoCard
          title="Direccion"
          icon={<MapPinned className="h-4.5 w-4.5" />}
          action={
            <button
              type="button"
              onClick={() => void copyAddress()}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-2.5 py-1.5 text-xs font-bold text-slate-700 transition hover:bg-slate-50"
            >
              <Copy className="h-3.5 w-3.5" />
              Copiar
            </button>
          }
        >
          <p className="text-base font-black leading-snug text-slate-900">
            {payload.delivery?.address || 'Direccion no disponible'}
          </p>
          {copyFeedback ? <p className="mt-2 text-xs font-bold text-emerald-700">{copyFeedback}</p> : null}
        </InfoCard>

        {payload.delivery?.reference ? (
          <InfoCard title="Referencia" icon={<ChevronRight className="h-4.5 w-4.5" />}>
            <p className="text-sm font-semibold leading-relaxed text-slate-700">{payload.delivery.reference}</p>
          </InfoCard>
        ) : null}

        {payload.delivery?.instructions ? (
          <InfoCard title="Instrucciones" icon={<ChevronRight className="h-4.5 w-4.5" />}>
            <p className="text-sm font-semibold leading-relaxed text-slate-700">{payload.delivery.instructions}</p>
          </InfoCard>
        ) : null}

        <article className="relative overflow-hidden rounded-3xl border border-slate-200/80 bg-white p-3 shadow-[0_10px_30px_rgba(15,23,42,0.06)]">
          <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-slate-100">
            {mapEmbedUrl ? (
              <iframe
                title="Mapa de entrega"
                src={mapEmbedUrl}
                className="h-64 w-full border-0"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
            ) : (
              <div className="grid h-64 place-items-center">
                <p className="text-sm font-semibold text-slate-500">No hay mapa disponible</p>
              </div>
            )}
            {navigationUrl ? (
              <a
                href={navigationUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="absolute bottom-3 right-3 inline-flex items-center gap-2 rounded-xl bg-slate-900 px-3.5 py-2.5 text-xs font-black text-white shadow-lg"
              >
                <Navigation className="h-4 w-4" />
                Abrir en Maps
              </a>
            ) : null}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-2xl bg-slate-50 px-3 py-2.5">
              <p className="text-[11px] font-black uppercase tracking-[0.08em] text-slate-500">Tiempo estimado</p>
              <p className="mt-1 text-base font-black text-slate-900">{routeMeta.etaText}</p>
            </div>
            <div className="rounded-2xl bg-slate-50 px-3 py-2.5">
              <p className="text-[11px] font-black uppercase tracking-[0.08em] text-slate-500">Distancia</p>
              <p className="mt-1 text-base font-black text-slate-900">{routeMeta.distanceText}</p>
            </div>
          </div>
        </article>

        <InfoCard title="Resumen del pedido" icon={<Package className="h-4.5 w-4.5" />}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-500">Items</p>
              <p className="text-lg font-black text-slate-900">
                {Array.isArray(payload.order?.items) ? payload.order?.items.length : 0}
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm font-semibold text-slate-500">Total</p>
              <p className="text-lg font-black text-slate-900">
                {formatAmount(Number(payload.order?.total ?? 0), payload.order?.currency || 'COP')}
              </p>
            </div>
          </div>
        </InfoCard>

        {payload.invitation?.acceptedAt ? (
          <p className="px-1 text-xs font-semibold text-slate-500">Aceptado: {timeLabel(payload.invitation.acceptedAt)}</p>
        ) : null}
        {payload.invitation?.arrivedAt ? (
          <p className="px-1 text-xs font-semibold text-slate-500">Llegada registrada: {timeLabel(payload.invitation.arrivedAt)}</p>
        ) : null}

        {canAccept ? (
          <article className="rounded-3xl border border-slate-200/80 bg-white p-4 shadow-[0_10px_30px_rgba(15,23,42,0.06)]">
            <p className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">Identificacion del repartidor</p>
            <input
              value={courierName}
              onChange={(event) => setCourierName(event.target.value)}
              placeholder="Tu nombre (opcional)"
              className="mt-3 w-full rounded-2xl border border-slate-300 bg-white px-3.5 py-3 text-sm font-semibold outline-none focus:border-slate-500"
            />
            <button
              type="button"
              disabled={submitting}
              onClick={() => void submitAction('accept')}
              className="mt-3 inline-flex w-full items-center justify-center rounded-2xl bg-slate-900 px-4 py-3.5 text-sm font-black text-white disabled:opacity-60"
            >
              {submitting ? 'Aceptando...' : 'Aceptar mision'}
            </button>
          </article>
        ) : null}

        {error ? (
          <p className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs font-semibold text-rose-700">{error}</p>
        ) : null}

        <p className="px-1 text-center text-xs font-semibold text-slate-500">Este enlace es unico y seguro.</p>
      </section>

      {shouldShowBottomBar ? (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200/80 bg-white/95 backdrop-blur">
          <div className="mx-auto w-full max-w-xl px-4 py-3 sm:px-6">
            <div className="space-y-2">
              {canAccept ? (
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => void submitAction('accept')}
                  className="inline-flex w-full items-center justify-center rounded-2xl bg-slate-900 px-4 py-3.5 text-sm font-black text-white disabled:opacity-60"
                >
                  {submitting ? 'Aceptando...' : 'Aceptar mision'}
                </button>
              ) : null}

              {showArrivedButton ? (
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => void submitAction('arrived')}
                  className="inline-flex w-full items-center justify-center rounded-2xl bg-orange-500 px-4 py-4 text-base font-black text-white shadow-[0_12px_26px_rgba(249,115,22,0.35)] disabled:cursor-not-allowed disabled:bg-orange-200 disabled:text-orange-100 disabled:shadow-none"
                >
                  {submitting ? 'Guardando...' : 'Ya llegue al punto'}
                </button>
              ) : null}

              {showArrivalNotice ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
                  <p className="text-sm font-bold text-amber-900">
                    Contacta al cliente, entrega el paquete y pide por favor que confirme que ya lo recibio.
                  </p>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
