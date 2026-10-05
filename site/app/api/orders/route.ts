import { createHash, randomBytes } from 'node:crypto';

import { NextResponse } from 'next/server';
import { z } from 'zod';

import {
  hashOrderIdempotencyPayload,
  lookupOrderIdempotency,
  normalizeIdempotencyKey,
  storeOrderIdempotency,
} from '../_lib/order-idempotency';
import { allocateOrderDisplayId } from '../_lib/allocate-order-display-id';
import { publicSiteUrl } from '../_lib/public-site-url';
import {
  generatePublicTrackingToken,
  hashPublicTrackingToken,
} from '../_lib/order-tracking-token';
import {
  consumeRateLimit,
  getClientIp,
} from '../_lib/rate-limit';
import { canSendOrderEmail, sendOrderEmail } from '../_lib/send-order-email';
import { getServiceSupabaseClient } from '../_lib/supabase-server';
import { evaluateBusinessOrdering } from '../_lib/business-hours';
import { convertOrderAmount, normalizeOrderCurrency } from '../_lib/order-currency';
import { extractPublicCheckoutExchange } from '../_lib/checkout-exchange-config';
import {
  convertAmountBetweenCurrencies,
  parseExchangeRate,
  type MarketRatesInput,
} from '../../_lib/checkout-exchange-rate';
import { createOrderShortLink } from '../_lib/order-short-links';
import {
  buildOrderItemSnapshots,
  type SnapshotCategoryRow,
  type SnapshotProductRow,
} from '../_lib/order-item-snapshots';
import { sanitizeCartLineSelection } from '../../_lib/menu-product-options';
import { optionalMerchantComanda } from '../../_lib/whatsapp-order-format';
import { resolveCommerceManagementMode } from '../../_lib/order-management-mode';
import { extractDeliveryConfigSource, parseDeliveryConfig, quoteDeliveryFee } from '../../_lib/delivery-config';
import {
  createCustomerRatingKey,
  loadOrderServiceRatingSummary,
} from '../_lib/order-service-rating';
import {
  isTransientSupabaseFailure,
  supabaseWriteCircuit,
} from '../_lib/supabase-circuit';

export const maxDuration = 10;

function hashCustomerAccessToken(token: string) {
  return createHash('sha256').update(token.trim(), 'utf8').digest('hex');
}

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

type CreateOrderItemInput = {
  product_id?: unknown;
  productId?: unknown;
  nombre?: unknown;
  cantidad?: unknown;
  precio?: unknown;
  opciones?: unknown;
};

type NotificationsInput = {
  whatsapp_enabled?: boolean;
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

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
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

export async function POST(request: Request) {
  try {
    const ip = getClientIp(request);
    const rate = consumeRateLimit(`orders:ip:${ip}`, 20, 60_000);
    if (rate.ok === false) {
      return NextResponse.json(
        { ok: false, error: 'rate_limited' },
        {
          status: 429,
          headers: { 'Retry-After': String(rate.retryAfterSec) },
        },
      );
    }

    if (!supabaseWriteCircuit.allow()) {
      return NextResponse.json(
        {
          ok: false,
          error: 'service_unavailable',
          message: 'Estamos actualizando el sistema. Intenta el pedido de nuevo en unos segundos.',
        },
        { status: 503, headers: { 'Retry-After': '30' } },
      );
    }

    const body = (await request.json()) as CreateOrderPayload;

    const incomingDetalles = (body.detalles ?? {}) as Record<string, unknown>;
    const rawComercioId = decodeURIComponent(body.comercioId ?? '').trim();
    const rawClientEmail = (body.clientEmail ?? '').trim().toLowerCase();
    const rawClientName = normalizeText(body.clientName ?? incomingDetalles.cliente_nombre);
    const rawClientWhatsapp = normalizeDigits(body.clientWhatsapp ?? incomingDetalles.telefono_cliente);
    const rawCurrency = normalizeOrderCurrency(body.currency ?? incomingDetalles.moneda_checkout?.toString());
    const rawExchangeRate = Number(body.exchangeRate ?? incomingDetalles.tasa_cambio_snapshot);
    const rawCostDelivery = Number(body.costoDelivery ?? incomingDetalles.costo_delivery ?? 0);
    const rawDelivery = normalizeDelivery(body.delivery ?? incomingDetalles.delivery);
    const rawItems = Array.isArray(body.items)
      ? body.items.map((item) => ({
          product_id: normalizeText((item as CreateOrderItemInput)?.product_id ?? (item as CreateOrderItemInput)?.productId),
          nombre: normalizeText((item as CreateOrderItemInput)?.nombre),
          cantidad: Number((item as CreateOrderItemInput)?.cantidad),
          precio: Number((item as CreateOrderItemInput)?.precio),
        }))
      : [];
    // Kept outside `items` so the idempotency payload hash is unchanged.
    const rawItemSelections = Array.isArray(body.items)
      ? body.items.map((item) => {
          const raw = (item as CreateOrderItemInput)?.opciones;
          return raw === undefined || raw === null ? null : sanitizeCartLineSelection(raw);
        })
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
    if (rawItemSelections.some((selection) => selection?.combinacion && !isUuid(selection.combinacion.productId))) {
      return NextResponse.json(
        { ok: false, code: 'INVALID_OPTIONS', error: 'Esta combinación no está permitida.' },
        { status: 400 },
      );
    }
    const rawIdempotencyHeader = request.headers.get('x-idempotency-key');
    const idempotencyKey = normalizeIdempotencyKey(rawIdempotencyHeader);
    if (rawIdempotencyHeader && rawIdempotencyHeader.trim() && !idempotencyKey) {
      return NextResponse.json(
        { ok: false, error: 'invalid_idempotency_key' },
        { status: 400 },
      );
    }

    const idempotencyPayload = {
      comercioId: validated.comercioId,
      cliente_nombre: validated.cliente_nombre,
      telefono_cliente: validated.telefono_cliente,
      moneda_checkout: validated.moneda_checkout,
      tasa_cambio_snapshot: validated.tasa_cambio_snapshot,
      costo_delivery: validated.costo_delivery,
      items: validated.items,
      delivery: validated.delivery,
      paymentMethod: normalizePaymentMethod(body.paymentMethod ?? incomingDetalles.metodo_pago),
      paymentProofUrl: normalizeText(body.paymentProofUrl ?? incomingDetalles.comprobante_url),
      orderNotes: normalizeText(body.orderNotes ?? incomingDetalles.order_notes),
      ...(rawItemSelections.some((selection) => selection?.combinacion || selection?.exclusionesIds?.length)
        ? { personalizacion: rawItemSelections } : {}),
    };
    const requestHash = hashOrderIdempotencyPayload(idempotencyPayload);

    if (idempotencyKey) {
      const existing = await lookupOrderIdempotency({
        key: idempotencyKey,
        requestHash,
      });
      if (existing.status === 'conflict') {
        return NextResponse.json(
          { ok: false, error: 'idempotency_key_reuse_with_different_payload' },
          { status: 409 },
        );
      }
      if (existing.status === 'hit') {
        const cached = existing.response as {
          data?: { orderId?: string; comercioId?: string };
        };
        const cachedOrderId = (cached.data?.orderId ?? '').toString().trim();
        const cachedComercioId = (cached.data?.comercioId ?? '').toString().trim();
        if (cachedOrderId && cachedComercioId) {
          const supabase = getServiceSupabaseClient();
          const currency = validated.moneda_checkout;
          const { data: replayCommerce } = await supabase
            .from('comercios')
            .select('moneda')
            .eq('id', cachedComercioId)
            .maybeSingle();
          const replayBaseCurrency = normalizeOrderCurrency(replayCommerce?.moneda);
          const replayTotal = validated.items.reduce((sum, item) => sum + item.cantidad * item.precio, 0)
            + (Number.isFinite(validated.costo_delivery) ? Math.max(validated.costo_delivery, 0) : 0);
          const replayTotalCheckout = convertOrderAmount(
            replayTotal,
            replayBaseCurrency,
            currency,
            validated.tasa_cambio_snapshot,
          ) ?? replayTotal;
        }
        return NextResponse.json(existing.response, { status: 200 });
      }
    }

    const comercioId = validated.comercioId;
    const clientEmail = rawClientEmail;
    const clientName = validated.cliente_nombre;
    const clientWhatsapp = validated.telefono_cliente;
    const comercioNombre = (body.comercioNombre ?? 'Kosmenu').trim() || 'Kosmenu';
    let costoDelivery = validated.costo_delivery;
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
    const notifications = asRecord(incomingDetalles.notifications) as NotificationsInput;
    const whatsappNotificationsEnabled =
      typeof notifications.whatsapp_enabled === 'boolean' ? notifications.whatsapp_enabled : true;
    const paymentReferenceLast4 = normalizeDigits(body.paymentReferenceLast4 ?? incomingDetalles.referencia_pago).slice(-4);
    const paymentProofUrl = normalizeText(body.paymentProofUrl ?? incomingDetalles.comprobante_url);
    const cashPaymentAmount = Number(body.cashPaymentAmount ?? incomingDetalles.pago_con ?? 0);
    const cashChangeAmount = Number(body.cashChangeAmount ?? incomingDetalles.cambio_de ?? 0);

    let subtotal = items.reduce((sum, item) => sum + item.cantidad * item.precio, 0);
    let total = subtotal + (Number.isFinite(costoDelivery) ? Math.max(costoDelivery, 0) : 0);
    const supabase = getServiceSupabaseClient();

    async function loadComercioRow() {
      const selects = [
        'id,slug,moneda,en_linea,horarios,latitud,longitud,exchange_rate_value,exchange_rate_source,exchange_rate_mode,exchange_rate_quote_currency,branding_ia->config_negocio',
        'id,slug,moneda,en_linea,horarios,latitud,longitud,branding_ia->config_negocio',
        'id,slug,moneda,en_linea,horarios,latitud,longitud,branding_ia',
        'id,slug,moneda,en_linea,horarios',
        'id,slug,moneda',
      ];
      let last: { data: unknown; error: { message?: string } | null } | null = null;
      for (const select of selects) {
        const query = supabase.from('comercios').select(select).limit(1);
        const result = isUuid(comercioId)
          ? await query.eq('id', comercioId)
          : await query.eq('slug', comercioId);
        last = result;
        if (!result.error) return result;
        console.warn('[orders] comercio select fallback', { select, message: result.error.message });
      }
      return last ?? { data: null, error: { message: 'Comercio not found.' } };
    }

    const { data: comercios, error: comercioError } = await loadComercioRow();

    if (comercioError) {
      throw new Error(comercioError.message);
    }

    const comercioRow = (comercios ?? [])[0] as
      | {
          id?: string;
          slug?: string;
          moneda?: string | null;
          en_linea?: boolean | null;
          horarios?: unknown;
          latitud?: number | string | null;
          longitud?: number | string | null;
          exchange_rate_value?: number | string | null;
          exchange_rate_source?: string | null;
          exchange_rate_mode?: string | null;
          exchange_rate_quote_currency?: string | null;
          branding_ia?: unknown;
          config_negocio?: unknown;
        }
      | undefined;
    const resolvedComercioId = comercioRow?.id?.toString().trim() ?? '';
    const resolvedComercioSlug = comercioRow?.slug?.toString().trim() ?? '';
    const baseCurrency = normalizeOrderCurrency(comercioRow?.moneda);
    if (!resolvedComercioId) {
      return NextResponse.json({ error: 'Comercio not found.' }, { status: 404 });
    }

    const snapshotResult = await buildOrderItemSnapshots({
      items,
      selections: rawItemSelections,
      comercioId: resolvedComercioId,
      loadProducts: async (productIds) => {
        const { data, error } = await supabase
          .from('productos')
          .select('id,comercio_id,disponible,categoria_id,nombre,imagen_url,precio,opciones_menu')
          .eq('comercio_id', resolvedComercioId)
          .in('id', productIds);
        if (error) throw new Error(error.message);
        return (data ?? []) as SnapshotProductRow[];
      },
      loadCategories: async (categoryIds) => {
        const { data, error } = await supabase
          .from('categorias')
          .select('id,nombre,opciones_menu')
          .eq('comercio_id', resolvedComercioId)
          .in('id', categoryIds);
        if (error) throw new Error(error.message);
        return (data ?? []) as SnapshotCategoryRow[];
      },
    });
    if (snapshotResult.ok === true) {
      subtotal = snapshotResult.items.reduce((sum, item) => sum + item.cantidad * item.precio, 0);
      total = subtotal + (Number.isFinite(costoDelivery) ? Math.max(costoDelivery, 0) : 0);
    }

    const originLat = Number(comercioRow?.latitud);
    const originLng = Number(comercioRow?.longitud);
    const destLat = Number(delivery.coordinates?.lat);
    const destLng = Number(delivery.coordinates?.lng);
    const deliveryConfigSource = extractDeliveryConfigSource(comercioRow);
    const deliveryConfig = parseDeliveryConfig(deliveryConfigSource);
    const brandingRecord = asRecord(comercioRow?.branding_ia);
    const configFromColumn = asRecord(comercioRow?.config_negocio);
    const configNegocio = Object.keys(configFromColumn).length > 0
      ? configFromColumn
      : asRecord(brandingRecord.config_negocio);
    const checkoutExchange = extractPublicCheckoutExchange(
      brandingRecord.config_negocio ? brandingRecord : { config_negocio: configNegocio },
    );
    const tariffCurrency = normalizeOrderCurrency(
      deliveryConfig.currency || baseCurrency,
      baseCurrency,
    );
    let marketRates: MarketRatesInput | null = null;
    try {
      const { data: marketRow } = await supabase
        .from('global_market_rates')
        .select('bcv_rate, p2p_binance_rate, payload')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (marketRow && typeof marketRow === 'object') {
        marketRates = marketRow as MarketRatesInput;
      }
    } catch (error) {
      console.warn('[orders] market rates unavailable for delivery conversion', error);
    }
    const convertDeliveryToBase = (amount: number) =>
      convertAmountBetweenCurrencies(amount, tariffCurrency, baseCurrency, {
        baseCurrency,
        checkoutExchange,
        businessExchangeRate:
          parseExchangeRate(comercioRow?.exchange_rate_value) ??
          parseExchangeRate(configNegocio.exchange_rate_value) ??
          parseExchangeRate(configNegocio.tasa_cambio_pesos),
        businessQuoteCurrency:
          (comercioRow?.exchange_rate_quote_currency ??
            configNegocio.exchange_rate_quote_currency ??
            '')
            .toString()
            .trim() || null,
        businessExchangeSource: (
          comercioRow?.exchange_rate_source ??
          configNegocio.exchange_rate_source ??
          'google'
        )
          .toString()
          .trim()
          .toLowerCase(),
        businessExchangeMode: (
          comercioRow?.exchange_rate_mode ??
          configNegocio.exchange_rate_mode ??
          'auto'
        )
          .toString()
          .trim()
          .toLowerCase(),
        marketRates,
      });
    const deliveryQuote = quoteDeliveryFee({
      config: deliveryConfigSource,
      isDelivery: delivery.mode === 'delivery',
      subtotal,
      origin: Number.isFinite(originLat) && Number.isFinite(originLng)
        ? { lat: originLat, lng: originLng }
        : null,
      destination: Number.isFinite(destLat) && Number.isFinite(destLng)
        ? { lat: destLat, lng: destLng }
        : null,
      fallbackFee: costoDelivery,
      convertToBase: convertDeliveryToBase,
    });
    if (deliveryQuote.blocked) {
      return NextResponse.json(
        {
          ok: false,
          error: 'delivery_not_available',
          message: deliveryQuote.blockReason ?? 'Delivery no disponible para este pedido.',
        },
        { status: 400 },
      );
    }
    if (deliveryQuote.applied) {
      costoDelivery = deliveryQuote.fee;
      total = subtotal + costoDelivery;
    }

    const customerRatingSummary = await loadOrderServiceRatingSummary(
      supabase,
      resolvedComercioId,
      await createCustomerRatingKey(clientWhatsapp),
    );

    const ordering = evaluateBusinessOrdering({
      enLinea: comercioRow?.en_linea,
      horarios: comercioRow?.horarios,
    });
    if (ordering.allowed === false) {
      return NextResponse.json(
        { error: ordering.error, message: ordering.message },
        { status: 403 },
      );
    }

    if (snapshotResult.ok === false) {
      return NextResponse.json(
        { ok: false, error: snapshotResult.message, code: snapshotResult.code },
        { status: snapshotResult.status },
      );
    }
    const storedItems = snapshotResult.items;
    const subtotalCheckout = convertOrderAmount(subtotal, baseCurrency, currency, exchangeRate);
    const costoDeliveryCheckout = convertOrderAmount(
      Number.isFinite(costoDelivery) ? Math.max(costoDelivery, 0) : 0,
      baseCurrency,
      currency,
      exchangeRate,
    );
    const totalCheckout = convertOrderAmount(total, baseCurrency, currency, exchangeRate);
    if (subtotalCheckout === null || costoDeliveryCheckout === null || totalCheckout === null) {
      throw new Error('Invalid exchange rate for the selected checkout currency.');
    }

    const orderId = await allocateOrderDisplayId(supabase);
    const publicTrackingToken = generatePublicTrackingToken();
    const publicTrackingTokenHash = hashPublicTrackingToken(publicTrackingToken);
    const customerAccessToken = randomBytes(32).toString('base64url');
    const customerAccessTokenHash = hashCustomerAccessToken(customerAccessToken);
    const trackingPath = resolvedComercioSlug
      ? `${publicSiteUrl}/v/${encodeURIComponent(resolvedComercioSlug)}/orders/${encodeURIComponent(orderId)}`
      : `${publicSiteUrl}/orders/${encodeURIComponent(orderId)}`;
    const trackingUrl = `${trackingPath}?t=${encodeURIComponent(publicTrackingToken)}`;

    const detalles = {
      management_mode: resolveCommerceManagementMode(comercioRow),
      order_id: orderId,
      tracking_url: trackingUrl,
      public_tracking_token_hash: publicTrackingTokenHash,
      customer_access_token_hash: customerAccessTokenHash,
      cliente_nombre: clientName,
      cliente_email: clientEmail || null,
      telefono_cliente: clientWhatsapp,
      moneda_base: baseCurrency,
      moneda_checkout: currency,
      tasa_cambio_snapshot: exchangeRate,
      exchange_rate_source: normalizeText(incomingDetalles.exchange_rate_source) || null,
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
      ...(delivery.mode === 'delivery'
        ? {
            delivery_estimate_minutes:
              deliveryConfig.estimatedTimes.preparationMinutes +
              deliveryConfig.estimatedTimes.deliveryMinutes,
          }
        : {}),
      items: storedItems,
      total,
      total_moneda_checkout: totalCheckout,
      customer_rating_summary: customerRatingSummary.customer,
      ...(deliveryQuote.applied
        ? {
            delivery_fee: deliveryQuote.fee,
            delivery_method: deliveryQuote.method,
            delivery_tariff_currency: tariffCurrency,
            delivery_config_snapshot: deliveryQuote.snapshot,
          }
        : {}),
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
      public_tracking_token_hash: publicTrackingTokenHash,
    };

    let insertedOrder: Record<string, unknown> | null = null;

    const insertResult = await supabase.from('pedidos').insert(payload).select('*').maybeSingle();
    const insertError = insertResult.error;

    if (insertError) {
      const missingTrackingColumn =
        (insertError.message ?? '').toLowerCase().includes('public_tracking_token_hash');
      const missingDeliveryColumn =
        (insertError.message ?? '').toLowerCase().includes('costo_delivery');
      if (!missingTrackingColumn && !missingDeliveryColumn) {
        throw new Error(insertError.message ?? 'Failed to create order.');
      }

      const legacyPayload = { ...payload } as Record<string, unknown>;
      if (missingTrackingColumn) delete legacyPayload.public_tracking_token_hash;
      if (missingDeliveryColumn) delete legacyPayload.costo_delivery;
      const retry = await supabase.from('pedidos').insert(legacyPayload).select('*').maybeSingle();
      if (retry.error) {
        throw new Error(retry.error.message ?? 'Failed to create order.');
      }
      insertedOrder = (retry.data ?? null) as Record<string, unknown> | null;
    } else {
      insertedOrder = (insertResult.data ?? null) as Record<string, unknown> | null;
    }

    if (!insertedOrder) {
      throw new Error('Failed to create order.');
    }

    let publicOrderUrl = trackingUrl;
    let publicShortCode = '';
    try {
      const shortLink = await createOrderShortLink({
        supabase,
        pedidoId: (insertedOrder.id ?? '').toString().trim(),
        orderId,
        comercioId: resolvedComercioId,
        trackingTokenHash: publicTrackingTokenHash,
      });
      publicShortCode = shortLink.code;
      publicOrderUrl = `${publicSiteUrl}/o/${encodeURIComponent(shortLink.code)}`;
      const shortLinkDetalles = {
        ...detalles,
        tracking_url: publicOrderUrl,
      };
      await supabase
        .from('pedidos')
        .update({ detalles: shortLinkDetalles })
        .eq('id', insertedOrder.id);
    } catch (error) {
      console.error('[orders] short link creation failed; using long tracking URL', {
        orderId,
        message: error instanceof Error ? error.message : 'unknown',
      });
    }

    let emailStatus: 'queued' | 'skipped' = 'skipped';
    const whatsappStatus = 'client_link' as const;

    if (clientEmail && canSendOrderEmail()) {
      emailStatus = 'queued';
      void sendOrderEmail({
        clientEmail,
        comercioNombre,
        orderId,
        orderTrackingUrl: publicOrderUrl,
        comercioSlug: resolvedComercioSlug,
      }).catch(() => {
        // Keep response fast; email failures are handled asynchronously.
      });
    }

    const appSiteUrl = (process.env.NEXT_PUBLIC_APP_SITE_URL ?? 'https://app.elmenuxfa.com').replace(/\/$/, '');
    const appOrderUrl = publicShortCode
      ? `${appSiteUrl}/orders/view/${encodeURIComponent(orderId)}?shortCode=${encodeURIComponent(publicShortCode)}`
      : `${appSiteUrl}/orders/view/${encodeURIComponent(orderId)}?fallback=${encodeURIComponent(publicOrderUrl)}`;
    const merchantWhatsappText = optionalMerchantComanda(comercioRow, {
      orderId,
      appOrderUrl,
      customerName: clientName,
      customerWhatsapp: clientWhatsapp,
      paymentProofUrl: publicShortCode
        ? `${publicSiteUrl}/p/${encodeURIComponent(publicShortCode)}`
        : undefined,
      details: detalles,
    });

    const responseBody = {
      ok: true as const,
      data: {
        orderId,
        comercioId: resolvedComercioId,
        estado: 'pendiente' as const,
        managementMode: detalles.management_mode,
        confirmation: 'Pedido confirmado' as const,
        subtotal,
        costoDelivery: Number.isFinite(costoDelivery) ? Math.max(costoDelivery, 0) : 0,
        total,
        ...(storedItems.some((item) => item.personalizacion) ? { customizationTotalCheckout: totalCheckout } : {}),
        trackingUrl: publicOrderUrl,
        ...(merchantWhatsappText ? { merchantWhatsappText } : {}),
        emailStatus,
        whatsappStatus,
      },
    };

    if (idempotencyKey) {
      await storeOrderIdempotency({
        key: idempotencyKey,
        requestHash,
        orderId,
        response: responseBody,
      });
    }

    supabaseWriteCircuit.recordSuccess();
      const response = NextResponse.json(responseBody, { status: 201 });
      if (publicShortCode) {
        response.cookies.set({
          name: `elmenuxfa_order_${publicShortCode}`,
          value: customerAccessToken,
          httpOnly: true,
          secure: true,
          sameSite: 'lax',
          path: '/',
          maxAge: 60 * 60 * 24 * 90,
        });
      }
      return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create order.';
    if (isTransientSupabaseFailure(error)) {
      supabaseWriteCircuit.recordFailure();
      return NextResponse.json(
        {
          ok: false,
          error: 'service_unavailable',
          message: 'Estamos actualizando el sistema. Intenta el pedido de nuevo en unos segundos.',
        },
        { status: 503, headers: { 'Retry-After': '30' } },
      );
    }
    if (message.includes('Missing environment variable: SUPABASE_SERVICE_ROLE_KEY')) {
      console.error('[orders] privileged supabase client unavailable');
      return NextResponse.json({ ok: false, error: 'unavailable' }, { status: 503 });
    }
    console.error('[orders] create failed', message);
    return NextResponse.json(
      {
        ok: false,
        error: 'order_create_failed',
        message: 'No se pudo guardar el pedido. Intenta de nuevo.',
      },
      { status: 500 },
    );
  }
}
