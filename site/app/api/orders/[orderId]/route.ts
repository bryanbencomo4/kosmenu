import { NextResponse } from 'next/server';

import {
  assertCustomerStatusTransition,
  customerOrderActionSchema,
  isPedidoEstadoEnumError,
} from '../../_lib/order-customer-actions';
import { extractComercioId } from '../../_lib/order-utils';
import { verifyPublicTrackingToken } from '../../_lib/order-tracking-token';
import {
  CONFIRM_RECEIVED_ALLOWED_STATUSES,
  CONFIRMATION_TIMEOUT_MS,
  extractTokenHashFromPedido,
  normalizePublicStatus,
  toPublicOrderTrackingResponse,
} from '../../_lib/public-order';
import { consumeRateLimit, getClientIp } from '../../_lib/rate-limit';
import { getServiceSupabaseClient } from '../../_lib/supabase-server';

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
};

type ComercioSummary = {
  nombre?: string | null;
  slug?: string | null;
  direccion?: string | null;
  latitud?: number | string | null;
  longitud?: number | string | null;
  whatsapp?: string | null;
  telefono?: string | null;
  branding_ia?: Record<string, unknown> | null;
};

const GENERIC_DENIED = { error: 'Pedido no disponible.' } as const;

function extractTrackingToken(request: Request): string {
  const url = new URL(request.url);
  const fromQuery = (url.searchParams.get('t') ?? url.searchParams.get('token') ?? '').trim();
  if (fromQuery) return fromQuery;

  const header = (request.headers.get('x-order-tracking-token') ?? '').trim();
  if (header) return header;

  return '';
}

function denyUnauthorized() {
  // 404 avoids confirming orderId existence without a valid token.
  return NextResponse.json(GENERIC_DENIED, { status: 404 });
}

async function findOrderByOrderId(
  supabase: ReturnType<typeof getServiceSupabaseClient>,
  orderId: string,
) {
  const derivedComercioId = extractComercioId(orderId);

  let query = supabase
    .from('pedidos')
    .select(
      'id,comercio_id,estado,created_at,total,costo_delivery,public_tracking_token_hash,detalles',
    )
    .order('created_at', { ascending: false })
    .limit(200);

  if (derivedComercioId) {
    query = query.eq('comercio_id', derivedComercioId);
  }

  const { data: rows, error } = await query;
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
    .select('nombre,slug,direccion,whatsapp,telefono,branding_ia')
    .eq('id', comercioId)
    .maybeSingle();
  if (result.error) return null;
  return (result.data as ComercioSummary | null) ?? null;
}

function authorizeOrder(order: PedidoRow | null, token: string): order is PedidoRow {
  if (!order || !token) return false;
  const expectedHash = extractTokenHashFromPedido(order);
  if (!expectedHash) return false;
  return verifyPublicTrackingToken(token, expectedHash);
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
    const token = extractTrackingToken(request);

    if (!orderId || !token) {
      return denyUnauthorized();
    }

    const supabase = getServiceSupabaseClient();
    const order = await findOrderByOrderId(supabase, orderId);

    if (!authorizeOrder(order, token)) {
      return denyUnauthorized();
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
    const token = extractTrackingToken(request);

    if (!orderId || !token) {
      return denyUnauthorized();
    }

    const body = await request.json().catch(() => null);
    const parsed = customerOrderActionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
    }

    const supabase = getServiceSupabaseClient();
    const order = await findOrderByOrderId(supabase, orderId);

    if (!authorizeOrder(order, token)) {
      return denyUnauthorized();
    }

    const action = parsed.data;

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

    const createdAtMs = Date.parse((order.created_at ?? '').toString());
    const pendingExpired =
      currentStatus === 'pendiente' &&
      Number.isFinite(createdAtMs) &&
      Date.now() - createdAtMs >= CONFIRMATION_TIMEOUT_MS;

    if (source === 'cliente') {
      if (currentStatus !== 'pendiente') {
        return NextResponse.json(
          { error: 'El cliente no puede cancelar este pedido en el estado actual.' },
          { status: 409 },
        );
      }

      if (!pendingExpired) {
        return NextResponse.json(
          { error: 'El cliente solo puede cancelar cuando se agota el tiempo de confirmacion (15 min).' },
          { status: 409 },
        );
      }
    }

    if (source === 'timeout' && !pendingExpired) {
      return NextResponse.json(
        { error: 'El tiempo de confirmacion de 15 minutos aun no ha vencido.' },
        { status: 409 },
      );
    }

    const reason = source === 'timeout' ? 'timeout_no_confirmacion' : 'cancelado_por_cliente';
    const nextDetalles = {
      ...(order.detalles ?? {}),
      cancellation: {
        source,
        reason,
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

    const updated = (attempt.data as PedidoRow | null) ?? {
      ...order,
      estado: 'cancelado',
      detalles: nextDetalles,
    };
    const comercio = await loadComercio(supabase, updated.comercio_id);
    return NextResponse.json(
      { ok: true, data: toPublicOrderTrackingResponse(updated, orderId, comercio) },
      { status: 200 },
    );
  } catch {
    return NextResponse.json({ error: 'Failed to update order.' }, { status: 500 });
  }
}
