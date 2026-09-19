'use client';

import Link from 'next/link';
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';

import { OrderReceipt, OrderReceiptFrame } from './_components/OrderReceipt';
import { resolveBusinessScheduleStatus } from '../../api/_lib/business-hours';
import { writeRepeatOrder, type RepeatOrderLine } from '../../_lib/repeat-order';

type OrderStatus =
  | 'pendiente'
  | 'confirmado'
  | 'preparando'
  | 'en_camino'
  | 'cancelado'
  | 'entregado';

const CONFIRMATION_TIMEOUT_MS = 15 * 60 * 1000;

type DeliveryPayload = {
  mode?: 'pickup' | 'delivery';
  address?: string;
  reference?: string;
  instructions?: string;
  coordinates?: { lat?: number; lng?: number } | null;
  lat?: number;
  lng?: number;
  latitude?: number;
  longitude?: number;
  latitud?: number;
  longitud?: number;
};

type PedidoRow = {
  id: string;
  comercio_id?: string | null;
  estado?: OrderStatus | string | null;
  total?: number | null;
  costo_delivery?: number | null;
  nombre_cliente?: string | null;
  telefono_cliente?: string | null;
  cliente_email?: string | null;
  created_at?: string | null;
  detalles?: {
    order_id?: string;
    cliente_nombre?: string;
    cliente_email?: string;
    telefono_cliente?: string;
    moneda_checkout?: string;
    tasa_cambio_snapshot?: number;
    subtotal?: number;
    subtotal_moneda_checkout?: number;
    costo_delivery?: number;
    costo_delivery_moneda_checkout?: number;
    total?: number;
    total_moneda_checkout?: number;
    referencia_pago?: string;
    comprobante_url?: string;
    order_notes?: string;
    pago_con?: number;
    cambio_de?: number;
    metodo_pago?: {
      id?: string;
      nombre?: string;
      datos?: string[];
    } | null;
    notifications?: {
      whatsapp_enabled?: boolean;
      updated_at?: string;
    } | null;
    comercio_latitud?: number | string | null;
    latitud_comercio?: number | string | null;
    business_latitude?: number | string | null;
    comercio_longitud?: number | string | null;
    longitud_comercio?: number | string | null;
    business_longitude?: number | string | null;
    comercio_direccion?: string;
    direccion_comercio?: string;
    business_address?: string;
    comercio_nombre?: string;
    nombre_comercio?: string;
    business_name?: string;
    nombre_negocio?: string;
    telefono_comercio?: string;
    comercio_telefono?: string;
    business_phone?: string;
    delivery_delegate?: {
      status?: string;
      accepted_at?: string;
      arrived_at?: string;
      completed_at?: string;
    } | null;
    cancellation?: {
      reason?: string;
      source?: string;
      cancelled_at?: string;
    } | null;
    items?: Array<{
      nombre?: string;
      cantidad?: number;
      precio?: number;
      product_id?: string;
      opciones?: {
        tamanoId?: string;
        tamanoLabel?: string;
        servicioAdicional?: boolean;
        ajusteIds?: string[];
      };
    }>;
    delivery?: DeliveryPayload | null;
  } | null;
};

type ComercioRow = {
  id: string;
  nombre?: string | null;
  slug?: string | null;
  direccion?: string | null;
  latitud?: number | string | null;
  longitud?: number | string | null;
  whatsapp?: string | null;
  telefono?: string | null;
  telefonos?: string | null;
  celular?: string | null;
  logo_url?: string | null;
  recibe_pedidos_whatsapp?: boolean | null;
  en_linea?: boolean | null;
  horarios?: unknown;
  branding_ia?: {
    color_principal?: string | null;
    color_secundario?: string | null;
    fuente_titulos?: string | null;
    fuente_cuerpo?: string | null;
    colores_personalizados?: {
      background?: string | null;
      card_surface?: string | null;
      text_on_primary?: string | null;
    } | null;
  } | null;
};

const ORDER_FLOW: Array<{ key: OrderStatus; label: string; short: string }> = [
  { key: 'pendiente', label: 'Pedido recibido', short: 'Pendiente' },
  { key: 'confirmado', label: 'Pedido confirmado', short: 'Confirmado' },
  { key: 'preparando', label: 'Preparando tu pedido', short: 'Preparando' },
  { key: 'en_camino', label: 'Pedido en camino', short: 'En camino' },
  { key: 'cancelado', label: 'Pedido cancelado', short: 'Cancelado' },
  { key: 'entregado', label: 'Pedido entregado', short: 'Entregado' },
];

function toNumberOrNull(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const raw = (value ?? '').toString().trim();
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizePhone(value: string | null | undefined) {
  return (value ?? '').replace(/\D/g, '');
}

function normalizeStatus(value: unknown): OrderStatus {
  const status = (value ?? 'pendiente').toString().trim().toLowerCase();
  if (status === 'confirmado') return 'confirmado';
  if (status === 'preparando') return 'preparando';
  if (status === 'en_camino') return 'en_camino';
  if (status === 'entregado') return 'entregado';
  if (status === 'cancelado' || status === 'rechazado' || status === 'anulado') return 'cancelado';
  return 'pendiente';
}

type PublicTrackingPayload = {
  orderId: string;
  status: OrderStatus | string;
  createdAt: string;
  items: Array<{
    name: string;
    quantity: number;
    unitPrice?: number;
    productId?: string;
    selection?: {
      tamanoId?: string;
      tamanoLabel?: string;
      servicioAdicional?: boolean;
      ajusteIds?: string[];
    };
  }>;
  subtotal?: number;
  deliveryCost?: number;
  total?: number;
  currency?: string;
  deliveryType?: 'pickup' | 'delivery';
  locationHint?: string | null;
  deliveryProgress?: {
    delegateStatus: string | null;
    customerCanConfirm: boolean;
  };
  notifications: {
    whatsappEnabled: boolean;
  };
  permissions?: {
    canCancelAsCustomer: boolean;
    canConfirmReceived: boolean;
  };
  comercio: {
    nombre: string;
    slug?: string | null;
    whatsapp?: string | null;
    pickupAddress?: string | null;
    logoUrl?: string | null;
    branding?: ComercioRow['branding_ia'] | null;
  };
};

function mapPublicTracking(pub: PublicTrackingPayload): {
  order: PedidoRow;
  comercio: ComercioRow;
  locationHint: string;
} {
  const isDelivery = pub.deliveryType === 'delivery';
  return {
    order: {
      id: `public:${pub.orderId}`,
      estado: normalizeStatus(pub.status),
      created_at: pub.createdAt,
      total: pub.total ?? null,
      costo_delivery: pub.deliveryCost ?? null,
      detalles: {
        order_id: pub.orderId,
        moneda_checkout: pub.currency,
        subtotal: pub.subtotal,
        total: pub.total,
        costo_delivery: pub.deliveryCost,
        items: (pub.items ?? []).map((item) => ({
          nombre: item.name,
          cantidad: item.quantity,
          precio: item.unitPrice,
          product_id: item.productId,
          opciones: item.selection,
        })),
        delivery: isDelivery ? { mode: 'delivery' } : { mode: 'pickup' },
        notifications: {
          whatsapp_enabled: pub.notifications?.whatsappEnabled !== false,
        },
        delivery_delegate: {
          status: pub.deliveryProgress?.delegateStatus ?? undefined,
        },
      },
    },
    comercio: {
      id: 'public',
      nombre: pub.comercio?.nombre ?? 'Comercio',
      slug: pub.comercio?.slug ?? null,
      direccion: pub.comercio?.pickupAddress ?? null,
      whatsapp: pub.comercio?.whatsapp ?? null,
      logo_url: pub.comercio?.logoUrl ?? null,
      branding_ia: pub.comercio?.branding ?? null,
    },
    locationHint: (pub.locationHint ?? '').toString().trim(),
  };
}

function buildOrdersApiUrl(orderId: string, token: string) {
  const url = new URL(`/api/orders/${encodeURIComponent(orderId)}`, window.location.origin);
  url.searchParams.set('t', token);
  return `${url.pathname}${url.search}`;
}

function statusIndex(status: OrderStatus) {
  const index = ORDER_FLOW.findIndex((item) => item.key === status);
  return index >= 0 ? index : 0;
}

function statusLabel(status: OrderStatus) {
  return ORDER_FLOW.find((item) => item.key === status)?.label ?? 'Estado desconocido';
}

function formatCountdown(ms: number) {
  const safeMs = Math.max(0, ms);
  const totalSeconds = Math.ceil(safeMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

function formatCop(value: number | null | undefined) {
  const safeValue = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(safeValue);
}

function normalizeCurrencyCode(value: string | null | undefined) {
  const code = (value ?? '').toString().trim().toUpperCase();
  if (!code || code === 'SIN MONEDA') return 'COP';
  return code;
}

function formatAmountByCurrency(value: number | null | undefined, currency: string) {
  const safeValue = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  const normalized = normalizeCurrencyCode(currency);
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

function normalizeHexColor(value: unknown, fallback: string) {
  const raw = (value ?? '').toString().trim();
  if (!raw) return fallback;
  const normalized = raw.startsWith('#') ? raw : `#${raw}`;
  return /^#[0-9a-fA-F]{6}$/.test(normalized) ? normalized : fallback;
}

function readableOnColor(hex: string) {
  const raw = hex.replace('#', '');
  if (raw.length !== 6) return '#FFFFFF';
  const r = Number.parseInt(raw.slice(0, 2), 16) / 255;
  const g = Number.parseInt(raw.slice(2, 4), 16) / 255;
  const b = Number.parseInt(raw.slice(4, 6), 16) / 255;
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.62 ? '#111827' : '#FFFFFF';
}

function fontFamilyCssValue(primary: string | null | undefined, fallback: string) {
  const value = (primary ?? '').toString().trim();
  return value ? `${value}, ${fallback}` : fallback;
}

function convertFromCop(amountInCop: number, currency: string, exchangeRate: number) {
  const safeAmount = Number.isFinite(amountInCop) ? amountInCop : 0;
  const normalizedCurrency = normalizeCurrencyCode(currency);
  const safeRate = Number.isFinite(exchangeRate) && exchangeRate > 0 ? exchangeRate : 1;
  if (normalizedCurrency === 'COP') return safeAmount;
  return safeAmount / safeRate;
}

function buildWhatsAppLink(
  orderId: string,
  status: OrderStatus,
  comercio: ComercioRow | null,
) {
  if (comercio?.recibe_pedidos_whatsapp === false) return '';
  const phone = normalizePhone(comercio?.whatsapp);
  if (!phone) return '';

  const message =
    `Hola, quiero consultar mi pedido ${orderId}.\n` +
    `Estado actual: ${statusLabel(status)}.`;
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}

function resolveWhatsappNotificationsEnabled(order: PedidoRow | null | undefined) {
  const value = order?.detalles?.notifications?.whatsapp_enabled;
  return value !== false;
}

function OrderTrackingPageInner() {
  const params = useParams<{ orderId: string }>();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const orderId = decodeURIComponent(params?.orderId ?? '').trim();
  const trackingToken = (searchParams.get('t') ?? searchParams.get('token') ?? '').trim();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [order, setOrder] = useState<PedidoRow | null>(null);
  const [comercio, setComercio] = useState<ComercioRow | null>(null);
  const [menuIdentity, setMenuIdentity] = useState<ComercioRow | null>(null);
  const [waReceiptUrl, setWaReceiptUrl] = useState('');
  const [notificationMessage, setNotificationMessage] = useState('');
  const [whatsappNotificationsEnabled, setWhatsappNotificationsEnabled] = useState(true);
  const [whatsappPreferenceSaving, setWhatsappPreferenceSaving] = useState(false);
  const [cancelMessage, setCancelMessage] = useState('');
  const [cancelLoading, setCancelLoading] = useState(false);
  const [deliveryConfirmationLoading, setDeliveryConfirmationLoading] = useState(false);
  const [deliveryConfirmationMessage, setDeliveryConfirmationMessage] = useState('');
  const [nowTs, setNowTs] = useState(() => Date.now());
  const [syncMode, setSyncMode] = useState<'conectando' | 'realtime' | 'polling' | 'sin-senal'>('conectando');
  const [lastSyncAt, setLastSyncAt] = useState(0);
  const [locationHint, setLocationHint] = useState('');
  const [tokenRecoveryChecked, setTokenRecoveryChecked] = useState(false);
  const lastStatusRef = useRef<OrderStatus | null>(null);
  const autoCancelAttemptedRef = useRef(false);
  const whatsappPreferenceSavingRef = useRef(false);
  const trackingFetchInFlightRef = useRef(false);

  const resolvedStatus = useMemo(() => normalizeStatus(order?.estado), [order?.estado]);

  useEffect(() => {
    // Defense in depth alongside middleware Referrer-Policy: no-referrer.
    const meta = document.createElement('meta');
    meta.name = 'referrer';
    meta.content = 'no-referrer';
    document.head.appendChild(meta);
    return () => {
      meta.remove();
    };
  }, []);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setNowTs(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const key = `order-wa:${orderId}`;
    const storedWaUrl = window.sessionStorage.getItem(key) ?? '';
    if (storedWaUrl.trim()) {
      setWaReceiptUrl(storedWaUrl.trim());
      window.sessionStorage.removeItem(key);
    }
  }, [orderId]);

  useEffect(() => {
    if (trackingToken) {
      setTokenRecoveryChecked(true);
      return;
    }

    if (typeof window === 'undefined' || !orderId) {
      setTokenRecoveryChecked(true);
      return;
    }

    const storedTrackingUrl = window.sessionStorage.getItem(`order-tracking:${orderId}`)?.trim() ?? '';
    if (storedTrackingUrl) {
      try {
        const parsed = new URL(storedTrackingUrl, window.location.origin);
        const recoveredToken = (parsed.searchParams.get('t') ?? parsed.searchParams.get('token') ?? '').trim();
        if (recoveredToken && pathname) {
          router.replace(`${pathname}?t=${encodeURIComponent(recoveredToken)}`);
          return;
        }
      } catch {
        // Ignore malformed session URLs.
      }
    }

    setTokenRecoveryChecked(true);
  }, [orderId, pathname, router, trackingToken]);

  async function cancelOrder(source: 'cliente' | 'timeout') {
    if (!orderId || !trackingToken || cancelLoading) return;

    setCancelLoading(true);
    setCancelMessage('');

    try {
      const response = await fetch(buildOrdersApiUrl(orderId, trackingToken), {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'cancel',
          source,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message = (payload?.error ?? '').toString().trim();
        throw new Error(message || 'No se pudo cancelar el pedido.');
      }

      const publicOrder = (payload?.data ?? null) as PublicTrackingPayload | null;
      if (publicOrder?.orderId) {
        const mapped = mapPublicTracking(publicOrder);
        setOrder(mapped.order);
        setComercio(mapped.comercio);
        setLocationHint(mapped.locationHint);
        setWhatsappNotificationsEnabled(resolveWhatsappNotificationsEnabled(mapped.order));
      }

      setCancelMessage(
        source === 'timeout'
          ? 'El pedido fue cancelado por falta de confirmacion en 15 minutos.'
          : 'Tu pedido fue cancelado correctamente.',
      );
    } catch (cancelError) {
      const message = cancelError instanceof Error ? cancelError.message : 'No se pudo cancelar el pedido.';
      setCancelMessage(message);
    } finally {
      setCancelLoading(false);
    }
  }

  async function confirmDeliveryReceived() {
    if (!orderId || !trackingToken || deliveryConfirmationLoading) return;

    setDeliveryConfirmationLoading(true);
    setDeliveryConfirmationMessage('');

    try {
      const response = await fetch(buildOrdersApiUrl(orderId, trackingToken), {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'confirm_received',
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message = (payload?.error ?? '').toString().trim();
        throw new Error(message || 'No se pudo confirmar la entrega.');
      }

      const publicOrder = (payload?.data ?? null) as PublicTrackingPayload | null;
      if (publicOrder?.orderId) {
        const mapped = mapPublicTracking(publicOrder);
        setOrder(mapped.order);
        setComercio(mapped.comercio);
        setLocationHint(mapped.locationHint);
      }

      setDeliveryConfirmationMessage('Gracias por confirmar. El pedido fue completado.');
    } catch (confirmationError) {
      const message =
        confirmationError instanceof Error
          ? confirmationError.message
          : 'No se pudo confirmar la entrega.';
      setDeliveryConfirmationMessage(message);
    } finally {
      setDeliveryConfirmationLoading(false);
    }
  }

  async function updateWhatsappNotificationsPreference(enabled: boolean) {
    if (!orderId || !trackingToken || whatsappPreferenceSavingRef.current) return;

    const previous = whatsappNotificationsEnabled;
    whatsappPreferenceSavingRef.current = true;
    setWhatsappNotificationsEnabled(enabled);
    setWhatsappPreferenceSaving(true);
    setNotificationMessage('');

    try {
      const response = await fetch(buildOrdersApiUrl(orderId, trackingToken), {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'set_whatsapp_notifications',
          enabled,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message = (payload?.error ?? '').toString().trim();
        throw new Error(message || 'No se pudo actualizar la preferencia de WhatsApp.');
      }

      const publicOrder = (payload?.data ?? null) as PublicTrackingPayload | null;
      if (publicOrder?.orderId) {
        const mapped = mapPublicTracking(publicOrder);
        setOrder(mapped.order);
        setLocationHint(mapped.locationHint);
        setWhatsappNotificationsEnabled(resolveWhatsappNotificationsEnabled(mapped.order));
      }
    } catch (preferenceError) {
      setWhatsappNotificationsEnabled(previous);
      const message = preferenceError instanceof Error
        ? preferenceError.message
        : 'No se pudo actualizar la preferencia de WhatsApp.';
      setNotificationMessage(message);
    } finally {
      whatsappPreferenceSavingRef.current = false;
      setWhatsappPreferenceSaving(false);
    }
  }

  useEffect(() => {
    if (!tokenRecoveryChecked) {
      return;
    }

    if (!orderId) {
      setLoading(false);
      setError('ORDER_ID invalido.');
      return;
    }

    if (!trackingToken) {
      setLoading(false);
      setOrder(null);
      setError(
        'Este enlace de seguimiento no es valido o ha expirado. Abre el enlace completo que recibiste por WhatsApp o correo (debe incluir ?t=...).',
      );
      return;
    }

    let active = true;

    const applyPublic = (publicOrder: PublicTrackingPayload) => {
      const mapped = mapPublicTracking(publicOrder);
      setOrder(mapped.order);
      setComercio(mapped.comercio);
      setLocationHint(mapped.locationHint);
      if (!whatsappPreferenceSavingRef.current) {
        setWhatsappNotificationsEnabled(resolveWhatsappNotificationsEnabled(mapped.order));
      }
      lastStatusRef.current = normalizeStatus(mapped.order.estado);
      setLastSyncAt(Date.now());
      setSyncMode('polling');
    };

    const fetchOrder = async (mode: 'initial' | 'poll') => {
      if (mode === 'poll' && (whatsappPreferenceSavingRef.current || trackingFetchInFlightRef.current)) {
        return;
      }
      trackingFetchInFlightRef.current = true;

      try {
        if (mode === 'initial') {
          setLoading(true);
          setError(null);
        }

        const response = await fetch(buildOrdersApiUrl(orderId, trackingToken), { cache: 'no-store' });
        const payload = await response.json().catch(() => ({}));

        if (!active) return;

        if (!response.ok) {
          if (mode === 'initial') {
            setOrder(null);
            setComercio(null);
            setError('Este enlace de seguimiento no es valido o ha expirado.');
          } else {
            setSyncMode('sin-senal');
          }
          return;
        }

        const publicOrder = (payload?.data ?? null) as PublicTrackingPayload | null;
        if (!publicOrder?.orderId) {
          if (mode === 'initial') {
            setOrder(null);
            setError('Pedido no encontrado.');
          } else {
            setSyncMode('sin-senal');
          }
          return;
        }

        applyPublic(publicOrder);
      } catch {
        if (!active) return;
        if (mode === 'initial') {
          setError('No se pudo cargar el pedido.');
        } else {
          setSyncMode('sin-senal');
        }
      } finally {
        trackingFetchInFlightRef.current = false;
        if (active && mode === 'initial') {
          setLoading(false);
        }
      }
    };

    void fetchOrder('initial');

    const pollingIntervalId = window.setInterval(() => {
      if (!active) return;
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      void fetchOrder('poll');
    }, 20_000);

    return () => {
      active = false;
      window.clearInterval(pollingIntervalId);
    };
  }, [orderId, tokenRecoveryChecked, trackingToken]);

  const delivery = order?.detalles?.delivery ?? null;
  const isDelivery = (delivery?.mode ?? 'pickup') === 'delivery';

  const subtotal = toNumberOrNull(order?.detalles?.subtotal) ?? toNumberOrNull(order?.total) ?? 0;
  const costoDelivery = toNumberOrNull(order?.costo_delivery) ?? toNumberOrNull(order?.detalles?.costo_delivery) ?? 0;
  const total = toNumberOrNull(order?.detalles?.total) ?? (subtotal + costoDelivery);
  const checkoutCurrency = normalizeCurrencyCode(order?.detalles?.moneda_checkout ?? 'COP');
  const exchangeRate = toNumberOrNull(order?.detalles?.tasa_cambio_snapshot) ?? 1;
  const subtotalCheckout =
    toNumberOrNull(order?.detalles?.subtotal_moneda_checkout) ??
    convertFromCop(subtotal, checkoutCurrency, exchangeRate);
  const deliveryCheckout =
    toNumberOrNull(order?.detalles?.costo_delivery_moneda_checkout) ??
    convertFromCop(costoDelivery, checkoutCurrency, exchangeRate);
  const totalCheckout =
    toNumberOrNull(order?.detalles?.total_moneda_checkout) ??
    convertFromCop(total, checkoutCurrency, exchangeRate);

  const paymentReference = (order?.detalles?.referencia_pago ?? '').toString().trim();
  const cashChangeAmount = toNumberOrNull(order?.detalles?.cambio_de) ?? 0;
  const orderNotes = (order?.detalles?.order_notes ?? '').toString().trim();
  const deliveryDelegate = order?.detalles?.delivery_delegate ?? null;
  const deliveryDelegateStatus = (deliveryDelegate?.status ?? '').toString().trim().toLowerCase();
  const deliveryDelegateAcceptedAt = (deliveryDelegate?.accepted_at ?? '').toString().trim();
  const deliveryDelegateArrivedAt = (deliveryDelegate?.arrived_at ?? '').toString().trim();
  const deliveryDelegateCompletedAt = (deliveryDelegate?.completed_at ?? '').toString().trim();
  const deliveryDelegateLabel =
    deliveryDelegateStatus === 'pending'
      ? 'Pedido delegado. Esperando aceptacion del repartidor.'
      : deliveryDelegateStatus === 'accepted'
        ? 'Repartidor asignado y en ruta.'
        : deliveryDelegateStatus === 'arrived'
          ? 'Repartidor reporto llegada al punto.'
          : deliveryDelegateStatus === 'completed'
            ? 'Repartidor marco la entrega como completada.'
            : deliveryDelegateStatus === 'revoked'
              ? 'La delegacion del repartidor fue revocada por el comercio.'
              : deliveryDelegateStatus === 'expired'
                ? 'La delegacion del repartidor expiro.'
                : '';
  const paymentMethodName = (order?.detalles?.metodo_pago?.nombre ?? '').toString().trim();
  const paymentMethodDetails = Array.isArray(order?.detalles?.metodo_pago?.datos)
    ? order?.detalles?.metodo_pago?.datos ?? []
    : [];
  const orderItems = (order?.detalles?.items ?? []).map((item) => {
    const quantity = toNumberOrNull(item?.cantidad) ?? 0;
    const unitPriceCop = toNumberOrNull(item?.precio) ?? 0;
    const unitPriceCheckout = convertFromCop(unitPriceCop, checkoutCurrency, exchangeRate);
    const subtotalCop = quantity * unitPriceCop;
    const subtotalCheckoutValue = convertFromCop(subtotalCop, checkoutCurrency, exchangeRate);
    return {
      nombre: (item?.nombre ?? 'Producto').toString().trim() || 'Producto',
      cantidad: quantity,
      precioUnitario: unitPriceCheckout,
      subtotal: subtotalCheckoutValue,
    };
  }).filter((item) => item.cantidad > 0);

  const resolvedComercio = useMemo(() => {
    const trackingName = (comercio?.nombre ?? '').trim();
    const keepTrackingName = Boolean(trackingName) && trackingName.toLowerCase() !== 'comercio';
    return {
      id: comercio?.id ?? menuIdentity?.id ?? 'public',
      nombre: keepTrackingName ? trackingName : ((menuIdentity?.nombre ?? trackingName).trim() || 'Comercio'),
      slug: (comercio?.slug ?? menuIdentity?.slug ?? '').trim() || null,
      logo_url: (comercio?.logo_url ?? '').trim() || (menuIdentity?.logo_url ?? '').trim() || null,
      whatsapp: (comercio?.whatsapp ?? '').trim() || (menuIdentity?.whatsapp ?? '').trim() || null,
      telefono: comercio?.telefono ?? menuIdentity?.telefono ?? null,
      telefonos: comercio?.telefonos ?? null,
      celular: comercio?.celular ?? null,
      direccion: (comercio?.direccion ?? '').trim() || (menuIdentity?.direccion ?? '').trim() || null,
      recibe_pedidos_whatsapp:
        menuIdentity?.recibe_pedidos_whatsapp ?? comercio?.recibe_pedidos_whatsapp ?? true,
      en_linea: menuIdentity?.en_linea ?? comercio?.en_linea ?? true,
      horarios: menuIdentity?.horarios ?? comercio?.horarios,
      branding_ia: comercio?.branding_ia ?? menuIdentity?.branding_ia ?? null,
    } satisfies ComercioRow;
  }, [comercio, menuIdentity]);

  const contactName = (order?.nombre_cliente ?? order?.detalles?.cliente_nombre ?? '').toString().trim();
  const contactPhone = (order?.telefono_cliente ?? order?.detalles?.telefono_cliente ?? '').toString().trim();
  const contactEmail = (order?.cliente_email ?? order?.detalles?.cliente_email ?? '').toString().trim();
  const businessName = (
    resolvedComercio.nombre ??
    order?.detalles?.comercio_nombre ??
    order?.detalles?.nombre_comercio ??
    order?.detalles?.business_name ??
    order?.detalles?.nombre_negocio ??
    ''
  ).toString().trim();
  const businessAddress = (resolvedComercio.direccion ?? '').toString().trim();

  const fallbackWaLink = useMemo(
    () => buildWhatsAppLink(orderId, resolvedStatus, resolvedComercio),
    [orderId, resolvedComercio, resolvedStatus],
  );
  const allowsWhatsapp = resolvedComercio.recibe_pedidos_whatsapp !== false;
  const finalWaLink = allowsWhatsapp ? fallbackWaLink || waReceiptUrl : '';
  const branding = resolvedComercio.branding_ia ?? null;
  const trackingPrimary = normalizeHexColor(branding?.color_principal, '#FF7A00');
  const trackingSecondary = normalizeHexColor(branding?.color_secundario, '#0F172A');
  const trackingBackground = normalizeHexColor(branding?.colores_personalizados?.background, '#F8FAFC');
  const trackingSurface = normalizeHexColor(branding?.colores_personalizados?.card_surface, '#FFFFFF');
  const trackingOnPrimary = branding?.colores_personalizados?.text_on_primary
    ? normalizeHexColor(branding.colores_personalizados.text_on_primary, readableOnColor(trackingPrimary))
    : readableOnColor(trackingPrimary);
  const titleFontFamily = fontFamilyCssValue(branding?.fuente_titulos, 'Montserrat, sans-serif');
  const bodyFontFamily = fontFamilyCssValue(branding?.fuente_cuerpo, 'Roboto, sans-serif');

  useEffect(() => {
    const slug = (comercio?.slug ?? '').trim();
    if (!slug || !orderId || !trackingToken || !pathname?.startsWith('/orders/')) return;
    const next = `/v/${encodeURIComponent(slug)}/orders/${encodeURIComponent(orderId)}?t=${encodeURIComponent(trackingToken)}`;
    router.replace(next);
  }, [comercio?.slug, orderId, pathname, router, trackingToken]);

  useEffect(() => {
    const match = pathname?.match(/\/v\/([^/]+)\/orders\//i);
    const slug = decodeURIComponent(match?.[1] ?? '').trim();
    if (!slug) return;

    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(`/api/menu/${encodeURIComponent(slug)}`, { cache: 'no-store' });
        const payload = await response.json().catch(() => ({}));
        const menuComercio = (payload?.data?.comercio ?? null) as Record<string, unknown> | null;
        if (!menuComercio || cancelled) return;

        const nextName = (menuComercio.nombre ?? '').toString().trim();
        const nextLogo = (menuComercio.logo_url ?? '').toString().trim();
        const nextPhone = (menuComercio.whatsapp ?? '').toString().trim();
        const nextAddress = (menuComercio.direccion ?? '').toString().trim();
        const nextPrimary = (menuComercio.color_principal ?? menuComercio.menu_palette_primary ?? '').toString().trim();
        const allowsWhatsapp = menuComercio.recibe_pedidos_whatsapp !== false;

        setMenuIdentity({
          id: 'menu',
          nombre: nextName || 'Comercio',
          slug,
          logo_url: nextLogo || null,
          whatsapp: nextPhone || null,
          direccion: nextAddress || null,
          recibe_pedidos_whatsapp: allowsWhatsapp,
          en_linea: menuComercio.en_linea !== false,
          horarios: menuComercio.horarios,
          branding_ia: nextPrimary ? { color_principal: nextPrimary } : null,
        });
      } catch {
        // Decorative identity only; tracking still works without it.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pathname]);

  const displayStatus: OrderStatus = (!isDelivery && resolvedStatus === 'en_camino')
    ? 'preparando'
    : resolvedStatus;
  const orderCreatedAtMs = order?.created_at ? Date.parse(order.created_at) : NaN;
  const hasCreatedAt = Number.isFinite(orderCreatedAtMs);
  const pendingElapsedMs = (displayStatus === 'pendiente' && hasCreatedAt)
    ? Math.max(0, nowTs - orderCreatedAtMs)
    : 0;
  const confirmTimeLeftMs = Math.max(0, CONFIRMATION_TIMEOUT_MS - pendingElapsedMs);
  const pendingExpired = displayStatus === 'pendiente' && hasCreatedAt && pendingElapsedMs >= CONFIRMATION_TIMEOUT_MS;
  const canCustomerCancel = displayStatus === 'pendiente' && pendingExpired;
  const canCustomerConfirmDelegatedDelivery =
    isDelivery &&
    deliveryDelegateStatus === 'arrived' &&
    displayStatus !== 'cancelado' &&
    displayStatus !== 'entregado';
  const cancellationMeta = order?.detalles?.cancellation ?? null;

  useEffect(() => {
    if (!pendingExpired || autoCancelAttemptedRef.current) return;
    autoCancelAttemptedRef.current = true;
    void cancelOrder('timeout');
  }, [pendingExpired]);

  useEffect(() => {
    if (displayStatus !== 'pendiente') {
      autoCancelAttemptedRef.current = false;
    }
  }, [displayStatus]);

  if (loading) {
    return (
      <OrderReceiptFrame background={trackingBackground} bodyFont={bodyFontFamily}>
        <div className="text-center">
          <div className="mx-auto h-9 w-9 animate-spin rounded-full border-2 border-slate-300" style={{ borderTopColor: trackingPrimary }} />
          <p className="mt-3 text-sm text-slate-500">Cargando tu pedido...</p>
        </div>
      </OrderReceiptFrame>
    );
  }

  if (error) {
    return (
      <OrderReceiptFrame background={trackingBackground} bodyFont={bodyFontFamily}>
        <p className="max-w-md text-center text-sm text-slate-600">{error}</p>
      </OrderReceiptFrame>
    );
  }

  if (!order) {
    return (
      <OrderReceiptFrame background={trackingBackground} bodyFont={bodyFontFamily}>
        <section className="max-w-lg rounded-[22px] bg-white p-8 text-center shadow-[0_8px_30px_rgba(15,23,42,0.06)]">
          <p className="text-lg font-bold text-slate-950" style={{ fontFamily: titleFontFamily }}>Pedido no encontrado</p>
          <p className="mt-2 text-sm text-slate-600">Verifica el enlace o intenta de nuevo en unos minutos.</p>
          <Link
            href="/"
            className="mt-5 inline-flex rounded-full px-5 py-3 text-sm font-bold transition"
            style={{ backgroundColor: trackingPrimary, color: trackingOnPrimary }}
          >
            Ir al inicio
          </Link>
        </section>
      </OrderReceiptFrame>
    );
  }

  const createdAtLabel = order?.created_at
    ? new Intl.DateTimeFormat('es-CO', {
        day: 'numeric',
        month: 'short',
        hour: 'numeric',
        minute: '2-digit',
      }).format(new Date(order.created_at))
    : '';
  const timelineItemsBase = [
    { key: 'pendiente', label: 'Recibido' },
    { key: 'confirmado', label: 'Aceptado' },
    { key: 'preparando', label: 'Preparando' },
    { key: 'en_camino', label: 'En camino' },
    { key: 'entregado', label: isDelivery ? 'Entregado' : 'Listo' },
  ] as const;
  const timelineItems = isDelivery
    ? timelineItemsBase
    : timelineItemsBase.filter((item) => item.key !== 'en_camino');
  const currentStep = Math.max(0, timelineItems.findIndex((item) => item.key === displayStatus));
  const paymentLabel = paymentMethodName
    ? paymentReference
      ? `${paymentMethodName} · ****${paymentReference.slice(-4)}`
      : paymentMethodName
    : '';
  const paymentDetails = paymentMethodDetails.slice(0, 2).join(' · ') || null;
  const cancelDetail =
    cancellationMeta?.reason === 'timeout_no_confirmacion'
      ? 'El comercio no confirmó dentro de 15 minutos.'
      : cancellationMeta?.reason === 'cancelado_por_cliente'
        ? 'Cancelaste este pedido.'
        : '';
  const pathSlugMatch = pathname?.match(/\/v\/([^/]+)\/orders\//i);
  const menuSlug = (
    resolvedComercio.slug ??
    decodeURIComponent(pathSlugMatch?.[1] ?? '')
  ).trim();
  const menuHref = menuSlug ? `/v/${encodeURIComponent(menuSlug)}` : null;
  const scheduleStatus = resolveBusinessScheduleStatus(resolvedComercio.horarios);
  const businessAcceptingOrders =
    resolvedComercio.en_linea !== false &&
    (!scheduleStatus.configured || scheduleStatus.isOpen);
  const repeatableItems = (order?.detalles?.items ?? [])
    .map((item): RepeatOrderLine | null => {
      const productId = (item.product_id ?? '').toString().trim();
      const quantity = Number(item.cantidad);
      if (!productId || !Number.isFinite(quantity) || quantity <= 0) return null;
      return {
        productId,
        quantity: Math.min(99, Math.round(quantity)),
        selection: item.opciones,
      };
    })
    .filter((item): item is RepeatOrderLine => item !== null);
  const canRepeatOrder = Boolean(menuHref && menuIdentity && repeatableItems.length > 0 && businessAcceptingOrders);
  const repeatClosedReason =
    menuHref && menuIdentity && repeatableItems.length > 0 && !businessAcceptingOrders
      ? scheduleStatus.nextOpenLabel
        ? `El negocio está cerrado. Abrimos ${scheduleStatus.nextOpenLabel}`
        : 'El negocio está cerrado ahora'
      : null;
  const formatStamp = (value: string) => {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? new Date(parsed).toLocaleString('es-CO') : '';
  };
  function handleRepeatOrder() {
    if (!canRepeatOrder || !menuHref || !menuSlug || repeatableItems.length === 0) return;
    writeRepeatOrder(menuSlug, {
      items: repeatableItems,
      fulfillment: isDelivery ? 'delivery' : 'takeaway',
    });
    router.push(menuHref);
  }

  return (
    <OrderReceipt
      businessName={businessName || 'Comercio'}
      logoUrl={(resolvedComercio.logo_url ?? '').trim() || null}
      menuHref={menuHref}
      orderShortId={orderId ? `#${orderId.slice(-8).toUpperCase()}` : '#N/A'}
      createdAtLabel={createdAtLabel}
      status={displayStatus}
      isDelivery={isDelivery}
      locationHint={locationHint}
      pickupAddress={!isDelivery ? businessAddress : ''}
      timeline={timelineItems.map((item) => ({ key: item.key, label: item.label }))}
      currentStep={currentStep}
      pendingExpired={pendingExpired}
      confirmTimeLeftLabel={formatCountdown(confirmTimeLeftMs)}
      confirmProgress={CONFIRMATION_TIMEOUT_MS > 0 ? Math.min(1, pendingElapsedMs / CONFIRMATION_TIMEOUT_MS) : 0}
      items={orderItems.map((item) => ({
        name: item.nombre,
        quantity: item.cantidad,
        amountLabel: formatAmountByCurrency(item.subtotal, checkoutCurrency),
      }))}
      subtotalLabel={formatAmountByCurrency(subtotalCheckout, checkoutCurrency)}
      deliveryLabel={isDelivery || deliveryCheckout > 0 ? formatAmountByCurrency(deliveryCheckout, checkoutCurrency) : null}
      cashChangeLabel={cashChangeAmount > 0 ? formatAmountByCurrency(cashChangeAmount, checkoutCurrency) : null}
      totalLabel={formatAmountByCurrency(totalCheckout, checkoutCurrency)}
      paymentLabel={paymentLabel || null}
      paymentDetails={paymentDetails}
      orderNotes={orderNotes}
      cancelDetail={
        cancelDetail ||
        (displayStatus === 'cancelado'
          ? (cancelMessage || 'Si necesitas ayuda, escríbeles por WhatsApp.')
          : '')
      }
      deliveryDelegateLabel={deliveryDelegateLabel}
      deliveryDelegateAcceptedAt={formatStamp(deliveryDelegateAcceptedAt)}
      deliveryDelegateArrivedAt={formatStamp(deliveryDelegateArrivedAt)}
      deliveryDelegateCompletedAt={formatStamp(deliveryDelegateCompletedAt)}
      contactName={contactName}
      contactPhone={contactPhone}
      contactEmail={contactEmail}
      whatsappHref={finalWaLink}
      showWhatsapp={allowsWhatsapp}
      whatsappReady={displayStatus !== 'pendiente' && displayStatus !== 'cancelado'}
      canRepeatOrder={canRepeatOrder}
      repeatClosedReason={repeatClosedReason}
      onRepeatOrder={handleRepeatOrder}
      canCustomerConfirmDelegatedDelivery={canCustomerConfirmDelegatedDelivery}
      deliveryConfirmationLoading={deliveryConfirmationLoading}
      deliveryConfirmationMessage={deliveryConfirmationMessage}
      onConfirmDelivery={() => {
        if (typeof window !== 'undefined') {
          const accepted = window.confirm('Confirma que recibiste todo correctamente para completar el pedido.');
          if (!accepted) return;
        }
        void confirmDeliveryReceived();
      }}
      canCustomerCancel={canCustomerCancel}
      cancelLoading={cancelLoading}
      cancelMessage={displayStatus === 'cancelado' ? '' : cancelMessage}
      onCancelOrder={() => {
        if (typeof window !== 'undefined') {
          const accepted = window.confirm('Vas a cancelar este pedido. Esta acción no se puede deshacer.');
          if (!accepted) return;
        }
        void cancelOrder('cliente');
      }}
      showPendingCancelHint={displayStatus === 'pendiente' && !pendingExpired}
      whatsappNotificationsEnabled={whatsappNotificationsEnabled}
      whatsappPreferenceSaving={whatsappPreferenceSaving}
      notificationMessage={notificationMessage}
      onSetWhatsappNotifications={(enabled) => void updateWhatsappNotificationsPreference(enabled)}
      colors={{
        primary: trackingPrimary,
        secondary: trackingSecondary,
        background: trackingBackground,
        surface: trackingSurface,
        onPrimary: trackingOnPrimary,
        titleFont: titleFontFamily,
        bodyFont: bodyFontFamily,
      }}
    />
  );
}

export default function OrderTrackingPage() {
  return (
    <Suspense
      fallback={
        <main className="grid min-h-screen place-items-center px-6 text-slate-900">
          <p className="text-sm text-slate-500">Cargando seguimiento...</p>
        </main>
      }
    >
      <OrderTrackingPageInner />
    </Suspense>
  );
}
