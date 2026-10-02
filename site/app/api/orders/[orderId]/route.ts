import { NextResponse } from 'next/server';

import {
  assertCustomerStatusTransition,
  customerOrderActionSchema,
  isPedidoEstadoEnumError,
} from '../../_lib/order-customer-actions';
import { extractComercioId } from '../../_lib/order-utils';
import { hashPublicTrackingToken } from '../../_lib/order-tracking-token';
import {
  CONFIRM_RECEIVED_ALLOWED_STATUSES,
  normalizePublicStatus,
  toPublicOrderTrackingResponse,
} from '../../_lib/public-order';
import {
  dispatchOrderNotification,
  merchantWhatsappDelivered,
} from '../../_lib/dispatch-order-notification';
import { consumeRateLimit, getClientIp } from '../../_lib/rate-limit';
import { getServiceSupabaseClient } from '../../_lib/supabase-server';
import {
  createCustomerRatingKey,
  isRateableOrderStatus,
} from '../../_lib/order-service-rating';
import { findOrderShortLink } from '../../_lib/order-short-links';

type Params = {
  params: Promise<{ orderId: string }>;
};

type PedidoRow = {
  id: string;
  comercio_id?: string | null;
  estado?: string | null;
  created_at?: string | null;
  total?: number | null;
  costo_delivery?: number | null;
  public_tracking_token_hash?: string | null;
  detalles?: {
    order_id?: string | null;
    public_tracking_token_hash?: string | null;
    notifications?: Record<string, unknown> | null;
    delivery_delegate?: Record<string, unknown> | null;
    cancellation?: Record<string, unknown> | null;
    [key: string]: unknown;
  } | null;
  cliente_email?: string | null;
};

type ComercioSummary = {
  nombre?: string | null;
  slug?: string | null;
  moneda?: string | null;
  direccion?: string | null;
  latitud?: number | string | null;
  longitud?: number | string | null;
  whatsapp?: string | null;
  telefonos?: unknown;
  logo_url?: string | null;
  branding_ia?: Record<string, unknown> | null;
};

const GENERIC_DENIED = { error: 'Pedido no disponible.' } as const;

function extractShortCode(request: Request): string {
  return (new URL(request.url).searchParams.get('s') ?? '').trim();
}

function extractCustomerEmail(request: Request) {
  return (request.headers.get('x-order-customer-email') ?? '').trim().toLowerCase();
}

function denyUnauthorized() {
  // 404 avoids confirming orderId existence without a valid token.
  return NextResponse.json(GENERIC_DENIED, { status: 404 });
}

async function findOrderByOrderId(
  supabase: ReturnType<typeof getServiceSupabaseClient>,
  orderId: string,
) {
  const select =
    'id,comercio_id,estado,created_at,total,costo_delivery,public_tracking_token_hash,detalles';

  const { data: directMatch, error: directError } = await supabase
    .from('pedidos')
    .select(select)
    .eq('detalles->>order_id', orderId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (directError) {
    throw new Error(directError.message);
  }

  if (directMatch) {
    return directMatch as PedidoRow;
  }

  const derivedComercioId = extractComercioId(orderId);
  if (!derivedComercioId) {
    return null;
  }

  const { data: rows, error } = await supabase
    .from('pedidos')
    .select(select)
    .eq('comercio_id', derivedComercioId)
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) {
    throw new Error(error.message);
  }

  return ((rows ?? []) as PedidoRow[]).find((row) => row?.detalles?.order_id === orderId) ?? null;
}

async function loadComercio(
  supabase: ReturnType<typeof getServiceSupabaseClient>,
  comercioId: string | null | undefined,
): Promise<ComercioSummary | null> {
  if (!comercioId) return null;
  const result = await supabase
    .from('comercios')
    .select('nombre,slug,moneda,direccion,whatsapp,telefonos,logo_url,branding_ia')
    .eq('id', comercioId)
    .maybeSingle();
  if (result.error) return null;
  return (result.data as ComercioSummary | null) ?? null;
}

function authorizeCustomer(
  request: Request,
  order: PedidoRow | null,
  shortCode: string,
) {
  if (!order) return false;
  const detalles = order.detalles ?? {};
  const accessHash = (detalles.customer_access_token_hash ?? '').toString().trim();
  const cookieToken = shortCode
    ? request.headers.get('cookie')?.match(
        new RegExp(`(?:^|;\\s*)elmenuxfa_order_${shortCode}=([^;]+)`),
      )?.[1] ?? ''
    : '';
  if (accessHash && cookieToken && hashPublicTrackingToken(cookieToken) === accessHash) {
    return true;
  }

  const email = extractCustomerEmail(request);
  const orderEmail = (
    order.cliente_email ?? detalles.cliente_email ?? ''
  ).toString().trim().toLowerCase();
  return Boolean(email && orderEmail && email === orderEmail);
}

export async function GET(request: Request, { params }: Params) {
  try {
    const ip = getClientIp(request);
    const limit = consumeRateLimit(`orders:get:${ip}`, 60, 60_000);
    if (limit.ok === false) {
      return NextResponse.json(
        { error: 'Too many requests.' },
        { status: 429, headers: { 'Retry-After': String(limit.retryAfterSec) } },
      );
    }

    const { orderId: rawOrderId } = await params;
    const orderId = decodeURIComponent(rawOrderId ?? '').trim();
    const shortCode = extractShortCode(request);

    if (!orderId || !shortCode && !new URL(request.url).searchParams.has('t')) {
      return denyUnauthorized();
    }

    const supabase = getServiceSupabaseClient();
    const order = await findOrderByOrderId(supabase, orderId);

    const shortLink = shortCode ? await findOrderShortLink(supabase, shortCode) : null;
    if (shortCode && (!shortLink || shortLink.order_id !== orderId)) {
      return denyUnauthorized();
    }
    if (!authorizeCustomer(request, order, shortCode)) {
      return NextResponse.json(
        { error: 'customer_verification_required' },
        { status: 401, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const comercio = await loadComercio(supabase, order.comercio_id);
    const publicOrder = toPublicOrderTrackingResponse(order, orderId, comercio);

    return NextResponse.json({ ok: true, data: publicOrder }, { status: 200 });
  } catch {
    return NextResponse.json({ error: 'Failed to load order.' }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const ip = getClientIp(request);
    const limit = consumeRateLimit(`orders:patch:${ip}`, 30, 60_000);
    if (limit.ok === false) {
      return NextResponse.json(
        { error: 'Too many requests.' },
        { status: 429, headers: { 'Retry-After': String(limit.retryAfterSec) } },
      );
    }

    const { orderId: rawOrderId } = await params;
    const orderId = decodeURIComponent(rawOrderId ?? '').trim();
    const shortCode = extractShortCode(request);

    if (!orderId || !shortCode && !new URL(request.url).searchParams.has('t')) {
      return denyUnauthorized();
    }

    const body = await request.json().catch(() => null);
    const parsed = customerOrderActionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
    }

    const supabase = getServiceSupabaseClient();
    const order = await findOrderByOrderId(supabase, orderId);

    const shortLink = shortCode ? await findOrderShortLink(supabase, shortCode) : null;
    if (shortCode && (!shortLink || shortLink.order_id !== orderId)) {
      return denyUnauthorized();
    }
    if (!authorizeCustomer(request, order, shortCode)) {
      return NextResponse.json(
        { error: 'customer_verification_required' },
        { status: 401, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const action = parsed.data;

    if (action.action === 'submit_rating') {
      const deliveryDelegate = order.detalles?.delivery_delegate;
      const deliveryStatus =
        deliveryDelegate && typeof deliveryDelegate === 'object'
          ? deliveryDelegate.status
          : null;
      if (!isRateableOrderStatus(order.estado, deliveryStatus)) {
        return NextResponse.json(
          { error: 'Solo puedes calificar cuando el pedido termina o se cancela.' },
          { status: 409 },
        );
      }

      const customerKey = await createCustomerRatingKey(order.detalles?.telefono_cliente);
      if (!customerKey) {
        return NextResponse.json({ error: 'No se pudo validar el perfil del cliente.' }, { status: 503 });
      }

      const { error } = await supabase.rpc('submit_order_service_rating', {
        p_pedido_id: order.id,
        p_rater_side: 'customer',
        p_rating: action.rating,
        p_customer_key: customerKey,
      });
      if (error) {
        if ((error as { code?: string }).code === '23505') {
          return NextResponse.json({ error: 'Ya calificaste este pedido.' }, { status: 409 });
        }
        if (error.message?.includes('ORDER_NOT_RATEABLE')) {
          return NextResponse.json({ error: 'El pedido ya no está disponible para calificar.' }, { status: 409 });
        }
        throw new Error(error.message);
      }

      const nextOrder = {
        ...order,
        detalles: {
          ...(order.detalles ?? {}),
          customer_service_rating: action.rating,
        },
      };
      const comercio = await loadComercio(supabase, order.comercio_id);
      return NextResponse.json(
        {
          ok: true,
          rating: action.rating,
          data: toPublicOrderTrackingResponse(nextOrder, orderId, comercio),
        },
        { status: 200 },
      );
    }

    if (action.action === 'set_whatsapp_notifications') {
      const currentDetalles =
        order.detalles && typeof order.detalles === 'object'
          ? { ...(order.detalles as Record<string, unknown>) }
          : {};
      const currentNotifications =
        currentDetalles.notifications && typeof currentDetalles.notifications === 'object'
          ? { ...(currentDetalles.notifications as Record<string, unknown>) }
          : {};

      const nextDetalles = {
        ...currentDetalles,
        notifications: {
          ...currentNotifications,
          whatsapp_enabled: action.enabled,
          updated_at: new Date().toISOString(),
        },
      };

      const attempt = await supabase
        .from('pedidos')
        .update({ detalles: nextDetalles })
        .eq('id', order.id)
        .select('id,comercio_id,estado,created_at,total,costo_delivery,public_tracking_token_hash,detalles')
        .maybeSingle();

      if (attempt.error) {
        throw new Error(attempt.error.message);
      }

      const updated = (attempt.data as PedidoRow | null) ?? order;
      const comercio = await loadComercio(supabase, updated.comercio_id);
      return NextResponse.json(
        { ok: true, data: toPublicOrderTrackingResponse(updated, orderId, comercio) },
        { status: 200 },
      );
    }

    if (action.action === 'confirm_received') {
      const currentStatus = normalizePublicStatus(order.estado);
      if (currentStatus === 'cancelado') {
        return NextResponse.json(
          { error: 'Este pedido esta cancelado y no puede confirmarse.' },
          { status: 409 },
        );
      }

      if (currentStatus === 'entregado') {
        const comercio = await loadComercio(supabase, order.comercio_id);
        return NextResponse.json(
          {
            ok: true,
            data: toPublicOrderTrackingResponse(order, orderId, comercio),
            alreadyDelivered: true,
          },
          { status: 200 },
        );
      }

      // Customer confirmation is a narrow handoff: must be en_camino + driver arrived.
      // Does not replace merchant or delivery controls for earlier statuses.
      if (!CONFIRM_RECEIVED_ALLOWED_STATUSES.has(currentStatus)) {
        return NextResponse.json(
          { error: 'La confirmacion del cliente no esta disponible en este estado.' },
          { status: 409 },
        );
      }

      const detalles =
        order.detalles && typeof order.detalles === 'object'
          ? { ...(order.detalles as Record<string, unknown>) }
          : {};
      const delivery =
        detalles.delivery && typeof detalles.delivery === 'object'
          ? (detalles.delivery as Record<string, unknown>)
          : {};
      if (delivery.mode !== 'delivery') {
        return NextResponse.json(
          { error: 'La confirmacion de entrega solo aplica a pedidos delivery.' },
          { status: 409 },
        );
      }

      const delegate =
        detalles.delivery_delegate && typeof detalles.delivery_delegate === 'object'
          ? { ...(detalles.delivery_delegate as Record<string, unknown>) }
          : {};

      const delegateStatus = (delegate.status ?? '').toString().trim().toLowerCase();
      if (delegateStatus !== 'arrived') {
        return NextResponse.json(
          {
            error:
              'La confirmacion del cliente solo esta disponible cuando el repartidor reporta llegada.',
          },
          { status: 409 },
        );
      }

      const nowIso = new Date().toISOString();
      const invitationId = (delegate.invitation_id ?? '').toString().trim();

      // Allowlist-only mutation: status + audit metadata. No totals/items/contact changes.
      const nextDetalles = {
        ...detalles,
        delivery_delegate: {
          ...delegate,
          status: 'completed',
          completed_at: nowIso,
          customer_confirmed_at: nowIso,
          updated_at: nowIso,
        },
        delivery_confirmation: {
          source: 'cliente',
          confirmed_at: nowIso,
          from_status: currentStatus,
          actor: 'customer_tracking_token',
        },
      };

      const attempt = await supabase
        .from('pedidos')
        .update({
          estado: 'entregado',
          detalles: nextDetalles,
        })
        .eq('id', order.id)
        .eq('estado', 'en_camino')
        .select('id,comercio_id,estado,created_at,total,costo_delivery,public_tracking_token_hash,detalles')
        .maybeSingle();

      if (attempt.error) {
        throw new Error(attempt.error.message);
      }

      if (!attempt.data) {
        return NextResponse.json(
          { error: 'No se pudo confirmar: el estado del pedido cambio.' },
          { status: 409 },
        );
      }

      if (invitationId) {
        const invitationUpdate = await supabase
          .from('delivery_invitations')
          .update({
            status: 'completed',
            completed_at: nowIso,
            last_seen_at: nowIso,
          })
          .eq('id', invitationId)
          .in('status', ['accepted', 'arrived', 'completed']);

        if (invitationUpdate.error) {
          throw new Error(invitationUpdate.error.message);
        }

        await supabase.rpc('log_delivery_invitation_event', {
          p_invitation_id: invitationId,
          p_pedido_id: order.id,
          p_order_id: orderId,
          p_event_type: 'customer_confirmed_received',
          p_actor: 'customer_tracking_token',
          p_payload: {
            confirmed_at: nowIso,
            from_status: currentStatus,
          },
        });
      }

      const updated = attempt.data as PedidoRow;
      void dispatchOrderNotification({
        type: 'UPDATE',
        record: updated as Record<string, unknown>,
        old_record: { ...order, estado: currentStatus },
      }).catch(() => undefined);

      const comercio = await loadComercio(supabase, updated.comercio_id);
      return NextResponse.json(
        { ok: true, data: toPublicOrderTrackingResponse(updated, orderId, comercio) },
        { status: 200 },
      );
    }

    // cancel
    const source = action.source;
    const currentStatus = normalizePublicStatus(order.estado);
    if (currentStatus === 'cancelado') {
      const comercio = await loadComercio(supabase, order.comercio_id);
      return NextResponse.json(
        {
          ok: true,
          data: toPublicOrderTrackingResponse(order, orderId, comercio),
          alreadyCancelled: true,
        },
        { status: 200 },
      );
    }

    if (currentStatus === 'entregado') {
      return NextResponse.json(
        { error: 'El pedido ya fue entregado y no puede cancelarse.' },
        { status: 409 },
      );
    }

    const transition = assertCustomerStatusTransition(currentStatus, 'cancelado');
    if (transition.ok === false) {
      return NextResponse.json({ error: transition.error }, { status: 409 });
    }

    if (source === 'cliente') {
      if (currentStatus !== 'pendiente') {
        return NextResponse.json(
          { error: 'El cliente no puede cancelar este pedido en el estado actual.' },
          { status: 409 },
        );
      }
    }

    const nextDetalles = {
      ...(order.detalles ?? {}),
      cancellation: {
        source,
        reason: 'cancelado_por_cliente',
        customerReason: action.reason,
        at: new Date().toISOString(),
      },
    };

    const attempt = await supabase
      .from('pedidos')
      .update({
        estado: 'cancelado',
        detalles: nextDetalles,
      })
      .eq('id', order.id)
      .eq('estado', 'pendiente')
      .select('id,comercio_id,estado,created_at,total,costo_delivery,public_tracking_token_hash,detalles')
      .maybeSingle();

    if (attempt.error && isPedidoEstadoEnumError(attempt.error.message)) {
      return NextResponse.json(
        {
          error:
            'El estado cancelado aun no esta habilitado en la base de datos. Ejecuta la migracion que agrega el valor cancelado a public.pedido_estado.',
        },
        { status: 500 },
      );
    }

    if (attempt.error) {
      throw new Error(attempt.error.message);
    }

    const updated = attempt.data as PedidoRow | null;
    if (!updated) {
      return NextResponse.json(
        { error: 'El comercio ya aceptó o actualizó el pedido. No se pudo cancelar.' },
        { status: 409 },
      );
    }
    const notificationResult = await dispatchOrderNotification({
      type: 'UPDATE',
      record: updated as Record<string, unknown>,
      old_record: { ...order, estado: currentStatus },
    });
    const merchantNotified = merchantWhatsappDelivered(notificationResult);

    const comercio = await loadComercio(supabase, updated.comercio_id);
    return NextResponse.json(
      {
        ok: true,
        data: toPublicOrderTrackingResponse(updated, orderId, comercio),
        merchantNotified,
      },
      { status: 200 },
    );
  } catch {
    return NextResponse.json({ error: 'Failed to update order.' }, { status: 500 });
  }
}
