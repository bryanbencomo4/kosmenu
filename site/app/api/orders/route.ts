import { NextResponse } from 'next/server';
import { z } from 'zod';

import {
  createOrderId,
} from '../_lib/order-utils';
import { publicSiteUrl } from '../_lib/public-site-url';
import { canSendOrderEmail, sendOrderEmail } from '../_lib/send-order-email';
import { getServerSupabaseClient } from '../_lib/supabase-server';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const WHATSAPP_DIGITS_PATTERN = /^(?:\d{10,15}|(?:58)?4\d{9}|0?4\d{9})$/;

function isUuid(value: string) {
  return UUID_PATTERN.test(value);
}

type CreateOrderPayload = {
  comercioId?: string;
  clientEmail?: string;
  clientName?: string;
  clientWhatsapp?: string;
  currency?: string;
  exchangeRate?: number;
  comercioNombre?: string;
  items?: unknown;
  detalles?: Record<string, unknown>;
  costoDelivery?: number;
  delivery?: {
    mode?: 'pickup' | 'delivery';
    address?: string;
    reference?: string;
    instructions?: string;
    coordinates?: { lat?: number; lng?: number } | null;
  };
  paymentMethod?: {
    id?: string;
    nombre?: string;
    datos?: string[];
  } | null;
  paymentReferenceLast4?: string;
  paymentProofUrl?: string;
  cashPaymentAmount?: number | null;
  cashChangeAmount?: number | null;
  orderNotes?: string;
};

const ItemSchema = z.object({
  product_id: z.string().min(1, 'items[].product_id es requerido.'),
  nombre: z.string().trim().optional(),
  cantidad: z.number().finite().positive('items[].cantidad debe ser mayor a 0.'),
  precio: z.number().finite().min(0, 'items[].precio debe ser >= 0.'),
});

const DeliverySchema = z
  .object({
    mode: z.enum(['pickup', 'delivery']),
    address: z.string().trim().optional(),
    reference: z.string().trim().optional(),
    instructions: z.string().trim().optional(),
    coordinates: z
      .object({
        lat: z.number().finite(),
        lng: z.number().finite(),
      })
      .nullable()
      .optional(),
  })
  .superRefine((delivery, ctx) => {
    if (delivery.mode !== 'delivery') return;

    if (!delivery.address || delivery.address.trim().length < 6) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['address'],
        message: 'delivery.address es requerido para pedidos delivery.',
      });
    }

    if (!delivery.coordinates) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['coordinates'],
        message: 'delivery.coordinates es requerido para pedidos delivery.',
      });
    }
  });

const OrderSchema = z.object({
  comercioId: z.string().min(1, 'comercioId es requerido.'),
  cliente_nombre: z.string().min(3, 'cliente_nombre es requerido.'),
  telefono_cliente: z
    .string()
    .min(10, 'telefono_cliente es requerido.')
    .regex(
      WHATSAPP_DIGITS_PATTERN,
      'telefono_cliente debe tener un formato numerico valido (internacional o local VE).',
    ),
  moneda_checkout: z.string().min(1, 'moneda_checkout es requerida.'),
  tasa_cambio_snapshot: z.number().finite().positive('tasa_cambio_snapshot debe ser mayor a 0.'),
  costo_delivery: z.number().finite().min(0),
  items: z.array(ItemSchema).min(1, 'items[] es requerido.'),
  delivery: DeliverySchema,
});

function normalizeText(value: unknown) {
  return (value ?? '').toString().trim();
}

function normalizeDigits(value: unknown) {
  return normalizeText(value).replace(/\D/g, '');
}

function normalizeStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => normalizeText(entry))
    .filter((entry) => entry.length > 0);
}

function normalizePaymentMethod(value: unknown) {
  const raw = (value ?? null) as {
    id?: unknown;
    nombre?: unknown;
    datos?: unknown;
  } | null;
  if (!raw) return null;

  const id = normalizeText(raw.id);
  const nombre = normalizeText(raw.nombre);
  const datos = normalizeStringArray(raw.datos);

  if (!id && !nombre && datos.length === 0) return null;

  return {
    id: id || undefined,
    nombre: nombre || undefined,
    datos,
  };
}

function normalizeDelivery(value: unknown) {
  const raw = (value ?? null) as {
    mode?: unknown;
    address?: unknown;
    reference?: unknown;
    instructions?: unknown;
    coordinates?: { lat?: unknown; lng?: unknown } | null;
  } | null;
  if (!raw) return { mode: 'pickup' as const };

  const mode = normalizeText(raw.mode).toLowerCase() === 'delivery' ? 'delivery' : 'pickup';
  const address = normalizeText(raw.address);
  const reference = normalizeText(raw.reference);
  const instructions = normalizeText(raw.instructions);
  const lat = Number(raw.coordinates?.lat);
  const lng = Number(raw.coordinates?.lng);
  const hasCoords = Number.isFinite(lat) && Number.isFinite(lng);

  return {
    mode,
    address,
    reference,
    instructions,
    coordinates: hasCoords ? { lat, lng } : null,
  };
}

function normalizeCurrencyCode(value: string | null | undefined) {
  const code = (value ?? '').toString().trim().toUpperCase();
  if (!code || code === 'SIN MONEDA') return 'COP';
  return code;
}

function normalizeExchangeRate(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value;
  const raw = (value ?? '').toString().trim().replace(',', '.');
  if (!raw) return 1;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function convertFromCop(amountInCop: number, currency: string, exchangeRate: number) {
  if (currency === 'COP') return amountInCop;
  return amountInCop / exchangeRate;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as CreateOrderPayload;

    const incomingDetalles = (body.detalles ?? {}) as Record<string, unknown>;
    const rawComercioId = decodeURIComponent(body.comercioId ?? '').trim();
    const rawClientEmail = (body.clientEmail ?? '').trim().toLowerCase();
    const rawClientName = normalizeText(body.clientName ?? incomingDetalles.cliente_nombre);
    const rawClientWhatsapp = normalizeDigits(body.clientWhatsapp ?? incomingDetalles.telefono_cliente);
    const rawCurrency = normalizeCurrencyCode(body.currency ?? incomingDetalles.moneda_checkout?.toString());
    const rawExchangeRate = Number(body.exchangeRate ?? incomingDetalles.tasa_cambio_snapshot);
    const rawCostDelivery = Number(body.costoDelivery ?? incomingDetalles.costo_delivery ?? 0);
    const rawDelivery = normalizeDelivery(body.delivery ?? incomingDetalles.delivery);
    const rawItems = Array.isArray(body.items)
      ? body.items.map((item) => ({
          product_id: normalizeText((item as any)?.product_id ?? (item as any)?.productId),
          nombre: normalizeText((item as any)?.nombre),
          cantidad: Number((item as any)?.cantidad),
          precio: Number((item as any)?.precio),
        }))
      : [];

    const validationResult = OrderSchema.safeParse({
      comercioId: rawComercioId,
      cliente_nombre: rawClientName,
      telefono_cliente: rawClientWhatsapp,
      moneda_checkout: rawCurrency,
      tasa_cambio_snapshot: rawExchangeRate,
      costo_delivery: Number.isFinite(rawCostDelivery) ? Math.max(rawCostDelivery, 0) : 0,
      items: rawItems,
      delivery: rawDelivery,
    });

    if (!validationResult.success) {
      return NextResponse.json(
        {
          error: 'Bad Request',
          details: validationResult.error.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
          })),
        },
        { status: 400 },
      );
    }

    const validated = validationResult.data;

    const comercioId = validated.comercioId;
    const clientEmail = rawClientEmail;
    const clientName = validated.cliente_nombre;
    const clientWhatsapp = validated.telefono_cliente;
    const comercioNombre = (body.comercioNombre ?? 'Kosmenu').trim() || 'Kosmenu';
    const costoDelivery = validated.costo_delivery;
    const currency = validated.moneda_checkout;
    const exchangeRate = validated.tasa_cambio_snapshot;
    const delivery = validated.delivery;
    const items = validated.items.map((item) => ({
      product_id: item.product_id,
      nombre: item.nombre || 'Producto',
      cantidad: item.cantidad,
      precio: item.precio,
    }));
    const paymentMethod = normalizePaymentMethod(body.paymentMethod ?? incomingDetalles.metodo_pago);
    const orderNotes = normalizeText(body.orderNotes ?? incomingDetalles.order_notes);
    const whatsappNotificationsEnabled =
      typeof (incomingDetalles as any)?.notifications?.whatsapp_enabled === 'boolean'
        ? Boolean((incomingDetalles as any).notifications.whatsapp_enabled)
        : true;
    const paymentReferenceLast4 = normalizeDigits(body.paymentReferenceLast4 ?? incomingDetalles.referencia_pago).slice(-4);
    const paymentProofUrl = normalizeText(body.paymentProofUrl ?? incomingDetalles.comprobante_url);
    const cashPaymentAmount = Number(body.cashPaymentAmount ?? incomingDetalles.pago_con ?? 0);
    const cashChangeAmount = Number(body.cashChangeAmount ?? incomingDetalles.cambio_de ?? 0);

    const subtotal = items.reduce((sum, item) => sum + item.cantidad * item.precio, 0);
    const total = subtotal + (Number.isFinite(costoDelivery) ? Math.max(costoDelivery, 0) : 0);
    const subtotalCheckout = convertFromCop(subtotal, currency, exchangeRate);
    const costoDeliveryCheckout = convertFromCop(
      Number.isFinite(costoDelivery) ? Math.max(costoDelivery, 0) : 0,
      currency,
      exchangeRate,
    );
    const totalCheckout = convertFromCop(total, currency, exchangeRate);
    const supabase = getServerSupabaseClient();

    const comercioQuery = supabase
      .from('comercios')
      .select('id,slug')
      .limit(1);
    const { data: comercios, error: comercioError } = isUuid(comercioId)
      ? await comercioQuery.eq('id', comercioId)
      : await comercioQuery.eq('slug', comercioId);

    if (comercioError) {
      throw new Error(comercioError.message);
    }

    const resolvedComercioId = (comercios ?? [])[0]?.id?.toString().trim() ?? '';
    const resolvedComercioSlug = (comercios ?? [])[0]?.slug?.toString().trim() ?? '';
    if (!resolvedComercioId) {
      return NextResponse.json({ error: 'Comercio not found.' }, { status: 404 });
    }

    const orderId = createOrderId(resolvedComercioId);

    const detalles = {
      order_id: orderId,
      cliente_nombre: clientName,
      cliente_email: clientEmail || null,
      telefono_cliente: clientWhatsapp,
      moneda_checkout: currency,
      tasa_cambio_snapshot: exchangeRate,
      metodo_pago: paymentMethod,
      notifications: {
        whatsapp_enabled: whatsappNotificationsEnabled,
        updated_at: new Date().toISOString(),
      },
      referencia_pago: paymentReferenceLast4 || null,
      comprobante_url: paymentProofUrl || null,
      delivery,
      order_notes: orderNotes,
      pago_con: Number.isFinite(cashPaymentAmount) && cashPaymentAmount > 0 ? cashPaymentAmount : null,
      cambio_de: Number.isFinite(cashChangeAmount) && cashChangeAmount > 0 ? cashChangeAmount : 0,
      subtotal,
      subtotal_moneda_checkout: subtotalCheckout,
      costo_delivery: Number.isFinite(costoDelivery) ? Math.max(costoDelivery, 0) : 0,
      costo_delivery_moneda_checkout: costoDeliveryCheckout,
      items,
      total,
      total_moneda_checkout: totalCheckout,
    };

    const payload = {
      comercio_id: resolvedComercioId,
      estado: 'pendiente',
      total,
      costo_delivery: Number.isFinite(costoDelivery) ? Math.max(costoDelivery, 0) : 0,
      nombre_cliente: clientName,
      telefono_cliente: clientWhatsapp,
      detalles,
      cliente_email: clientEmail,
    };

    const insertResult = await supabase.from('pedidos').insert(payload);
    const insertError = insertResult.error;

    if (insertError) {
      throw new Error(insertError.message ?? 'Failed to create order.');
    }

    const trackingUrl = resolvedComercioSlug
      ? `${publicSiteUrl}/v/${encodeURIComponent(resolvedComercioSlug)}/orders/${encodeURIComponent(orderId)}`
      : `${publicSiteUrl}/orders/${encodeURIComponent(orderId)}`;
    let emailStatus: 'queued' | 'skipped' = 'skipped';
    let whatsappStatus: 'queued' | 'skipped' = 'skipped';

    if (clientEmail && canSendOrderEmail()) {
      emailStatus = 'queued';
      void sendOrderEmail({
        clientEmail,
        comercioNombre,
        orderId,
        orderTrackingUrl: trackingUrl,
      }).catch(() => {
        // Keep response fast; email failures are handled asynchronously.
      });
    }

    if (clientWhatsapp) {
      whatsappStatus = 'queued';
    }

    return NextResponse.json(
      {
        ok: true,
        data: {
          orderId,
          comercioId: resolvedComercioId,
          subtotal,
          costoDelivery: Number.isFinite(costoDelivery) ? Math.max(costoDelivery, 0) : 0,
          total,
          trackingUrl,
          emailStatus,
          whatsappStatus,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create order.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
