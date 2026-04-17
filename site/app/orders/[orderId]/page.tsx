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

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [order, setOrder] = useState<PedidoRow | null>(null);
  const [comercio, setComercio] = useState<ComercioRow | null>(null);
  const [waReceiptUrl, setWaReceiptUrl] = useState('');
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [notificationMessage, setNotificationMessage] = useState('');
  const lastStatusRef = useRef<OrderStatus | null>(null);

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
        setOrder(found);
        lastStatusRef.current = normalizeStatus(found.estado);

        if (currentComercioId) {
          const { data: comercioRow } = await supabase
            .from('comercios')
            .select('id,nombre,slug,direccion,latitud,longitud,whatsapp,telefono,telefonos,celular,logo_url,branding_ia')
            .eq('id', currentComercioId)
            .maybeSingle<ComercioRow>();

          if (!active) return;
          setComercio(comercioRow ?? null);
        }

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
        if (!candidate) return;

        const candidateOrderId = resolveOrderIdFromRow(candidate);
        if (candidateOrderId !== orderId) return;

        setOrder(candidate);

        const nextStatus = normalizeStatus(candidate.estado);
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

        const comercioId = (candidate.comercio_id ?? '').toString().trim();
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
      })
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [notificationsEnabled, orderId]);

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

  const businessLat = toNumberOrNull(comercio?.latitud);
  const businessLng = toNumberOrNull(comercio?.longitud);
  const hasBusinessCoords = businessLat !== null && businessLng !== null;

  const businessMapSrc = hasBusinessCoords
    ? `https://www.google.com/maps?q=${encodeURIComponent(`${businessLat},${businessLng}`)}&z=15&output=embed`
    : `https://www.google.com/maps?q=${encodeURIComponent(comercio?.direccion ?? comercio?.nombre ?? 'elmenuxfa.com')}&z=15&output=embed`;

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

  const currentStep = statusIndex(resolvedStatus);
  const createdAtLabel = order?.created_at
    ? new Intl.DateTimeFormat('es-CO', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(order.created_at))
    : '';
  const borderTone = `color-mix(in srgb, ${trackingPrimary} 18%, white)`;
  const softTone = `color-mix(in srgb, ${trackingPrimary} 8%, white)`;
  const softerTone = `color-mix(in srgb, ${trackingPrimary} 12%, white)`;
  const mutedTone = `color-mix(in srgb, ${trackingSecondary} 12%, white)`;
  const cardStyle = {
    backgroundColor: trackingSurface,
    border: `1px solid ${borderTone}`,
  } as React.CSSProperties;
  const mutedCardStyle = {
    backgroundColor: softTone,
    border: `1px solid ${borderTone}`,
  } as React.CSSProperties;

  return (
    <main
      className="min-h-screen px-4 py-8 text-slate-900 sm:px-6"
      style={{
        background: `radial-gradient(circle at 10% 0%, color-mix(in srgb, ${trackingPrimary} 16%, white) 0%, transparent 34%), radial-gradient(circle at 90% 0%, color-mix(in srgb, ${trackingSecondary} 10%, white) 0%, transparent 28%), linear-gradient(180deg, color-mix(in srgb, ${trackingPrimary} 4%, white) 0%, transparent 22%), ${trackingBackground}`,
        fontFamily: bodyFontFamily,
      }}
    >
      <section className="mx-auto max-w-5xl space-y-5">
        <div className="overflow-hidden rounded-[32px] p-6 shadow-[0_26px_60px_rgba(15,23,42,0.12)] sm:p-8" style={{ ...cardStyle, background: `linear-gradient(145deg, color-mix(in srgb, ${trackingPrimary} 12%, white) 0%, ${trackingSurface} 38%, ${trackingSurface} 100%)` }}>
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em]" style={{ backgroundColor: softerTone, color: trackingPrimary }}>
                  Seguimiento
                </span>
                <span className="rounded-full px-3 py-1 text-[11px] font-black" style={{ backgroundColor: resolvedStatus === 'entregado' ? 'color-mix(in srgb, #10B981 14%, white)' : softTone, color: resolvedStatus === 'entregado' ? '#047857' : trackingPrimary }}>
                  {statusLabel(resolvedStatus)}
                </span>
              </div>
              <h1 className="mt-4 text-3xl font-black leading-tight text-slate-950 sm:text-4xl" style={{ fontFamily: titleFontFamily }}>
                Tu pedido ya esta en seguimiento
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">
                Sigue el estado, revisa el resumen y mantente conectado con {(comercio?.nombre ?? 'el negocio').trim()} desde una sola vista.
              </p>
              <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold text-slate-600">
                <span className="rounded-full bg-white px-3 py-1.5" style={{ border: `1px solid ${borderTone}` }}>
                  {(comercio?.nombre ?? 'Kosmenu').trim()}
                </span>
                {comercio?.slug ? (
                  <span className="rounded-full bg-white px-3 py-1.5" style={{ border: `1px solid ${borderTone}` }}>
                    @{comercio.slug}
                  </span>
                ) : null}
                {createdAtLabel ? (
                  <span className="rounded-full bg-white px-3 py-1.5" style={{ border: `1px solid ${borderTone}` }}>
                    {createdAtLabel}
                  </span>
                ) : null}
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="min-w-0 rounded-[24px] bg-white/90 px-4 py-3 shadow-sm" style={{ border: `1px solid ${borderTone}` }}>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Codigo</p>
                <p className="mt-2 max-w-[260px] break-all text-sm font-black text-slate-950">{orderId}</p>
              </div>
              {comercio?.logo_url ? (
                <img src={comercio.logo_url} alt={comercio?.nombre ?? 'Comercio'} className="h-16 w-16 rounded-[22px] object-cover shadow-sm" style={{ border: `1px solid ${borderTone}` }} />
              ) : null}
            </div>
          </div>
        </div>

        <div className="rounded-[28px] p-5 shadow-[0_20px_50px_rgba(15,23,42,0.08)] sm:p-6" style={cardStyle}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">Estado</p>
              <p className="mt-1 text-sm text-slate-600">El negocio actualizara este progreso a medida que avance tu pedido.</p>
            </div>
          </div>
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-5">
            {ORDER_FLOW.map((step, index) => {
              const isDone = index <= currentStep;
              const isCurrent = index === currentStep;
              return (
                <div key={step.key} className="relative min-w-0">
                  {index < ORDER_FLOW.length - 1 ? (
                    <div className="absolute left-7 top-6 hidden h-[2px] w-[calc(100%-1rem)] sm:block" style={{ backgroundColor: isDone ? trackingPrimary : mutedTone }} />
                  ) : null}
                  <div className="relative rounded-[24px] px-4 py-4" style={{ backgroundColor: isCurrent ? softTone : '#FFFFFF', border: `1px solid ${isDone ? trackingPrimary : borderTone}` }}>
                    <div className="flex items-center gap-3 sm:flex-col sm:items-start">
                      <span
                        className="grid h-10 w-10 place-items-center rounded-full text-sm font-black"
                        style={{
                          backgroundColor: isDone ? trackingPrimary : '#FFFFFF',
                          color: isDone ? trackingOnPrimary : '#64748B',
                          border: `1px solid ${isDone ? trackingPrimary : borderTone}`,
                          boxShadow: isCurrent ? `0 14px 30px -18px ${trackingPrimary}` : 'none',
                        }}
                      >
                        {isDone && index < currentStep ? '✓' : index + 1}
                      </span>
                      <div>
                        <p className={`text-sm font-black ${isCurrent || isDone ? 'text-slate-950' : 'text-slate-500'}`}>{step.short}</p>
                        <p className="mt-1 text-xs text-slate-500">{step.label}</p>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-[28px] p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]" style={cardStyle}>
                <div className="flex items-center gap-3">
                  <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl" style={{ backgroundColor: softTone, color: trackingPrimary }}>
                    <User className="h-5 w-5" strokeWidth={2.2} />
                  </span>
                  <div>
                    <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">Cliente</p>
                    <p className="mt-1 text-base font-black text-slate-950">{contactName || 'Sin nombre registrado'}</p>
                  </div>
                </div>
                <div className="mt-4 space-y-3 text-sm text-slate-600">
                  <p className="flex items-center gap-2"><Phone className="h-4 w-4" strokeWidth={2.1} /> {contactPhone || 'Sin telefono registrado'}</p>
                  <p className="flex items-center gap-2"><MessageCircle className="h-4 w-4" strokeWidth={2.1} /> {contactEmail || 'Sin correo registrado'}</p>
                </div>
              </div>

              <div className="rounded-[28px] p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]" style={mutedCardStyle}>
                <div className="flex items-center gap-3">
                  <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-white" style={{ color: trackingPrimary, border: `1px solid ${borderTone}` }}>
                    <CreditCard className="h-5 w-5" strokeWidth={2.2} />
                  </span>
                  <div>
                    <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">Resumen</p>
                    <p className="mt-1 text-base font-black text-slate-950">{formatAmountByCurrency(totalCheckout, checkoutCurrency)}</p>
                  </div>
                </div>
                <div className="mt-4 space-y-2 text-sm text-slate-700">
                  <p className="flex items-center justify-between"><span>Subtotal</span><span className="font-semibold">{formatAmountByCurrency(subtotalCheckout, checkoutCurrency)}</span></p>
                  <p className="flex items-center justify-between"><span>Entrega</span><span className="font-semibold">{formatAmountByCurrency(deliveryCheckout, checkoutCurrency)}</span></p>
                  <p className="flex items-center justify-between border-t pt-3 text-base font-black text-slate-950" style={{ borderColor: borderTone }}><span>Total</span><span>{formatAmountByCurrency(totalCheckout, checkoutCurrency)}</span></p>
                  <p className="text-[11px] text-slate-500">
                    {checkoutCurrency !== 'COP'
                      ? `Tasa snapshot: 1 ${checkoutCurrency} = ${exchangeRate} COP`
                      : `Base COP: ${formatCop(total)}`}
                  </p>
                </div>
              </div>
            </div>

            {orderItems.length > 0 ? (
              <div className="rounded-[28px] p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]" style={cardStyle}>
                <div className="flex items-center gap-3">
                  <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl" style={{ backgroundColor: softTone, color: trackingPrimary }}>
                    <Package className="h-5 w-5" strokeWidth={2.2} />
                  </span>
                  <div>
                    <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">Productos</p>
                    <p className="mt-1 text-sm text-slate-600">Resumen del pedido confirmado.</p>
                  </div>
                </div>
                <div className="mt-4 space-y-3">
                  {orderItems.map((item, index) => (
                    <div key={`order-item-${index}`} className="flex items-center justify-between gap-3 rounded-[22px] bg-white px-4 py-3" style={{ border: `1px solid ${borderTone}` }}>
                      <div className="min-w-0 flex items-center gap-3">
                        <span className="grid h-9 w-9 place-items-center rounded-full text-sm font-black" style={{ backgroundColor: softTone, color: trackingPrimary }}>{item.cantidad}</span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-black text-slate-950">{item.nombre}</p>
                          <p className="mt-1 text-xs text-slate-500">Unitario {formatAmountByCurrency(item.precioUnitario, checkoutCurrency)}</p>
                        </div>
                      </div>
                      <p className="whitespace-nowrap text-sm font-black text-slate-950">{formatAmountByCurrency(item.subtotal, checkoutCurrency)}</p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {orderNotes ? (
              <div className="rounded-[28px] p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]" style={cardStyle}>
                <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">Notas del pedido</p>
                <p className="mt-3 text-sm leading-6 text-slate-700">{orderNotes}</p>
              </div>
            ) : null}
          </div>

          <div className="space-y-4">
            <div className="rounded-[28px] p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]" style={cardStyle}>
              <div className="flex items-center gap-3">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl" style={{ backgroundColor: softTone, color: trackingPrimary }}>
                  <CreditCard className="h-5 w-5" strokeWidth={2.2} />
                </span>
                <div>
                  <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">Pago</p>
                  <p className="mt-1 text-base font-black text-slate-950">{paymentMethodName || 'No especificado'}</p>
                </div>
              </div>
              <div className="mt-4 space-y-3 text-sm text-slate-700">
                {paymentMethodDetails.length > 0 ? <p>{paymentMethodDetails.slice(0, 2).join(' · ')}</p> : null}
                <p className="flex items-center justify-between gap-3"><span>Referencia</span><span className="font-semibold">{paymentReference ? `****${paymentReference.slice(-4)}` : 'No registrada'}</span></p>
                <p className="flex items-center justify-between gap-3"><span>Comprobante</span><span className="font-semibold">{paymentProofUrl ? 'Cargado' : 'No cargado'}</span></p>
                <p className="flex items-center justify-between gap-3"><span>Total pagado</span><span className="font-semibold">{formatAmountByCurrency(totalCheckout, checkoutCurrency)}</span></p>
                {cashPaymentAmount !== null ? <p className="flex items-center justify-between gap-3"><span>Pago con</span><span className="font-semibold">{formatAmountByCurrency(cashPaymentAmount, checkoutCurrency)}</span></p> : null}
                {cashChangeAmount > 0 ? <p className="flex items-center justify-between gap-3"><span>Cambio</span><span className="font-semibold">{formatAmountByCurrency(cashChangeAmount, checkoutCurrency)}</span></p> : null}
                {paymentProofUrl ? (
                  <a href={paymentProofUrl} target="_blank" rel="noopener noreferrer" className="inline-flex rounded-full px-4 py-2 text-xs font-black" style={{ backgroundColor: softTone, color: trackingPrimary }}>
                    Ver comprobante
                  </a>
                ) : null}
              </div>
            </div>

            <div className="rounded-[28px] p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]" style={cardStyle}>
              <div className="flex items-center gap-3">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl" style={{ backgroundColor: softTone, color: trackingPrimary }}>
                  {isDelivery ? <MapPin className="h-5 w-5" strokeWidth={2.2} /> : <Store className="h-5 w-5" strokeWidth={2.2} />}
                </span>
                <div>
                  <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">{isDelivery ? 'Entrega' : 'Retiro'}</p>
                  <p className="mt-1 text-base font-black text-slate-950">{isDelivery ? 'Delivery confirmado' : 'Retiro en local'}</p>
                </div>
              </div>
              {isDelivery ? (
                <div className="mt-4 space-y-3 text-sm text-slate-700">
                  <p className="leading-6">{deliveryAddress || 'Direccion no disponible'}</p>
                  {deliveryReference ? <p><span className="font-semibold">Referencia:</span> {deliveryReference}</p> : null}
                  {deliveryInstructions ? <p><span className="font-semibold">Indicaciones:</span> {deliveryInstructions}</p> : null}
                  <div className="overflow-hidden rounded-[22px]" style={{ border: `1px solid ${borderTone}` }}>
                    <iframe src={deliveryMapSrc} title="Mapa de entrega" className="h-52 w-full" loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
                  </div>
                </div>
              ) : (
                <div className="mt-4 space-y-3 text-sm text-slate-700">
                  <p>{(comercio?.nombre ?? 'elmenuxfa.com').trim()}</p>
                  <p>{(comercio?.direccion ?? 'Direccion no disponible').trim()}</p>
                  <div className="overflow-hidden rounded-[22px]" style={{ border: `1px solid ${borderTone}` }}>
                    <iframe src={businessMapSrc} title="Mapa del comercio" className="h-52 w-full" loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
                  </div>
                </div>
              )}
            </div>

            <div className="rounded-[28px] p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]" style={mutedCardStyle}>
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">Acciones</p>
              <div className="mt-4 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => void enableStatusNotifications()}
                  className="inline-flex items-center justify-center gap-2 rounded-full px-4 py-3 text-sm font-black"
                  style={{ backgroundColor: trackingPrimary, color: trackingOnPrimary }}
                >
                  <Bell className="h-4 w-4" strokeWidth={2.2} />
                  Activar notificaciones
                </button>
                {finalWaLink ? (
                  <a
                    href={finalWaLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-4 py-3 text-sm font-black text-slate-700"
                    style={{ border: `1px solid ${borderTone}` }}
                  >
                    <MessageCircle className="h-4 w-4" strokeWidth={2.2} />
                    Abrir WhatsApp
                  </a>
                ) : null}
              </div>
              {notificationMessage ? (
                <p className="mt-3 text-xs text-slate-600">{notificationMessage}</p>
              ) : null}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
