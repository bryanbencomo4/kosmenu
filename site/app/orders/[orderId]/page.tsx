// @ts-nocheck
'use client';

import { createClient } from '@supabase/supabase-js';
import Link from 'next/link';
import { useParams } from 'next/navigation';
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
  direccion?: string | null;
  latitud?: number | string | null;
  longitud?: number | string | null;
  whatsapp?: string | null;
  telefono?: string | null;
  telefonos?: string | null;
  celular?: string | null;
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
            .select('id,nombre,direccion,latitud,longitud,whatsapp,telefono,telefonos,celular')
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
            .select('id,nombre,direccion,latitud,longitud,whatsapp,telefono,telefonos,celular')
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
      <main className="grid min-h-screen place-items-center bg-[#0F0D0B] text-[#F9F3EB]">
        <div className="text-center">
          <div className="mx-auto h-9 w-9 animate-spin rounded-full border-2 border-[#D7A74D]/50 border-t-[#D7A74D]" />
          <p className="mt-3 text-sm text-[#D8C6AE]">Cargando seguimiento...</p>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#0F0D0B] px-6 text-[#F9F3EB]">
        <p className="max-w-md text-center text-sm text-[#E7D5BF]">{error}</p>
      </main>
    );
  }

  if (!order) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#0F0D0B] px-6 text-[#F9F3EB]">
        <section className="max-w-lg rounded-3xl border border-[#D7A74D]/25 bg-[#1A140E] p-8 text-center shadow-xl shadow-black/35">
          <p className="text-lg font-bold text-[#FFEACC]">Pedido no encontrado</p>
          <p className="mt-2 text-sm text-[#D8C6AE]">Verifica el enlace o intenta de nuevo en unos minutos.</p>
          <Link
            href="/"
            className="mt-5 inline-flex rounded-full bg-[#FF7A00] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#E56E00]"
          >
            Ir al inicio
          </Link>
        </section>
      </main>
    );
  }

  const currentStep = statusIndex(resolvedStatus);

  return (
    <main className="min-h-screen bg-[#0F0D0B] px-4 py-8 text-[#F9F3EB] sm:px-6">
      <section className="mx-auto max-w-3xl rounded-3xl border border-[#D7A74D]/25 bg-[#1A140E] p-5 shadow-2xl shadow-black/35 sm:p-7">
        <p className="text-[10px] uppercase tracking-[0.34em] text-[#D7A74D]">Seguimiento de pedido</p>
        <h1 className="mt-2 text-2xl font-black text-[#FFF4E2] sm:text-3xl">Pedido {orderId}</h1>
        <p className="mt-2 text-sm text-[#D8C6AE]">{statusLabel(resolvedStatus)}</p>

        <div className="mt-5 rounded-2xl border border-[#D7A74D]/20 bg-[#120D08] p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-[#C9AB83]">Estado</p>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-5">
            {ORDER_FLOW.map((step, index) => {
              const isDone = index <= currentStep;
              const isCurrent = index === currentStep;
              return (
                <div key={step.key} className="flex items-center gap-2 sm:flex-col sm:items-start">
                  <div
                    className={`h-2 w-2 rounded-full ${
                      isDone ? 'bg-[#FF7A00]' : 'bg-[#6B5A45]'
                    } ${isCurrent ? 'ring-4 ring-[#FF7A00]/20' : ''}`}
                  />
                  <p className={`text-xs font-semibold ${isDone ? 'text-[#FFEACC]' : 'text-[#9A876E]'}`}>
                    {step.short}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-[#D7A74D]/20 bg-[#120D08] p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-[#C9AB83]">Cliente</p>
            <p className="mt-2 text-sm text-[#F4E6D2]">{contactName || 'Sin nombre registrado'}</p>
            <p className="mt-1 text-sm text-[#D8C6AE]">{contactPhone || 'Sin telefono registrado'}</p>
            <p className="mt-1 text-xs text-[#BFA88B]">{contactEmail || 'Sin correo registrado'}</p>
          </div>

          <div className="rounded-2xl border border-[#D7A74D]/20 bg-[#120D08] p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-[#C9AB83]">Resumen</p>
            <p className="mt-2 flex items-center justify-between text-sm text-[#D8C6AE]">
              <span>Subtotal</span>
              <span>{formatAmountByCurrency(subtotalCheckout, checkoutCurrency)}</span>
            </p>
            <p className="mt-1 flex items-center justify-between text-sm text-[#D8C6AE]">
              <span>Delivery</span>
              <span>{formatAmountByCurrency(deliveryCheckout, checkoutCurrency)}</span>
            </p>
            <p className="mt-2 flex items-center justify-between border-t border-[#D7A74D]/15 pt-2 text-base font-black text-[#FFEACC]">
              <span>Total ({checkoutCurrency})</span>
              <span>{formatAmountByCurrency(totalCheckout, checkoutCurrency)}</span>
            </p>
            {checkoutCurrency !== 'COP' ? (
              <p className="mt-2 text-[11px] text-[#BFA88B]">Tasa snapshot: 1 {checkoutCurrency} = {exchangeRate} COP</p>
            ) : null}
            <p className="mt-1 text-[11px] text-[#9E886D]">Base COP: {formatCop(total)}</p>
          </div>
        </div>

        {orderNotes ? (
          <div className="mt-5 rounded-2xl border border-[#D7A74D]/20 bg-[#120D08] p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-[#C9AB83]">Notas del pedido</p>
            <p className="mt-2 text-sm text-[#F4E6D2]">{orderNotes}</p>
          </div>
        ) : null}

        {orderItems.length > 0 ? (
          <div className="mt-5 rounded-2xl border border-[#D7A74D]/20 bg-[#120D08] p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-[#C9AB83]">Productos</p>
            <div className="mt-3 overflow-hidden rounded-xl border border-[#D7A74D]/15">
              <table className="w-full text-left text-sm text-[#D8C6AE]">
                <thead className="bg-[#1B140D] text-[11px] uppercase tracking-[0.12em] text-[#C9AB83]">
                  <tr>
                    <th className="px-3 py-2">Cant.</th>
                    <th className="px-3 py-2">Producto</th>
                    <th className="px-3 py-2 text-right">P. Unitario</th>
                    <th className="px-3 py-2 text-right">Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {orderItems.map((item, index) => (
                    <tr key={`order-item-${index}`} className="border-t border-[#D7A74D]/10">
                      <td className="px-3 py-2 font-semibold">{item.cantidad}</td>
                      <td className="px-3 py-2">{item.nombre}</td>
                      <td className="px-3 py-2 text-right font-semibold">
                        {formatAmountByCurrency(item.precioUnitario, checkoutCurrency)}
                      </td>
                      <td className="px-3 py-2 text-right font-semibold">
                        {formatAmountByCurrency(item.subtotal, checkoutCurrency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        <div className="mt-5 rounded-2xl border border-[#D7A74D]/20 bg-[#120D08] p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-[#C9AB83]">Pago</p>
          <p className="mt-2 text-sm text-[#D8C6AE]">
            Metodo: {paymentMethodName || 'No especificado'}
          </p>
          {paymentMethodDetails.length > 0 ? (
            <p className="mt-1 text-xs text-[#BFA88B]">{paymentMethodDetails.slice(0, 2).join(' · ')}</p>
          ) : null}
          <p className="mt-2 text-sm text-[#D8C6AE]">
            Referencia: {paymentReference ? `****${paymentReference.slice(-4)}` : 'No registrada'}
          </p>
          <p className="mt-1 text-sm text-[#D8C6AE]">
            Comprobante: {paymentProofUrl ? 'Cargado correctamente' : 'No cargado'}
          </p>
          <p className="mt-1 text-sm text-[#D8C6AE]">
            Total pagado ({checkoutCurrency}): {formatAmountByCurrency(totalCheckout, checkoutCurrency)}
          </p>
          <p className="mt-1 text-xs text-[#BFA88B]">
            Tasa aplicada: 1 {checkoutCurrency} = {exchangeRate} COP
          </p>
          {cashPaymentAmount !== null ? (
            <p className="mt-1 text-sm text-[#D8C6AE]">
              Pago en efectivo con: {formatAmountByCurrency(cashPaymentAmount, checkoutCurrency)}
            </p>
          ) : null}
          {cashChangeAmount > 0 ? (
            <p className="mt-1 text-sm text-[#D8C6AE]">
              Cambio: {formatAmountByCurrency(cashChangeAmount, checkoutCurrency)}
            </p>
          ) : null}
          {paymentProofUrl ? (
            <a
              href={paymentProofUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex rounded-full border border-[#D7A74D]/30 px-4 py-2 text-xs font-semibold text-[#FFEACC]"
            >
              Ver comprobante
            </a>
          ) : null}
        </div>

        {isDelivery ? (
          <div className="mt-5 space-y-3">
            <div className="rounded-2xl border border-[#D7A74D]/20 bg-[#120D08] p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-[#C9AB83]">Direccion de entrega</p>
              <p className="mt-2 text-sm text-[#F4E6D2]">{deliveryAddress || 'Direccion no disponible'}</p>
              {deliveryReference ? (
                <p className="mt-2 text-sm text-[#D8C6AE]">Referencia: {deliveryReference}</p>
              ) : null}
              {deliveryInstructions ? (
                <p className="mt-1 text-sm text-[#D8C6AE]">Indicaciones: {deliveryInstructions}</p>
              ) : null}
              <div className="mt-3 overflow-hidden rounded-xl border border-[#D7A74D]/15">
                <iframe
                  src={deliveryMapSrc}
                  title="Mapa de entrega"
                  className="h-48 w-full"
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                />
              </div>
            </div>

            <div className="rounded-2xl border border-[#D7A74D]/20 bg-[#120D08] p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-[#C9AB83]">Ubicacion del comercio</p>
              <p className="mt-2 text-sm text-[#F4E6D2]">{(comercio?.nombre ?? 'elmenuxfa.com').trim()}</p>
              <div className="mt-3 overflow-hidden rounded-xl border border-[#D7A74D]/15">
                <iframe
                  src={businessMapSrc}
                  title="Mapa del comercio"
                  className="h-48 w-full"
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                />
              </div>
            </div>
          </div>
        ) : null}

        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-center">
          <button
            type="button"
            onClick={() => void enableStatusNotifications()}
            className="rounded-full border border-[#D7A74D]/30 bg-[#241A11] px-4 py-2 text-xs font-bold uppercase tracking-[0.08em] text-[#FFEACC]"
          >
            Activar notificaciones de estado
          </button>
          {finalWaLink ? (
            <a
              href={finalWaLink}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full border border-[#D7A74D]/20 px-4 py-2 text-center text-xs font-semibold text-[#D8C6AE]"
            >
              Abrir comprobante en WhatsApp
            </a>
          ) : null}
        </div>

        {notificationMessage ? (
          <p className="mt-2 text-xs text-[#C9AB83]">{notificationMessage}</p>
        ) : null}
      </section>
    </main>
  );
}
