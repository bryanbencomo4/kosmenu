import { NextResponse } from 'next/server';

import { extractComercioId } from '../../_lib/order-utils';
import { getServerSupabaseClient } from '../../_lib/supabase-server';

type Params = {
  params: Promise<{ orderId: string }>;
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

  return (rows ?? []).find((row: any) => row?.detalles?.order_id === orderId) ?? null;
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

    let comercio: any = null;
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
    const source = (body?.source ?? '').toString().trim().toLowerCase();

    if (action !== 'cancel') {
      return NextResponse.json({ error: 'Unsupported action.' }, { status: 400 });
    }

    if (source !== 'cliente' && source !== 'timeout') {
      return NextResponse.json({ error: 'Invalid cancel source.' }, { status: 400 });
    }

    const supabase = getServerSupabaseClient();
    const order = await findOrderByOrderId(supabase, orderId);

    if (!order) {
      return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
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
