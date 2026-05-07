import { NextResponse } from 'next/server';

import { extractComercioId } from '../../_lib/order-utils';
import { getServerSupabaseClient } from '../../_lib/supabase-server';

type Params = {
  params: Promise<{ orderId: string }>;
};

type PedidoRow = {
  id: string;
  comercio_id?: string | null;
  estado?: string | null;
  created_at?: string | null;
  detalles?: {
    order_id?: string | null;
    notifications?: Record<string, unknown> | null;
    delivery_delegate?: Record<string, unknown> | null;
    cancellation?: Record<string, unknown> | null;
    [key: string]: unknown;
  } | null;
};

type ComercioSummary = {
  id?: string | null;
  nombre?: string | null;
  direccion?: string | null;
  latitud?: number | string | null;
  longitud?: number | string | null;
  whatsapp?: string | null;
  telefono?: string | null;
  telefonos?: string | null;
  celular?: string | null;
};

const CONFIRMATION_TIMEOUT_MS = 15 * 60 * 1000;

function normalizeStatus(value: unknown) {
  const raw = (value ?? '').toString().trim().toLowerCase();
  if (!raw) return 'pendiente';
  if (raw === 'cancelado' || raw === 'rechazado' || raw === 'anulado') return 'cancelado';
  if (raw === 'confirmado' || raw === 'preparando' || raw === 'en_camino' || raw === 'entregado') return raw;
  return 'pendiente';
}

function isPedidoEstadoEnumError(message: string) {
  const normalized = (message ?? '').toLowerCase();
  return normalized.includes('invalid input value for enum') && normalized.includes('pedido_estado');
}

async function findOrderByOrderId(supabase: ReturnType<typeof getServerSupabaseClient>, orderId: string) {
  const derivedComercioId = extractComercioId(orderId);

  let query = supabase
    .from('pedidos')
    .select('*')
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

export async function GET(_: Request, { params }: Params) {
  try {
    const { orderId: rawOrderId } = await params;
    const orderId = decodeURIComponent(rawOrderId ?? '').trim();

    if (!orderId) {
      return NextResponse.json({ error: 'Invalid orderId.' }, { status: 400 });
    }

    const supabase = getServerSupabaseClient();
    const order = await findOrderByOrderId(supabase, orderId);

    if (!order) {
      return NextResponse.json({ ok: true, data: null }, { status: 200 });
    }

    let comercio: ComercioSummary | null = null;
    if (order.comercio_id) {
      const comercioResult = await supabase
        .from('comercios')
        .select('id,nombre,direccion,latitud,longitud,whatsapp,telefono,telefonos,celular')
        .eq('id', order.comercio_id)
        .maybeSingle();

      if (!comercioResult.error) {
        comercio = comercioResult.data ?? null;
      }
    }

    return NextResponse.json(
      {
        ok: true,
        data: {
          order,
          comercio,
        },
      },
      { status: 200 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load order.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { orderId: rawOrderId } = await params;
    const orderId = decodeURIComponent(rawOrderId ?? '').trim();
    if (!orderId) {
      return NextResponse.json({ error: 'Invalid orderId.' }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const action = (body?.action ?? '').toString().trim().toLowerCase();

    if (
      action !== 'cancel' &&
      action !== 'set_whatsapp_notifications' &&
      action !== 'confirm_received'
    ) {
      return NextResponse.json({ error: 'Unsupported action.' }, { status: 400 });
    }

    const supabase = getServerSupabaseClient();
    const order = await findOrderByOrderId(supabase, orderId);

    if (!order) {
      return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
    }

    if (action === 'set_whatsapp_notifications') {
      const enabled = body?.enabled;
      if (typeof enabled !== 'boolean') {
        return NextResponse.json(
          { error: 'Invalid enabled value for whatsapp notifications.' },
          { status: 400 },
        );
      }

      const currentDetalles =
        order?.detalles && typeof order.detalles === 'object'
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
          whatsapp_enabled: enabled,
          updated_at: new Date().toISOString(),
        },
      };

      const attempt = await supabase
        .from('pedidos')
        .update({
          detalles: nextDetalles,
        })
        .eq('id', order.id)
        .select('*')
        .maybeSingle();

      if (attempt.error) {
        throw new Error(attempt.error.message);
      }

      return NextResponse.json(
        {
          ok: true,
          data: {
            order: attempt.data ?? order,
          },
        },
        { status: 200 },
      );
    }

    if (action === 'confirm_received') {
      const currentStatus = normalizeStatus(order?.estado);
      if (currentStatus === 'cancelado') {
        return NextResponse.json(
          { error: 'Este pedido esta cancelado y no puede confirmarse.' },
          { status: 409 },
        );
      }

      if (currentStatus === 'entregado') {
        return NextResponse.json(
          { ok: true, data: { order, alreadyDelivered: true } },
          { status: 200 },
        );
      }

      const detalles =
        order?.detalles && typeof order.detalles === 'object'
          ? { ...(order.detalles as Record<string, unknown>) }
          : {};
      const delegate =
        detalles.delivery_delegate && typeof detalles.delivery_delegate === 'object'
          ? { ...(detalles.delivery_delegate as Record<string, unknown>) }
          : {};

      const delegateStatus = (delegate.status ?? '').toString().trim().toLowerCase();
      if (delegateStatus !== 'arrived' && delegateStatus !== 'completed') {
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
        },
      };

      const attempt = await supabase
        .from('pedidos')
        .update({
          estado: 'entregado',
          detalles: nextDetalles,
        })
        .eq('id', order.id)
        .neq('estado', 'cancelado')
        .select('*')
        .maybeSingle();

      if (attempt.error) {
        throw new Error(attempt.error.message);
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
          p_event_type: 'completed',
          p_actor: 'customer_confirmation',
          p_payload: { confirmed_at: nowIso },
        });
      }

      return NextResponse.json(
        {
          ok: true,
          data: {
            order: attempt.data ?? order,
          },
        },
        { status: 200 },
      );
    }

    const source = (body?.source ?? '').toString().trim().toLowerCase();

    if (source !== 'cliente' && source !== 'timeout') {
      return NextResponse.json({ error: 'Invalid cancel source.' }, { status: 400 });
    }

    const currentStatus = normalizeStatus(order?.estado);
    if (currentStatus === 'cancelado') {
      return NextResponse.json({ ok: true, data: { order, alreadyCancelled: true } }, { status: 200 });
    }

    if (currentStatus === 'entregado') {
      return NextResponse.json({ error: 'El pedido ya fue entregado y no puede cancelarse.' }, { status: 409 });
    }

    const createdAtMs = Date.parse((order?.created_at ?? '').toString());
    const pendingExpired =
      currentStatus === 'pendiente' &&
      Number.isFinite(createdAtMs) &&
      (Date.now() - createdAtMs) >= CONFIRMATION_TIMEOUT_MS;

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
      ...(order?.detalles ?? {}),
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
      .select('*')
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

    return NextResponse.json(
      {
        ok: true,
        data: {
          order: attempt.data ?? order,
        },
      },
      { status: 200 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update order.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
