'use client';

import {
  Bike,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Copy,
  MapPinned,
  Navigation,
  Package,
  Phone,
  RefreshCcw,
  Store,
  User,
} from 'lucide-react';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { nextPollDelayMs } from '../../../_lib/poll-backoff';

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
    trackingUrl?: string;
    total?: number;
    deliveryCost?: number;
    currency?: string;
    items?: Array<{
      nombre?: string;
      cantidad?: number;
      precio?: number;
      categoria_nombre?: string | null;
    }>;
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

function openWhatsappSameTab(href?: string | null) {
  const url = (href ?? '').trim();
  if (!url) return false;
  window.location.assign(url);
  return true;
}

function safeNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function deliveryMapPoint(latitudeValue: unknown, longitudeValue: unknown) {
  const lat = safeNumber(latitudeValue);
  const lng = safeNumber(longitudeValue);
  return lat === null || lng === null ? null : { lat, lng };
}

function splitDeliveryItemLabel(value: string) {
  const parts = value.split(/\s+·\s+/).map((part) => part.trim()).filter(Boolean);
  return {
    name: parts[0] || 'Articulo del pedido',
    options: parts.slice(1).join(' · '),
  };
}

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.198-.347.223-.644.075-.297-.149-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.52.149-.174.198-.298.297-.497.1-.198.05-.371-.025-.52-.074-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.792.372-.273.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.693.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.999-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.002-5.45 4.436-9.884 9.888-9.884 2.64.001 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.002 5.45-4.436 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.893c0 2.096.547 4.142 1.588 5.946L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.684 1.447h.005c6.554 0 11.89-5.335 11.893-11.893a11.817 11.817 0 0 0-3.48-8.412z" />
    </svg>
  );
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

type DeliveryMapPoint = { lat: number; lng: number };
type GoogleMapsBounds = { extend(point: DeliveryMapPoint): void };
type GoogleMapsApi = {
  Map: new (
    element: HTMLElement,
    options: {
      center: DeliveryMapPoint;
      zoom: number;
      mapTypeControl: boolean;
      streetViewControl: boolean;
      fullscreenControl: boolean;
      gestureHandling: 'greedy';
    },
  ) => { fitBounds(bounds: GoogleMapsBounds, padding?: number): void };
  Marker: new (options: { position: DeliveryMapPoint; map: object; title: string }) => unknown;
  Polyline: new (options: {
    path: DeliveryMapPoint[];
    map: object;
    strokeColor: string;
    strokeOpacity: number;
    strokeWeight: number;
  }) => unknown;
  LatLngBounds: new () => GoogleMapsBounds;
};
type GoogleMapsRuntime = GoogleMapsApi & { places?: object; Geocoder?: object };
type GoogleMapsWindow = Window & { google?: { maps?: GoogleMapsRuntime } };

const deliveryMapApiKey =
  process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim() ||
  'AIzaSyB9WNMyQma0-n4sMXN_lWJwYNxxkWDEmyQ';
let deliveryMapsPromise: Promise<GoogleMapsApi> | null = null;

function loadDeliveryGoogleMaps() {
  const currentMaps = (window as GoogleMapsWindow).google?.maps;
  if (currentMaps?.places && currentMaps.Geocoder) return Promise.resolve(currentMaps);
  if (deliveryMapsPromise) return deliveryMapsPromise;

  const attempt = new Promise<GoogleMapsApi>((resolve, reject) => {
    const existingScript = document.querySelector<HTMLScriptElement>(
      'script[src*="maps.googleapis.com/maps/api/js"]',
    );
    const script = existingScript ?? document.createElement('script');
    const startedAt = Date.now();
    let settled = false;
    const checkReady = () => {
      if (settled) return;
      const maps = (window as GoogleMapsWindow).google?.maps;
      if (maps?.places && maps.Geocoder) {
        settled = true;
        resolve(maps);
        return;
      }
      if (Date.now() - startedAt >= 15_000) {
        settled = true;
        reject(new Error('Google Maps API did not initialize.'));
        return;
      }
      window.setTimeout(checkReady, 40);
    };

    script.addEventListener('error', () => {
      if (settled) return;
      settled = true;
      reject(new Error('Google Maps API failed to load.'));
    }, { once: true });
    if (!existingScript) {
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(deliveryMapApiKey)}&libraries=places&loading=async`;
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }
    window.setTimeout(checkReady, 40);
  });

  deliveryMapsPromise = attempt.catch((error: unknown) => {
    deliveryMapsPromise = null;
    throw error;
  });
  return deliveryMapsPromise;
}

function GoogleDeliveryMap({
  origin,
  destination,
  navigationUrl,
}: {
  origin: DeliveryMapPoint | null;
  destination: DeliveryMapPoint | null;
  navigationUrl: string;
}) {
  const mapElement = useRef<HTMLDivElement>(null);
  const [mapReady, setMapReady] = useState(false);
  const [mapFailed, setMapFailed] = useState(false);
  const originLat = origin?.lat;
  const originLng = origin?.lng;
  const destinationLat = destination?.lat;
  const destinationLng = destination?.lng;

  useEffect(() => {
    if (destinationLat == null || destinationLng == null) return;
    let active = true;
    setMapReady(false);
    setMapFailed(false);

    void loadDeliveryGoogleMaps()
      .then((maps) => {
        if (!active || !mapElement.current) return;
        const destinationPoint = { lat: destinationLat, lng: destinationLng };
        const map = new maps.Map(mapElement.current, {
          center: destinationPoint,
          zoom: 14,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          gestureHandling: 'greedy',
        });
        new maps.Marker({ position: destinationPoint, map, title: 'Direccion de entrega' });

        if (originLat != null && originLng != null) {
          const originPoint = { lat: originLat, lng: originLng };
          new maps.Marker({ position: originPoint, map, title: 'Comercio' });
          new maps.Polyline({
            path: [originPoint, destinationPoint],
            map,
            strokeColor: '#2563EB',
            strokeOpacity: 0.9,
            strokeWeight: 4,
          });
          const bounds = new maps.LatLngBounds();
          bounds.extend(originPoint);
          bounds.extend(destinationPoint);
          map.fitBounds(bounds, 36);
        }
        setMapReady(true);
      })
      .catch(() => {
        if (active) setMapFailed(true);
      });

    return () => {
      active = false;
    };
  }, [destinationLat, destinationLng, originLat, originLng]);

  return (
    <div className="relative h-40 overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 sm:h-52">
      {destinationLat != null && destinationLng != null ? (
        <div ref={mapElement} className="h-full w-full" aria-label="Mapa de entrega con Google Maps" />
      ) : (
        <div className="grid h-full place-items-center px-6 text-center">
          <p className="text-sm font-semibold text-slate-600">No hay coordenadas para mostrar el mapa.</p>
        </div>
      )}
      {destinationLat != null && destinationLng != null && !mapReady ? (
        <div className="absolute inset-0 grid place-items-center bg-slate-100/90 px-6 text-center">
          <p className="text-sm font-semibold text-slate-600">
            {mapFailed ? 'Google Maps no esta disponible.' : 'Cargando Google Maps...'}
          </p>
        </div>
      ) : null}
      {navigationUrl ? (
        <a
          href={navigationUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="absolute bottom-3 right-3 inline-flex min-h-11 items-center gap-2 rounded-xl bg-slate-900 px-3.5 py-2.5 text-xs font-black text-white shadow-lg"
        >
          <Navigation className="h-4 w-4" />
          Abrir en Maps
        </a>
      ) : null}
    </div>
  );
}

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
  const [notice, setNotice] = useState('');

  const refresh = useCallback(async (options?: { silent?: boolean }) => {
    const silent = Boolean(options?.silent);
    if (!token) {
      setError('Enlace de delivery invalido.');
      setLoading(false);
      return false;
    }

    try {
      if (!silent) {
        setLoading(true);
      }
      setError('');
      const response = await fetch(`/api/delivery/invite/${encodeURIComponent(token)}`, {
        method: 'GET',
        cache: 'no-store',
        signal: AbortSignal.timeout(8_000),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.ok || !data?.data) {
        setPayload(null);
        setError((data?.message ?? data?.error ?? 'No se pudo abrir el enlace de delivery.').toString());
        return false;
      }
      const nextPayload = data.data as InvitePayload;
      setPayload(nextPayload);
      const savedCourierName = nextPayload.invitation?.invitedNote?.trim() ?? '';
      if (savedCourierName) {
        setCourierName((current) => current.trim() || savedCourierName);
      }
      return true;
    } catch {
      setError('No se pudo cargar la informacion del delivery.');
      return false;
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, [token]);

  useEffect(() => {
    if (!token) return;
    let active = true;
    let consecutiveFailures = 0;
    let timer: number | undefined;

    const tick = async (silent: boolean) => {
      if (submitting) return;
      const ok = await refresh({ silent });
      if (!active) return;
      consecutiveFailures = ok ? 0 : consecutiveFailures + 1;
      const delay = nextPollDelayMs(consecutiveFailures, 10_000);
      const arm = () => {
        timer = window.setTimeout(() => {
          if (!active) return;
          if (document.visibilityState !== 'visible') {
            arm();
            return;
          }
          void tick(true);
        }, delay);
      };
      arm();
    };

    void tick(false);
    return () => {
      active = false;
      if (timer) window.clearTimeout(timer);
    };
  }, [refresh, submitting, token]);

  const invitationStatus = normalizeStatus(payload?.invitation?.status);
  const effectiveInvitationStatus =
    arrivedOptimistic && invitationStatus === 'accepted' ? 'arrived' : invitationStatus;
  const orderStatus = normalizeStatus(payload?.order?.status);
  const canAccept = Boolean(payload?.actions?.canAccept);
  const canConfirmMission = canAccept && courierName.trim().length >= 2;
  const canMarkArrived = Boolean(payload?.actions?.canMarkArrived);
  const showArrivedButton =
    canMarkArrived && effectiveInvitationStatus !== 'arrived' && effectiveInvitationStatus !== 'completed';
  const showArrivalNotice = effectiveInvitationStatus === 'arrived';

  const orderId = (payload?.order?.orderId ?? '').toString().trim();
  const invitationCreatedAt =
    payload?.invitation?.acceptedAt ?? payload?.order?.createdAt ?? payload?.invitation?.expiresAt ?? null;
  const invitationStatusLabel = statusLabel(invitationStatus);
  const activeStepIndex = timelineIndex(effectiveInvitationStatus);
  const commercePhoneHref = buildPhoneHref(payload?.comercio?.phone);
  const clientPhoneHref = buildPhoneHref(payload?.order?.clientPhone);
  const clientName = (payload?.order?.clientName ?? 'cliente').toString().trim() || 'cliente';
  const courierDisplayName = courierName.trim() || 'el repartidor';
  const commerceWhatsappHref = buildWhatsappHref(
    payload?.comercio?.phone,
    `Hola, te escribo por el pedido ${orderId || ''}.`,
  );
  const clientEnRouteWhatsappHref = buildWhatsappHref(
    payload?.order?.clientPhone,
    [
      `🛵 *PEDIDO EN CAMINO #${orderId || 'N/A'}*`,
      '',
      `👋 ¡Hola, ${clientName}! Mi nombre es ${courierDisplayName}, soy el repartidor encargado de tu pedido.`,
      '',
      'Ya voy en camino a recogerlo. En cuanto lo tenga conmigo, saldré directamente hacia tu ubicación para entregártelo.',
      '',
      '📦 Tu pedido ya está en proceso de entrega.',
      '',
      'Por favor, mantente atento a tu teléfono para coordinar la recepción.',
      ...(payload?.order?.trackingUrl
        ? ['', '🔗 Ver pedido:', payload.order.trackingUrl]
        : []),
      '',
      '¡Gracias por tu paciencia! 😊',
    ].join('\n'),
  );
  const clientArrivalWhatsappHref = buildWhatsappHref(
    payload?.order?.clientPhone,
    [
      `📍 *EL REPARTIDOR LLEGÓ #${orderId || 'N/A'}*`,
      '',
      '🛵 Tu pedido ya llegó al lugar de entrega.',
      '',
      '✅ Por favor recibe tu pedido y confirma la recepción en el siguiente enlace:',
      ...(payload?.order?.trackingUrl
        ? ['', '🔗 Confirmar recepción:', payload.order.trackingUrl]
        : []),
    ].join('\n'),
  );
  const clientWhatsappHref = effectiveInvitationStatus === 'arrived'
    ? clientArrivalWhatsappHref
    : clientEnRouteWhatsappHref;
  const shouldShowBottomBar =
    canAccept || showArrivedButton || showArrivalNotice;

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

  const mapOrigin = deliveryMapPoint(payload?.comercio?.lat, payload?.comercio?.lng);
  const mapDestination = deliveryMapPoint(
    payload?.delivery?.coordinates?.lat,
    payload?.delivery?.coordinates?.lng,
  );

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
    if (action === 'accept' && courierName.trim().length < 2) {
      setError('Escribe tu nombre antes de confirmar, voy en camino.');
      return;
    }

    if (action === 'arrived') {
      setArrivedOptimistic(true);
    }

    try {
      setSubmitting(true);
      setError('');
      setNotice('');
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
      const whatsappHref = action === 'accept' ? clientEnRouteWhatsappHref : clientArrivalWhatsappHref;
      if (openWhatsappSameTab(whatsappHref)) {
        return;
      }
      setNotice(
        action === 'accept'
          ? 'Pedido aceptado. No hay WhatsApp del cliente para avisar.'
          : 'Llegada marcada. No hay WhatsApp del cliente para avisar.',
      );
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
      <section className="mx-auto flex w-full max-w-xl flex-col gap-3 pb-40">
        <article className="order-1 overflow-hidden rounded-[28px] bg-[linear-gradient(145deg,#050a16_0%,#0f172a_55%,#1f2f4a_100%)] p-4 text-white shadow-[0_26px_52px_rgba(2,6,23,0.45)] sm:p-5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
              <p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-slate-300 sm:text-[11px]">Mision de delivery</p>
              <span
                className={`whitespace-nowrap rounded-full px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.06em] sm:text-[10px] ${statusBadgeClass(invitationStatus)}`}
              >
                {invitationStatusLabel}
              </span>
            </div>
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/10 ring-1 ring-white/20 sm:h-10 sm:w-10 sm:rounded-2xl">
              <Bike className="h-4.5 w-4.5 sm:h-5 sm:w-5" />
            </div>
          </div>
          <h1 className="mt-3 whitespace-nowrap text-xl font-black leading-tight sm:text-2xl">
            Pedido #{orderId || 'N/A'}
          </h1>
          <p className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-300">
            <Clock3 className="h-3.5 w-3.5 shrink-0" />
            {compactDateTime(invitationCreatedAt) || 'Fecha no disponible'}
          </p>
          <p className="mt-3 text-xs font-semibold text-slate-300">
            Estado pedido: <span className="font-black text-white">{orderStatusLabel(orderStatus)}</span>
          </p>
        </article>

        <article className="order-6 rounded-3xl border border-slate-200/80 bg-white p-4 shadow-[0_10px_30px_rgba(15,23,42,0.06)]">
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

        <article className="order-4 rounded-3xl border border-slate-200/80 bg-white p-4 shadow-[0_10px_30px_rgba(15,23,42,0.06)]">
          <h2 className="text-base font-black text-slate-900">Detalles de contacto</h2>
          <div className="mt-3 divide-y divide-slate-100">
            <div className="flex items-center gap-3 py-3 first:pt-0">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-slate-100 text-slate-700">
                <Store className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-black uppercase tracking-[0.08em] text-slate-500">Comercio</p>
                <p className="truncate text-sm font-black text-slate-900">{payload.comercio?.name || 'Comercio'}</p>
                <p className="text-xs font-semibold text-slate-500">{payload.comercio?.phone || 'Telefono no disponible'}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {commerceWhatsappHref ? (
                  <a href={commerceWhatsappHref} className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-500 text-white transition hover:bg-emerald-600" aria-label="WhatsApp comercio">
                    <WhatsAppIcon className="h-5 w-5" />
                  </a>
                ) : null}
                {commercePhoneHref ? (
                  <a href={commercePhoneHref} className="grid h-10 w-10 place-items-center rounded-xl bg-fuchsia-700 text-white transition hover:bg-fuchsia-800" aria-label="Llamar comercio">
                    <Phone className="h-4.5 w-4.5" />
                  </a>
                ) : null}
              </div>
            </div>
            <div className="flex items-center gap-3 py-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-slate-100 text-slate-700">
                <User className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-black uppercase tracking-[0.08em] text-slate-500">Cliente</p>
                <p className="truncate text-sm font-black text-slate-900">{payload.order?.clientName || 'Cliente'}</p>
                <p className="text-xs font-semibold text-slate-500">{payload.order?.clientPhone || 'Telefono no disponible'}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {clientWhatsappHref ? (
                  <a href={clientWhatsappHref} className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-500 text-white transition hover:bg-emerald-600" aria-label="WhatsApp cliente">
                    <WhatsAppIcon className="h-5 w-5" />
                  </a>
                ) : null}
                {clientPhoneHref ? (
                  <a href={clientPhoneHref} className="grid h-10 w-10 place-items-center rounded-xl bg-fuchsia-700 text-white transition hover:bg-fuchsia-800" aria-label="Llamar cliente">
                    <Phone className="h-4.5 w-4.5" />
                  </a>
                ) : null}
              </div>
            </div>
            <div className="flex items-start gap-3 border-t border-slate-100 py-3 pb-0">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-slate-100 text-slate-700">
                <MapPinned className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-black uppercase tracking-[0.08em] text-slate-500">Direccion</p>
                <p className="text-sm font-bold leading-snug text-slate-900">{payload.delivery?.address || 'Direccion no disponible'}</p>
                {copyFeedback ? <p className="mt-1 text-xs font-bold text-emerald-700">{copyFeedback}</p> : null}
              </div>
              <button
                type="button"
                onClick={() => void copyAddress()}
                className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-xl px-2 text-xs font-bold text-slate-700 transition hover:bg-slate-50"
              >
                <Copy className="h-4 w-4" />
                Copiar
              </button>
            </div>
          </div>
        </article>

        {payload.delivery?.reference ? (
          <div className="order-5">
          <InfoCard title="Referencia" icon={<ChevronRight className="h-4.5 w-4.5" />}>
            <p className="text-sm font-semibold leading-relaxed text-slate-700">{payload.delivery.reference}</p>
          </InfoCard>
          </div>
        ) : null}

        {payload.delivery?.instructions ? (
          <div className="order-5">
          <InfoCard title="Instrucciones" icon={<ChevronRight className="h-4.5 w-4.5" />}>
            <p className="text-sm font-semibold leading-relaxed text-slate-700">{payload.delivery.instructions}</p>
          </InfoCard>
          </div>
        ) : null}

        <article className="order-2 relative overflow-hidden rounded-3xl border border-slate-200/80 bg-white p-3 shadow-[0_10px_30px_rgba(15,23,42,0.06)]">
          <GoogleDeliveryMap
            origin={mapOrigin}
            destination={mapDestination}
            navigationUrl={navigationUrl}
          />
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

        <article className="order-3 rounded-3xl border border-slate-200/80 bg-white p-4 shadow-[0_10px_30px_rgba(15,23,42,0.06)]">
          <div className="mb-3 flex items-center gap-2">
            <Package className="h-4.5 w-4.5 text-slate-600" />
            <h2 className="text-base font-black text-slate-900">Resumen del pedido</h2>
          </div>
          {Array.isArray(payload.order?.items) && payload.order.items.length > 0 ? (
            <ul className="space-y-2">
              {payload.order.items.map((item, index) => {
                const itemLabel = splitDeliveryItemLabel(item.nombre || 'Articulo del pedido');
                const quantity = item.cantidad ?? 1;
                return (
                  <li
                    key={`${item.nombre || 'item'}-${index}`}
                    className="flex items-start gap-3 rounded-2xl bg-slate-50 px-3 py-2.5"
                  >
                    <span className="grid min-h-7 min-w-9 place-items-center rounded-lg bg-white px-2 text-xs font-black text-slate-700">
                      {quantity}x
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="break-words text-sm font-black leading-5 text-slate-900">{itemLabel.name}</p>
                      {item.categoria_nombre?.trim() ? (
                        <p className="mt-0.5 text-[10px] font-black uppercase tracking-[0.08em] text-slate-500">
                          {item.categoria_nombre.trim()}
                        </p>
                      ) : null}
                      {itemLabel.options ? (
                        <p className="mt-0.5 break-words text-xs font-medium leading-4 text-slate-500">
                          {itemLabel.options}
                        </p>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm font-semibold text-slate-500">No hay productos detallados.</p>
          )}
          <div className="mt-3 flex items-center justify-between gap-3 border-t border-slate-100 pt-3 text-sm">
            <p className="font-semibold text-slate-500">Delivery</p>
            <p className="shrink-0 font-bold tabular-nums text-slate-700">
              {Number(payload.order?.deliveryCost ?? 0) > 0
                ? formatAmount(Number(payload.order?.deliveryCost), payload.order?.currency || 'COP')
                : 'Gratis'}
            </p>
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-3">
            <p className="text-sm font-semibold text-slate-500">Total</p>
            <p className="shrink-0 text-lg font-black tabular-nums text-slate-900">
              {formatAmount(Number(payload.order?.total ?? 0), payload.order?.currency || 'COP')}
            </p>
          </div>
        </article>

        {payload.invitation?.acceptedAt ? (
          <p className="order-7 px-1 text-xs font-semibold text-slate-500">Aceptado: {timeLabel(payload.invitation.acceptedAt)}</p>
        ) : null}
        {payload.invitation?.arrivedAt ? (
          <p className="order-7 px-1 text-xs font-semibold text-slate-500">Llegada registrada: {timeLabel(payload.invitation.arrivedAt)}</p>
        ) : null}

        {canAccept ? (
          <article className="order-7 rounded-3xl border border-slate-200/80 bg-white p-4 shadow-[0_10px_30px_rgba(15,23,42,0.06)]">
            <p className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">Identificacion del repartidor</p>
            <input
              value={courierName}
              onChange={(event) => setCourierName(event.target.value)}
              placeholder="Tu nombre (obligatorio)"
              className="mt-3 w-full rounded-2xl border border-slate-300 bg-white px-3.5 py-3 text-sm font-semibold outline-none focus:border-slate-500"
            />
            <button
              type="button"
              disabled={submitting || !canConfirmMission}
              onClick={() => void submitAction('accept')}
              className="mt-3 inline-flex w-full items-center justify-center rounded-2xl bg-slate-900 px-4 py-3.5 text-sm font-black text-white disabled:opacity-60"
            >
              {submitting ? 'Confirmando...' : 'Confirmar, voy en camino'}
            </button>
          </article>
        ) : null}

        {notice ? (
          <p className="order-8 rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-xs font-semibold text-emerald-800">
            {notice}
          </p>
        ) : null}

        {error ? (
          <p className="order-8 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs font-semibold text-rose-700">{error}</p>
        ) : null}

        <p className="order-8 px-1 text-center text-xs font-semibold text-slate-500">Este enlace es unico y seguro.</p>
      </section>

      {shouldShowBottomBar ? (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200/80 bg-white/95 backdrop-blur">
          <div className="mx-auto w-full max-w-xl px-4 py-3 sm:px-6">
            <div className="space-y-2">
              {canAccept ? (
                <button
                  type="button"
                  disabled={submitting || !canConfirmMission}
                  onClick={() => void submitAction('accept')}
                  className="inline-flex w-full items-center justify-center rounded-2xl bg-slate-900 px-4 py-3.5 text-sm font-black text-white disabled:opacity-60"
                >
                  {submitting ? 'Confirmando...' : 'Confirmar, voy en camino'}
                </button>
              ) : null}

              {showArrivedButton ? (
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => void submitAction('arrived')}
                  className="inline-flex w-full items-center justify-center rounded-2xl bg-orange-500 px-4 py-4 text-base font-black text-white shadow-[0_12px_26px_rgba(249,115,22,0.35)] disabled:cursor-not-allowed disabled:bg-orange-200 disabled:text-orange-100 disabled:shadow-none"
                >
                  {submitting ? 'Guardando...' : 'Ya llegué al punto'}
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
