// @ts-nocheck
'use client';

import { createClient } from '@supabase/supabase-js';
import { Bell, CreditCard, MapPin, MessageCircle, Package, Phone, Store, User } from 'lucide-react';
import Link from 'next/link';
import { useParams, usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';

type OrderStatus =
  | 'pendiente'
  | 'confirmado'
  | 'preparando'
  | 'en_camino'
  | 'entregado';

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

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const googleMapsJsApiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim() ?? '';

let googleMapsScriptPromise: Promise<any> | null = null;

function waitForGoogleMapsReady(timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      resolve(null);
      return;
    }

    const startedAt = Date.now();
    const tick = () => {
      if ((window as any).google?.maps) {
        resolve((window as any).google);
        return;
      }

      if (Date.now() - startedAt >= timeoutMs) {
        reject(new Error('Google Maps API no termino de cargar.'));
        return;
      }

      window.setTimeout(tick, 60);
    };

    tick();
  });
}

function loadGoogleMapsApi() {
  if (typeof window === 'undefined') return Promise.resolve(null);
  if ((window as any).google?.maps) return Promise.resolve((window as any).google);
  if (!googleMapsJsApiKey) return Promise.resolve(null);
  if (googleMapsScriptPromise) return googleMapsScriptPromise;

  googleMapsScriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-kosmenu-google-maps="1"]') as HTMLScriptElement | null;
    if (existing) {
      waitForGoogleMapsReady().then(resolve).catch(reject);
      existing.addEventListener('load', () => {
        waitForGoogleMapsReady().then(resolve).catch(reject);
      });
      existing.addEventListener('error', reject);
      return;
    }

    const callbackName = '__kosmenuOrderTrackingGoogleMapsReady';
    (window as any)[callbackName] = () => {
      waitForGoogleMapsReady()
        .then((google) => {
          delete (window as any)[callbackName];
          resolve(google);
        })
        .catch((error) => {
          delete (window as any)[callbackName];
          reject(error);
        });
    };

    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(googleMapsJsApiKey)}&loading=async&callback=${callbackName}`;
    script.async = true;
    script.defer = true;
    script.dataset.kosmenuGoogleMaps = '1';
    script.onerror = (error) => {
      delete (window as any)[callbackName];
      reject(error);
    };
    document.head.appendChild(script);
  });

  return googleMapsScriptPromise;
}

const ORDER_FLOW: Array<{ key: OrderStatus; label: string; short: string }> = [
  { key: 'pendiente', label: 'Pedido recibido', short: 'Pendiente' },
  { key: 'confirmado', label: 'Pedido confirmado', short: 'Confirmado' },
  { key: 'preparando', label: 'Preparando tu pedido', short: 'Preparando' },
  { key: 'en_camino', label: 'Pedido en camino', short: 'En camino' },
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
  return 'pendiente';
}

function statusIndex(status: OrderStatus) {
  const index = ORDER_FLOW.findIndex((item) => item.key === status);
  return index >= 0 ? index : 0;
}

function statusLabel(status: OrderStatus) {
  return ORDER_FLOW.find((item) => item.key === status)?.label ?? 'Estado desconocido';
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

function resolveOrderIdFromRow(row: PedidoRow | null | undefined) {
  if (!row) return '';
  return (row.detalles?.order_id ?? row.id ?? '').toString().trim();
}

function buildPerpendicularArcControlPoint(
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number },
  lateralOffset = 0.02,
) {
  const midLat = (origin.lat + destination.lat) / 2;
  const midLng = (origin.lng + destination.lng) / 2;
  const deltaLng = destination.lng - origin.lng;
  const deltaLat = destination.lat - origin.lat;
  const length = Math.sqrt((deltaLng * deltaLng) + (deltaLat * deltaLat));

  if (!length) {
    return { lat: midLat, lng: midLng };
  }

  const unitPerpLat = deltaLng / length;
  const unitPerpLng = -deltaLat / length;

  return {
    lat: midLat + (unitPerpLat * lateralOffset),
    lng: midLng + (unitPerpLng * lateralOffset),
  };
}

function generateArcPath(
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number },
  pointCount = 100,
  lateralOffset = 0.02,
) {
  if (pointCount < 2) {
    return [origin, destination];
  }

  const control = buildPerpendicularArcControlPoint(origin, destination, lateralOffset);
  const points: Array<{ lat: number; lng: number }> = [];

  for (let i = 0; i < pointCount; i += 1) {
    const t = i / (pointCount - 1);
    const oneMinusT = 1 - t;
    const lat =
      (oneMinusT * oneMinusT * origin.lat) +
      (2 * oneMinusT * t * control.lat) +
      (t * t * destination.lat);
    const lng =
      (oneMinusT * oneMinusT * origin.lng) +
      (2 * oneMinusT * t * control.lng) +
      (t * t * destination.lng);
    points.push({ lat, lng });
  }

  return points;
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

export default function OrderTrackingPage() {
  const params = useParams<{ orderId: string }>();
  const pathname = usePathname();
  const router = useRouter();
  const orderId = decodeURIComponent(params?.orderId ?? '').trim();
  const comercioSlugHint = useMemo(() => {
    const segments = (pathname ?? '').split('/').filter(Boolean);
    if (segments.length >= 4 && segments[0] === 'v' && segments[2] === 'orders') {
      return decodeURIComponent(segments[1] ?? '').trim();
    }
    return '';
  }, [pathname]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [order, setOrder] = useState<PedidoRow | null>(null);
  const [comercio, setComercio] = useState<ComercioRow | null>(null);
  const [waReceiptUrl, setWaReceiptUrl] = useState('');
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [notificationMessage, setNotificationMessage] = useState('');
  const [syncMode, setSyncMode] = useState<'conectando' | 'realtime' | 'polling' | 'sin-senal'>('conectando');
  const [lastSyncAt, setLastSyncAt] = useState(0);
  const lastStatusRef = useRef<OrderStatus | null>(null);
  const trackedRowIdRef = useRef('');
  const realtimeConnectedRef = useRef(false);
  const deliveryMapRef = useRef<HTMLDivElement | null>(null);
  const deliveryMapInstanceRef = useRef<any>(null);
  const deliveryMapMarkersRef = useRef<any[]>([]);
  const deliveryMapPolylinesRef = useRef<any[]>([]);
  const [deliveryMapError, setDeliveryMapError] = useState('');

  const resolvedStatus = useMemo(() => normalizeStatus(order?.estado), [order?.estado]);

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
    if (!orderId) {
      setLoading(false);
      setError('ORDER_ID invalido.');
      return;
    }

    if (!supabaseUrl || !supabaseAnonKey) {
      setLoading(false);
      setError('Faltan variables de entorno de Supabase.');
      return;
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false },
    });

    let active = true;
    let currentComercioId = '';

    const applyIncomingOrder = async (
      incoming: PedidoRow | null | undefined,
      source: 'realtime' | 'polling' | 'hydrate' = 'realtime',
    ) => {
      if (!active || !incoming) return;

      const incomingRowId = (incoming.id ?? '').toString().trim();
      const incomingOrderId = resolveOrderIdFromRow(incoming);
      const trackedRowId = trackedRowIdRef.current;
      const matchesTrackedOrder = incomingOrderId === orderId || (trackedRowId && incomingRowId === trackedRowId);
      if (!matchesTrackedOrder) return;

      if (incomingRowId) {
        trackedRowIdRef.current = incomingRowId;
      }

      const now = Date.now();
      if (source === 'realtime') {
        realtimeConnectedRef.current = true;
        setSyncMode('realtime');
      } else if (source === 'polling') {
        if (!realtimeConnectedRef.current) {
          setSyncMode('polling');
        }
      }
      setLastSyncAt(now);

      setOrder((prev) => {
        if (!prev) return incoming;
        return {
          ...prev,
          ...incoming,
          detalles: incoming.detalles ?? prev.detalles,
        };
      });

      const nextStatus = normalizeStatus(incoming.estado);
      const previousStatus = lastStatusRef.current;
      lastStatusRef.current = nextStatus;

      if (
        notificationsEnabled &&
        typeof window !== 'undefined' &&
        'Notification' in window &&
        Notification.permission === 'granted' &&
        previousStatus &&
        previousStatus !== nextStatus
      ) {
        new Notification('Actualizacion de pedido', {
          body: `Tu pedido ${orderId} ahora esta en: ${statusLabel(nextStatus)}.`,
        });
      }

      const comercioId = (incoming.comercio_id ?? '').toString().trim();
      if (comercioId && comercioId !== currentComercioId) {
        currentComercioId = comercioId;
        const { data: comercioRow } = await supabase
          .from('comercios')
          .select('id,nombre,slug,direccion,latitud,longitud,whatsapp,telefono,telefonos,celular,logo_url,branding_ia')
          .eq('id', comercioId)
          .maybeSingle<ComercioRow>();

        if (active) {
          setComercio(comercioRow ?? null);
        }
      }
    };

    const loadComercioBySlug = async (slug: string) => {
      const safeSlug = slug.trim();
      if (!safeSlug) return null;

      try {
        const response = await fetch(`/api/menu/${encodeURIComponent(safeSlug)}`, { cache: 'no-store' });
        if (response.ok) {
          const payload = await response.json();
          const apiComercio = (payload?.data?.comercio ?? null) as ComercioRow | null;
          if (apiComercio) return apiComercio;
        }
      } catch {
        // Keep fallback chain going if menu API is unavailable.
      }

      const { data } = await supabase
        .from('comercios')
        .select('id,nombre,slug,direccion,latitud,longitud,whatsapp,telefono,telefonos,celular,logo_url,branding_ia')
        .eq('slug', safeSlug)
        .maybeSingle<ComercioRow>();

      return data ?? null;
    };

    const hydrateFromApi = async () => {
      try {
        const response = await fetch(`/api/orders/${encodeURIComponent(orderId)}`, { cache: 'no-store' });
        if (!response.ok) return;

        const payload = await response.json();
        const apiOrder = (payload?.data?.order ?? null) as PedidoRow | null;
        const apiComercio = (payload?.data?.comercio ?? null) as ComercioRow | null;

        if (!active) return;

        if (apiOrder) {
          const apiRowId = (apiOrder.id ?? '').toString().trim();
          if (apiRowId) {
            trackedRowIdRef.current = apiRowId;
          }
          await applyIncomingOrder(apiOrder, 'hydrate');
          if (!lastStatusRef.current) {
            lastStatusRef.current = normalizeStatus(apiOrder.estado);
          }
        }

        if (apiComercio) {
          setComercio(apiComercio);
        }
      } catch {
        // Silent fallback: Supabase client query remains the primary source.
      }
    };

    const loadInitial = async () => {
      try {
        setLoading(true);
        setError(null);

        const derivedComercioId = orderId.includes('-') ? orderId.slice(0, orderId.lastIndexOf('-')).trim() : '';
        let pedidosQuery = supabase
          .from('pedidos')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(200);

        if (derivedComercioId) {
          pedidosQuery = pedidosQuery.eq('comercio_id', derivedComercioId);
        }

        const { data: rows, error: pedidosError } = await pedidosQuery;
        if (pedidosError) throw new Error(pedidosError.message);

        const found = (rows ?? []).find((row) => resolveOrderIdFromRow(row as PedidoRow) === orderId) as PedidoRow | undefined;
        if (!active) return;

        if (!found) {
          setOrder(null);
          setComercio(null);
          setLoading(false);
          return;
        }

        currentComercioId = (found.comercio_id ?? '').toString().trim();
        trackedRowIdRef.current = (found.id ?? '').toString().trim();
        setOrder(found);
        lastStatusRef.current = normalizeStatus(found.estado);

        let resolvedComercio: ComercioRow | null = null;
        if (currentComercioId) {
          const { data: comercioRow } = await supabase
            .from('comercios')
            .select('id,nombre,slug,direccion,latitud,longitud,whatsapp,telefono,telefonos,celular,logo_url,branding_ia')
            .eq('id', currentComercioId)
            .maybeSingle<ComercioRow>();

          if (!active) return;
          resolvedComercio = comercioRow ?? null;
        }

        if (!resolvedComercio && comercioSlugHint) {
          resolvedComercio = await loadComercioBySlug(comercioSlugHint);
          if (!active) return;
        }

        setComercio(resolvedComercio);
        void hydrateFromApi();

        setLoading(false);
      } catch (loadError) {
        if (!active) return;
        setError(loadError instanceof Error ? loadError.message : 'No se pudo cargar el pedido.');
        setLoading(false);
      }
    };

    void loadInitial();

    const realtimeConfig: any = {
      event: '*',
      schema: 'public',
      table: 'pedidos',
    };

    const derivedComercioId = orderId.includes('-') ? orderId.slice(0, orderId.lastIndexOf('-')).trim() : '';
    if (derivedComercioId) {
      realtimeConfig.filter = `comercio_id=eq.${derivedComercioId}`;
    }

    const channel = supabase
      .channel(`order-tracking-${orderId}`)
      .on('postgres_changes', realtimeConfig, async (payload: any) => {
        if (!active) return;
        const candidate = (payload?.new ?? payload?.record ?? null) as PedidoRow | null;
        await applyIncomingOrder(candidate, 'realtime');
      })
      .subscribe((status: string) => {
        if (!active) return;
        if (status === 'SUBSCRIBED') {
          realtimeConnectedRef.current = true;
          setSyncMode('realtime');
          return;
        }

        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          realtimeConnectedRef.current = false;
          setSyncMode('sin-senal');
        }
      });

    const pollingIntervalId = window.setInterval(async () => {
      if (!active) return;
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;

      const trackedRowId = trackedRowIdRef.current;
      if (!trackedRowId) return;

      const { data: polledOrder } = await supabase
        .from('pedidos')
        .select('*')
        .eq('id', trackedRowId)
        .maybeSingle<PedidoRow>();

      if (!active || !polledOrder) return;
      await applyIncomingOrder(polledOrder, 'polling');
    }, 8000);

    return () => {
      active = false;
      window.clearInterval(pollingIntervalId);
      supabase.removeChannel(channel);
    };
  }, [comercioSlugHint, notificationsEnabled, orderId]);

  const delivery = order?.detalles?.delivery ?? null;
  const isDelivery = (delivery?.mode ?? 'pickup') === 'delivery';
  const deliveryAddress = (delivery?.address ?? '').toString().trim();
  const deliveryLat =
    toNumberOrNull(delivery?.coordinates?.lat) ??
    toNumberOrNull(delivery?.lat) ??
    toNumberOrNull(delivery?.latitude) ??
    toNumberOrNull(delivery?.latitud);
  const deliveryLng =
    toNumberOrNull(delivery?.coordinates?.lng) ??
    toNumberOrNull(delivery?.lng) ??
    toNumberOrNull(delivery?.longitude) ??
    toNumberOrNull(delivery?.longitud);
  const hasDeliveryCoords = deliveryLat !== null && deliveryLng !== null;

  const businessLat =
    toNumberOrNull(comercio?.latitud) ??
    toNumberOrNull((order?.detalles as any)?.comercio_latitud) ??
    toNumberOrNull((order?.detalles as any)?.latitud_comercio) ??
    toNumberOrNull((order?.detalles as any)?.business_latitude);
  const businessLng =
    toNumberOrNull(comercio?.longitud) ??
    toNumberOrNull((order?.detalles as any)?.comercio_longitud) ??
    toNumberOrNull((order?.detalles as any)?.longitud_comercio) ??
    toNumberOrNull((order?.detalles as any)?.business_longitude);
  const hasBusinessCoords = businessLat !== null && businessLng !== null;

  const businessMapSrc = hasBusinessCoords
    ? `https://www.google.com/maps?q=${encodeURIComponent(`${businessLat},${businessLng}`)}&z=15&output=embed`
    : `https://www.google.com/maps?q=${encodeURIComponent((comercio?.direccion ?? (order?.detalles as any)?.comercio_direccion ?? comercio?.nombre ?? (order?.detalles as any)?.comercio_nombre ?? 'elmenuxfa.com').toString())}&z=15&output=embed`;

  const deliveryMapSrc = hasDeliveryCoords
    ? `https://www.google.com/maps?q=${encodeURIComponent(`${deliveryLat},${deliveryLng}`)}&z=15&output=embed`
    : `https://www.google.com/maps?q=${encodeURIComponent(deliveryAddress || 'direccion de entrega')}&z=15&output=embed`;

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
  const paymentProofUrl = (order?.detalles?.comprobante_url ?? '').toString().trim();
  const cashPaymentAmount = toNumberOrNull(order?.detalles?.pago_con);
  const cashChangeAmount = toNumberOrNull(order?.detalles?.cambio_de) ?? 0;
  const orderNotes = (order?.detalles?.order_notes ?? '').toString().trim();
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
  const deliveryReference = (delivery?.reference ?? '').toString().trim();
  const deliveryInstructions = (delivery?.instructions ?? '').toString().trim();

  const contactName = (order?.nombre_cliente ?? order?.detalles?.cliente_nombre ?? '').toString().trim();
  const contactPhone = (order?.telefono_cliente ?? order?.detalles?.telefono_cliente ?? '').toString().trim();
  const contactEmail = (order?.cliente_email ?? order?.detalles?.cliente_email ?? '').toString().trim();
  const businessName = (
    comercio?.nombre ??
    (order?.detalles as any)?.comercio_nombre ??
    (order?.detalles as any)?.nombre_comercio ??
    (order?.detalles as any)?.business_name ??
    (order?.detalles as any)?.nombre_negocio ??
    ''
  ).toString().trim();
  const businessAddress = (
    comercio?.direccion ??
    (order?.detalles as any)?.comercio_direccion ??
    (order?.detalles as any)?.direccion_comercio ??
    (order?.detalles as any)?.business_address ??
    ''
  ).toString().trim();
  const businessPhoneRaw = (
    comercio?.whatsapp ??
    comercio?.telefono ??
    comercio?.telefonos ??
    comercio?.celular ??
    (order?.detalles as any)?.telefono_comercio ??
    (order?.detalles as any)?.comercio_telefono ??
    (order?.detalles as any)?.business_phone ??
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
    const clearMapLayers = () => {
      for (const marker of deliveryMapMarkersRef.current) {
        marker.setMap(null);
      }
      for (const polyline of deliveryMapPolylinesRef.current) {
        polyline.setMap(null);
      }
      deliveryMapMarkersRef.current = [];
      deliveryMapPolylinesRef.current = [];
    };

    if (!isDelivery) {
      clearMapLayers();
      deliveryMapInstanceRef.current = null;
      setDeliveryMapError('');
      return;
    }

    if (!hasDeliveryCoords) {
      clearMapLayers();
      deliveryMapInstanceRef.current = null;
      setDeliveryMapError('Coordenadas de entrega no disponibles para mostrar la ruta.');
      return;
    }

    let disposed = false;

    const mountMap = async () => {
      try {
        setDeliveryMapError('');
        const google = await loadGoogleMapsApi();
        if (disposed || !deliveryMapRef.current) return;

        if (!google?.maps) {
          setDeliveryMapError('No fue posible cargar Google Maps en este dispositivo.');
          return;
        }

        const deliveryPoint = { lat: deliveryLat as number, lng: deliveryLng as number };
        const businessPoint = (businessLat !== null && businessLng !== null)
          ? { lat: businessLat, lng: businessLng }
          : null;

        const map = new google.maps.Map(deliveryMapRef.current, {
          center: businessPoint
            ? { lat: (businessPoint.lat + deliveryPoint.lat) / 2, lng: (businessPoint.lng + deliveryPoint.lng) / 2 }
            : deliveryPoint,
          zoom: businessPoint ? 13.8 : 15.2,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          rotateControl: false,
          gestureHandling: 'cooperative',
        });

        clearMapLayers();
        deliveryMapInstanceRef.current = map;

        const deliveryMarker = new google.maps.Marker({
          map,
          position: deliveryPoint,
          title: 'Destino de entrega',
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 8,
            fillColor: '#7C3AED',
            fillOpacity: 1,
            strokeColor: '#FFFFFF',
            strokeWeight: 2,
          },
        });
        deliveryMapMarkersRef.current.push(deliveryMarker);

        const cameraPoints = [deliveryPoint];

        if (businessPoint) {
          const businessMarker = new google.maps.Marker({
            map,
            position: businessPoint,
            title: businessName || 'Comercio',
            icon: {
              path: google.maps.SymbolPath.CIRCLE,
              scale: 8,
              fillColor: '#F59E0B',
              fillOpacity: 1,
              strokeColor: '#FFFFFF',
              strokeWeight: 2,
            },
          });
          deliveryMapMarkersRef.current.push(businessMarker);

          const arcPoints = generateArcPath(businessPoint, deliveryPoint);
          const arcPeak = arcPoints[Math.floor(arcPoints.length / 2)] ?? null;

          const shadowLine = new google.maps.Polyline({
            map,
            path: [businessPoint, deliveryPoint],
            strokeColor: '#9CA3AF',
            strokeOpacity: 0.4,
            strokeWeight: 2,
            zIndex: 1,
          });

          const arcLine = new google.maps.Polyline({
            map,
            path: arcPoints,
            strokeColor: '#7C3AED',
            strokeOpacity: 1,
            strokeWeight: 4,
            zIndex: 2,
          });

          deliveryMapPolylinesRef.current.push(shadowLine, arcLine);
          cameraPoints.push(businessPoint);
          if (arcPeak) cameraPoints.push(arcPeak);
        }

        const bounds = new google.maps.LatLngBounds();
        for (const point of cameraPoints) {
          bounds.extend(point);
        }
        if (cameraPoints.length > 1) {
          map.fitBounds(bounds, 60);
        }
      } catch {
        if (!disposed) {
          setDeliveryMapError('No fue posible renderizar el mapa de ruta.');
        }
      }
    };

    void mountMap();

    return () => {
      disposed = true;
      clearMapLayers();
    };
  }, [
    businessLat,
    businessLng,
    businessName,
    deliveryLat,
    deliveryLng,
    hasDeliveryCoords,
    isDelivery,
  ]);

  useEffect(() => {
    const slug = (comercio?.slug ?? '').trim();
    if (!slug || !orderId || !pathname?.startsWith('/orders/')) return;
    router.replace(`/v/${encodeURIComponent(slug)}/orders/${encodeURIComponent(orderId)}`);
  }, [comercio?.slug, orderId, pathname, router]);

  async function enableStatusNotifications() {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setNotificationMessage('Tu navegador no soporta notificaciones.');
      return;
    }

    if (Notification.permission === 'granted') {
      setNotificationsEnabled(true);
      setNotificationMessage('Notificaciones activadas.');
      return;
    }

    if (Notification.permission === 'denied') {
      setNotificationMessage('Notificaciones bloqueadas. Activalas en la configuracion del navegador.');
      return;
    }

    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      setNotificationsEnabled(true);
      setNotificationMessage('Notificaciones activadas.');
    } else {
      setNotificationMessage('No fue posible activar notificaciones.');
    }
  }

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
    return (
      <main className="grid min-h-screen place-items-center px-6 text-slate-900" style={{ background: trackingBackground, fontFamily: bodyFontFamily }}>
        <section className="max-w-lg rounded-3xl p-8 text-center shadow-xl" style={{ backgroundColor: trackingSurface, border: '1px solid color-mix(in srgb, var(--tracking-primary) 18%, white)', ['--tracking-primary' as any]: trackingPrimary }}>
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

  const displayStatus: OrderStatus = (!isDelivery && resolvedStatus === 'en_camino')
    ? 'preparando'
    : resolvedStatus;
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
      : displayStatus === 'en_camino'
        ? 'EN CAMINO'
        : displayStatus === 'preparando'
          ? 'EN PREPARACION'
          : displayStatus === 'confirmado'
            ? 'CONFIRMADO'
            : 'RECIBIDO';
  const callPhone = normalizePhone(businessPhoneRaw);
  const callHref = callPhone ? `tel:+${callPhone}` : '';
  const activeMapLat = isDelivery ? deliveryLat : businessLat;
  const activeMapLng = isDelivery ? deliveryLng : businessLng;
  const hasActiveMapCoords = activeMapLat !== null && activeMapLng !== null;
  const activeCoordsLabel = hasActiveMapCoords ? `${activeMapLat.toFixed(6)}, ${activeMapLng.toFixed(6)}` : '';
  const syncLabel =
    syncMode === 'realtime'
      ? 'Realtime activo'
      : syncMode === 'polling'
        ? 'Fallback por polling'
        : syncMode === 'sin-senal'
          ? 'Sin senal realtime'
          : 'Conectando...';
  const syncColor =
    syncMode === 'realtime'
      ? '#16A34A'
      : syncMode === 'polling'
        ? '#D97706'
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

            {isDelivery ? (
              <>
                <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
                  {deliveryMapError ? (
                    <div className="grid h-56 place-items-center px-4 text-center text-sm text-slate-600">
                      {deliveryMapError}
                    </div>
                  ) : (
                    <div ref={deliveryMapRef} className="h-56 w-full" />
                  )}
                </div>
              </>
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
                  <a href={finalWaLink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-black" style={{ backgroundColor: '#D97706', color: '#FFFFFF' }}>
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
              {paymentProofUrl ? (
                <a href={paymentProofUrl} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex rounded-lg px-3 py-2 text-xs font-bold" style={{ backgroundColor: softTone, color: trackingPrimary }}>
                  Ver comprobante
                </a>
              ) : null}
            </div>

            <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-800">{isDelivery ? 'Direccion de entrega' : 'Direccion del comercio'}</p>
              <p className="mt-2 text-sm text-slate-700">{isDelivery ? (deliveryAddress || 'Direccion no disponible') : (businessAddress || 'Direccion no disponible')}</p>
              {deliveryReference ? <p className="mt-1 text-sm text-slate-600">Referencia: {deliveryReference}</p> : null}
              {deliveryInstructions ? <p className="mt-1 text-sm text-slate-600">Notas: {deliveryInstructions}</p> : null}
            </div>

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
              <button
                type="button"
                onClick={() => void enableStatusNotifications()}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-black"
                style={{ backgroundColor: trackingPrimary, color: trackingOnPrimary }}
              >
                <Bell className="h-4 w-4" strokeWidth={2.2} />
                Activar notificaciones
              </button>
              {notificationMessage ? <p className="mt-2 text-xs text-slate-600">{notificationMessage}</p> : null}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
