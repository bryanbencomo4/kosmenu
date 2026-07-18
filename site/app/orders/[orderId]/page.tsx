'use client';

import { CreditCard, MapPin, MessageCircle, Package, Phone, Store } from 'lucide-react';
import Link from 'next/link';
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';

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
  items: Array<{ name: string; quantity: number; unitPrice?: number }>;
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

function buildWhatsAppLink(orderId: string, status: OrderStatus, comercio: ComercioRow | null) {
  const phone = normalizePhone(
    comercio?.whatsapp ?? comercio?.telefono ?? comercio?.telefonos ?? comercio?.celular,
  );
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
  const lastStatusRef = useRef<OrderStatus | null>(null);
  const autoCancelAttemptedRef = useRef(false);

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
    if (!orderId || !trackingToken || whatsappPreferenceSaving) return;

    const previous = whatsappNotificationsEnabled;
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
        setComercio(mapped.comercio);
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
      setWhatsappPreferenceSaving(false);
    }
  }

  useEffect(() => {
    if (!orderId) {
      setLoading(false);
      setError('ORDER_ID invalido.');
      return;
    }

    if (!trackingToken) {
      setLoading(false);
      setOrder(null);
      setError('Este enlace de seguimiento no es valido o ha expirado.');
      return;
    }

    let active = true;

    const applyPublic = (publicOrder: PublicTrackingPayload) => {
      const mapped = mapPublicTracking(publicOrder);
      setOrder(mapped.order);
      setComercio(mapped.comercio);
      setLocationHint(mapped.locationHint);
      setWhatsappNotificationsEnabled(resolveWhatsappNotificationsEnabled(mapped.order));
      lastStatusRef.current = normalizeStatus(mapped.order.estado);
      setLastSyncAt(Date.now());
      setSyncMode('polling');
    };

    const fetchOrder = async (mode: 'initial' | 'poll') => {
      try {
        if (mode === 'initial') {
          setLoading(true);
          setError(null);
        }

        const response = await fetch(buildOrdersApiUrl(orderId, trackingToken), { cache: 'no-store' });
        const payload = await response.json().catch(() => ({}));

        if (!active) return;

        if (!response.ok) {
          setOrder(null);
          setComercio(null);
          if (mode === 'initial') {
            setError('Este enlace de seguimiento no es valido o ha expirado.');
          } else {
            setSyncMode('sin-senal');
          }
          return;
        }

        const publicOrder = (payload?.data ?? null) as PublicTrackingPayload | null;
        if (!publicOrder?.orderId) {
          setOrder(null);
          if (mode === 'initial') {
            setError('Pedido no encontrado.');
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
    }, 8000);

    return () => {
      active = false;
      window.clearInterval(pollingIntervalId);
    };
  }, [orderId, trackingToken]);

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

  const contactName = (order?.nombre_cliente ?? order?.detalles?.cliente_nombre ?? '').toString().trim();
  const contactPhone = (order?.telefono_cliente ?? order?.detalles?.telefono_cliente ?? '').toString().trim();
  const contactEmail = (order?.cliente_email ?? order?.detalles?.cliente_email ?? '').toString().trim();
  const businessName = (
    comercio?.nombre ??
    order?.detalles?.comercio_nombre ??
    order?.detalles?.nombre_comercio ??
    order?.detalles?.business_name ??
    order?.detalles?.nombre_negocio ??
    ''
  ).toString().trim();
  const businessAddress = (comercio?.direccion ?? '').toString().trim();
  const businessPhoneRaw = (
    comercio?.whatsapp ??
    comercio?.telefono ??
    comercio?.telefonos ??
    comercio?.celular ??
    ''
  ).toString().trim();

  const fallbackWaLink = useMemo(
    () => buildWhatsAppLink(orderId, resolvedStatus, comercio),
    [comercio, orderId, resolvedStatus],
  );
  const finalWaLink = waReceiptUrl || fallbackWaLink;
  const branding = comercio?.branding_ia ?? null;
  const trackingPrimary = normalizeHexColor(branding?.color_principal, '#FF7A00');
  const trackingSecondary = normalizeHexColor(branding?.color_secundario, '#0F172A');
  const trackingBackground = normalizeHexColor(branding?.colores_personalizados?.background, '#F8FAFC');
  const trackingSurface = normalizeHexColor(branding?.colores_personalizados?.card_surface, '#FFFFFF');
  const trackingOnPrimary = normalizeHexColor(branding?.colores_personalizados?.text_on_primary, '#FFFFFF');
  const titleFontFamily = fontFamilyCssValue(branding?.fuente_titulos, 'Montserrat, sans-serif');
  const bodyFontFamily = fontFamilyCssValue(branding?.fuente_cuerpo, 'Roboto, sans-serif');

  useEffect(() => {
    const slug = (comercio?.slug ?? '').trim();
    if (!slug || !orderId || !trackingToken || !pathname?.startsWith('/orders/')) return;
    const next = `/v/${encodeURIComponent(slug)}/orders/${encodeURIComponent(orderId)}?t=${encodeURIComponent(trackingToken)}`;
    router.replace(next);
  }, [comercio?.slug, orderId, pathname, router, trackingToken]);

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
      <main className="grid min-h-screen place-items-center px-6 text-slate-900" style={{ background: trackingBackground, fontFamily: bodyFontFamily }}>
        <div className="text-center">
          <div className="mx-auto h-9 w-9 animate-spin rounded-full border-2 border-slate-300" style={{ borderTopColor: trackingPrimary }} />
          <p className="mt-3 text-sm text-slate-500">Cargando seguimiento...</p>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="grid min-h-screen place-items-center px-6 text-slate-900" style={{ background: trackingBackground, fontFamily: bodyFontFamily }}>
        <p className="max-w-md text-center text-sm text-slate-600">{error}</p>
      </main>
    );
  }

  if (!order) {
    const missingOrderStyle: CSSProperties & { '--tracking-primary': string } = {
      backgroundColor: trackingSurface,
      border: '1px solid color-mix(in srgb, var(--tracking-primary) 18%, white)',
      '--tracking-primary': trackingPrimary,
    };

    return (
      <main className="grid min-h-screen place-items-center px-6 text-slate-900" style={{ background: trackingBackground, fontFamily: bodyFontFamily }}>
        <section className="max-w-lg rounded-3xl p-8 text-center shadow-xl" style={missingOrderStyle}>
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
      </main>
    );
  }

  const createdAtTime = order?.created_at
    ? new Intl.DateTimeFormat('es-CO', {
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(order.created_at))
    : '--:--';
  const borderTone = `color-mix(in srgb, ${trackingSecondary} 12%, white)`;
  const softTone = `color-mix(in srgb, ${trackingPrimary} 8%, white)`;
  const mutedTone = `color-mix(in srgb, ${trackingSecondary} 8%, white)`;
  const statusTitle =
    displayStatus === 'entregado'
      ? 'ENTREGADO'
      : displayStatus === 'cancelado'
        ? 'CANCELADO'
      : displayStatus === 'en_camino'
        ? 'EN CAMINO'
        : displayStatus === 'preparando'
          ? 'EN PREPARACION'
          : displayStatus === 'confirmado'
            ? 'CONFIRMADO'
            : 'RECIBIDO';
  const callPhone = normalizePhone(businessPhoneRaw);
  const callHref = callPhone ? `tel:+${callPhone}` : '';
  const syncLabel =
    syncMode === 'polling' || syncMode === 'realtime'
      ? 'Actualizacion activa'
      : syncMode === 'sin-senal'
        ? 'Sin senal'
        : 'Conectando...';
  const syncColor =
    syncMode === 'polling' || syncMode === 'realtime'
      ? '#16A34A'
      : syncMode === 'sin-senal'
        ? '#DC2626'
        : '#64748B';
  const lastSyncLabel = lastSyncAt
    ? new Intl.DateTimeFormat('es-CO', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }).format(new Date(lastSyncAt))
    : '';
  const timelineItemsBase = [
    { key: 'pendiente', label: 'Peticion', icon: MessageCircle },
    { key: 'confirmado', label: 'Confirmado', icon: CreditCard },
    { key: 'preparando', label: 'En preparacion', icon: Store },
    { key: 'en_camino', label: 'En camino', icon: MapPin },
    { key: 'entregado', label: 'Entregado', icon: Package },
  ] as const;
  const timelineItems = isDelivery
    ? timelineItemsBase
    : timelineItemsBase.filter((item) => item.key !== 'en_camino');
  const currentStep = Math.max(0, timelineItems.findIndex((item) => item.key === displayStatus));

  return (
    <main
      className="min-h-screen px-3 py-6 text-slate-900 sm:px-6"
      style={{
        background: `linear-gradient(180deg, color-mix(in srgb, ${trackingPrimary} 4%, white) 0%, #F3F4F6 32%, #F3F4F6 100%)`,
        fontFamily: bodyFontFamily,
      }}
    >
      <section className="mx-auto max-w-xl">
        <div className="mx-auto w-full overflow-hidden rounded-[34px] bg-white shadow-[0_30px_80px_rgba(15,23,42,0.18)]" style={{ border: `1px solid ${borderTone}`, maxWidth: 400 }}>
          <div className="h-2 w-full" style={{ backgroundColor: '#E5E7EB' }} />
          <div className="px-4 pb-6 pt-2 sm:px-5">
            <div className="rounded-t-[18px] rounded-b-md px-4 py-2 text-center text-lg font-black tracking-wide" style={{ backgroundColor: trackingPrimary, color: trackingOnPrimary, fontFamily: titleFontFamily }}>
              {statusTitle}
            </div>

            <div className="mt-2 rounded-b-2xl border border-slate-200 px-4 py-3">
              <p className="text-center text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Hora del pedido</p>
              <p className="mt-1 text-center text-3xl font-black text-slate-950" style={{ fontFamily: titleFontFamily }}>
                {createdAtTime}
              </p>

              <div className="mt-4 flex items-center justify-between gap-3 border-t border-slate-200 pt-3">
                <div className="flex min-w-0 items-center gap-2">
                  {comercio?.logo_url ? (
                    <img src={comercio.logo_url} alt={comercio?.nombre ?? 'Comercio'} className="h-7 w-7 rounded-md object-cover" />
                  ) : (
                    <span className="grid h-7 w-7 place-items-center rounded-md bg-slate-100 text-[11px] font-black text-slate-600">KM</span>
                  )}
                  <p className="truncate text-base font-black text-slate-900">{businessName || 'Comercio'}</p>
                </div>
                <p className="text-sm font-semibold text-slate-700">{orderId ? `#${orderId.slice(-8).toUpperCase()}` : '#N/A'}</p>
              </div>
              <p className="mt-2 break-all text-[11px] text-slate-500">ID completo: {orderId || 'No disponible'}</p>

              {displayStatus === 'pendiente' ? (
                <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  <p className="font-bold">Esperando confirmacion del comercio (maximo 15 min)</p>
                  <p className="mt-1">
                    {pendingExpired
                      ? 'Se alcanzo el limite de confirmacion. Estamos cerrando este pedido automaticamente.'
                      : `Tiempo restante para confirmar: ${formatCountdown(confirmTimeLeftMs)}`}
                  </p>
                </div>
              ) : null}

              {displayStatus === 'cancelado' ? (
                <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                  <p className="font-bold">Este pedido fue cancelado.</p>
                  {cancellationMeta?.reason === 'timeout_no_confirmacion'
                    ? <p className="mt-1">Motivo: no fue confirmado por el comercio dentro de 15 minutos.</p>
                    : null}
                  {cancellationMeta?.reason === 'cancelado_por_cliente'
                    ? <p className="mt-1">Motivo: cancelacion solicitada por el cliente.</p>
                    : null}
                </div>
              ) : null}

              <div className="mt-4 space-y-2">
                {timelineItems.map((item, index) => {
                  const isDone = index <= currentStep;
                  const isCurrent = index === currentStep;
                  const Icon = item.icon;
                  return (
                    <div key={item.key} className="flex items-center gap-3 text-sm">
                      <span
                        className="grid h-7 w-7 place-items-center rounded-full border text-xs font-black"
                        style={{
                          borderColor: isDone ? trackingPrimary : '#D1D5DB',
                          backgroundColor: isCurrent ? softTone : '#FFFFFF',
                          color: isDone ? trackingPrimary : '#64748B',
                        }}
                      >
                        <Icon className="h-3.5 w-3.5" strokeWidth={2.4} />
                      </span>
                      <p className="font-semibold" style={{ color: isCurrent ? trackingPrimary : isDone ? '#111827' : '#6B7280' }}>
                        {index + 1}. {item.label}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>

            {locationHint ? (
              <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Ubicacion</p>
                <p className="mt-2 text-sm text-slate-700">{locationHint}</p>
              </div>
            ) : null}

            <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Contacto del comercio</p>
              <div className="mt-3 flex items-center gap-3">
                <div className="grid h-14 w-14 place-items-center rounded-full text-base font-black" style={{ backgroundColor: mutedTone, color: trackingPrimary }}>
                  {(businessName || 'C').slice(0, 1).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-2xl font-black text-slate-950" style={{ fontFamily: titleFontFamily }}>{businessName || 'Comercio'}</p>
                  <p className="truncate text-sm text-slate-600">{businessPhoneRaw || 'Sin telefono de contacto'}</p>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {callHref ? (
                  <a href={callHref} className="inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-black" style={{ backgroundColor: '#D97706', color: '#FFFFFF' }}>
                    <Phone className="h-4 w-4" strokeWidth={2.2} />
                    Llamar
                  </a>
                ) : null}
                {finalWaLink ? (
                  <a href={finalWaLink} target="_blank" rel="noopener noreferrer nofollow" referrerPolicy="no-referrer" className="inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-black" style={{ backgroundColor: '#D97706', color: '#FFFFFF' }}>
                    <MessageCircle className="h-4 w-4" strokeWidth={2.2} />
                    Chat/WhatsApp
                  </a>
                ) : null}
              </div>
            </div>

            <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-800">Resumen de la orden</p>
              <div className="mt-3 space-y-2 text-sm text-slate-700">
                {orderItems.map((item, index) => (
                  <div key={`order-item-${index}`} className="flex items-center justify-between gap-3">
                    <p className="min-w-0 truncate">{item.cantidad}x {item.nombre}</p>
                    <p className="whitespace-nowrap font-semibold">{formatAmountByCurrency(item.subtotal, checkoutCurrency)}</p>
                  </div>
                ))}
                <div className="mt-2 border-t border-slate-200 pt-2">
                  <p className="flex items-center justify-between"><span>Subtotal</span><span className="font-semibold">{formatAmountByCurrency(subtotalCheckout, checkoutCurrency)}</span></p>
                  <p className="flex items-center justify-between"><span>Entrega</span><span className="font-semibold">{formatAmountByCurrency(deliveryCheckout, checkoutCurrency)}</span></p>
                  {cashChangeAmount > 0 ? <p className="flex items-center justify-between"><span>Cambio de</span><span className="font-semibold">{formatAmountByCurrency(cashChangeAmount, checkoutCurrency)}</span></p> : null}
                  <p className="mt-2 flex items-center justify-between text-base font-black text-slate-950"><span>TOTAL</span><span>{formatAmountByCurrency(totalCheckout, checkoutCurrency)}</span></p>
                </div>
              </div>
            </div>

            <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-800">Metodo de pago</p>
              <p className="mt-2 text-sm text-slate-700">{paymentMethodName || 'No especificado'} · {paymentReference ? `****${paymentReference.slice(-4)}` : 'Sin referencia'}</p>
              {paymentMethodDetails.length > 0 ? <p className="mt-1 text-xs text-slate-500">{paymentMethodDetails.slice(0, 2).join(' · ')}</p> : null}
            </div>

            {!isDelivery && businessAddress ? (
              <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-800">Direccion del comercio</p>
                <p className="mt-2 text-sm text-slate-700">{businessAddress}</p>
              </div>
            ) : null}

            {deliveryDelegateLabel ? (
              <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-800">Delivery delegado</p>
                <p className="mt-2 text-sm font-semibold text-slate-700">{deliveryDelegateLabel}</p>
                {deliveryDelegateAcceptedAt ? <p className="mt-1 text-xs text-slate-500">Aceptado: {new Date(deliveryDelegateAcceptedAt).toLocaleString('es-CO')}</p> : null}
                {deliveryDelegateArrivedAt ? <p className="mt-1 text-xs text-slate-500">Llegada reportada: {new Date(deliveryDelegateArrivedAt).toLocaleString('es-CO')}</p> : null}
                {deliveryDelegateCompletedAt ? <p className="mt-1 text-xs text-slate-500">Completado: {new Date(deliveryDelegateCompletedAt).toLocaleString('es-CO')}</p> : null}
              </div>
            ) : null}

            {(contactName || contactPhone || contactEmail) ? (
              <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-800">Datos del cliente</p>
                {contactName ? <p className="mt-2 text-sm text-slate-700">{contactName}</p> : null}
                {contactPhone ? <p className="mt-1 text-sm text-slate-700">{contactPhone}</p> : null}
                {contactEmail ? <p className="mt-1 text-sm text-slate-700">{contactEmail}</p> : null}
              </div>
            ) : null}

            {orderNotes ? (
              <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-800">Notas del pedido</p>
                <p className="mt-2 text-sm text-slate-700">{orderNotes}</p>
              </div>
            ) : null}

            <div className="mt-4 rounded-2xl border border-slate-200 p-4" style={{ backgroundColor: softTone }}>
              {canCustomerConfirmDelegatedDelivery ? (
                <button
                  type="button"
                  disabled={deliveryConfirmationLoading}
                  onClick={() => {
                    if (typeof window !== 'undefined') {
                      const accepted = window.confirm(
                        'Confirma que recibiste todo correctamente para completar el pedido.',
                      );
                      if (!accepted) return;
                    }
                    void confirmDeliveryReceived();
                  }}
                  className="mb-2 inline-flex w-full items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-black"
                  style={{
                    borderColor: '#86EFAC',
                    color: '#166534',
                    backgroundColor: '#ECFDF5',
                    opacity: deliveryConfirmationLoading ? 0.7 : 1,
                  }}
                >
                  {deliveryConfirmationLoading
                    ? 'Confirmando entrega...'
                    : 'Confirmar que recibi mi pedido'}
                </button>
              ) : null}

              {deliveryConfirmationMessage ? (
                <p className="mb-2 text-xs text-slate-600">{deliveryConfirmationMessage}</p>
              ) : null}

              {canCustomerCancel ? (
                <button
                  type="button"
                  disabled={cancelLoading}
                  onClick={() => {
                    if (typeof window !== 'undefined') {
                      const accepted = window.confirm('Vas a cancelar este pedido. Esta accion no se puede deshacer.');
                      if (!accepted) return;
                    }
                    void cancelOrder('cliente');
                  }}
                  className="mb-2 inline-flex w-full items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-black"
                  style={{
                    borderColor: '#FCA5A5',
                    color: '#B91C1C',
                    backgroundColor: '#FEF2F2',
                    opacity: cancelLoading ? 0.7 : 1,
                  }}
                >
                  {cancelLoading ? 'Cancelando pedido...' : 'Cancelar pedido'}
                </button>
              ) : null}

              {displayStatus === 'pendiente' && !pendingExpired ? (
                <p className="mb-2 text-xs text-slate-600">
                  Este pedido solo puede cancelarse automaticamente si el comercio no confirma en 15 minutos.
                </p>
              ) : null}

              <div className="mt-1 flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2.5">
                <div className="pr-3">
                  <p className="text-xs font-black text-slate-800">Notificaciones WhatsApp</p>
                  <p className="text-[11px] text-slate-500">
                    {whatsappNotificationsEnabled ? 'Activadas' : 'Desactivadas'}
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={whatsappNotificationsEnabled}
                  disabled={whatsappPreferenceSaving}
                  onClick={() => void updateWhatsappNotificationsPreference(!whatsappNotificationsEnabled)}
                  className="relative inline-flex h-7 w-12 items-center rounded-full transition-colors"
                  style={{
                    backgroundColor: whatsappNotificationsEnabled ? trackingPrimary : '#CBD5E1',
                    opacity: whatsappPreferenceSaving ? 0.7 : 1,
                  }}
                >
                  <span
                    className="inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform"
                    style={{
                      translate: whatsappNotificationsEnabled ? '22px 0' : '3px 0',
                    }}
                  />
                </button>
              </div>
              {notificationMessage ? <p className="mt-2 text-xs text-slate-600">{notificationMessage}</p> : null}
              {cancelMessage ? <p className="mt-2 text-xs text-slate-600">{cancelMessage}</p> : null}
            </div>
          </div>
        </div>
      </section>
    </main>
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
