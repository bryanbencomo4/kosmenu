import { NextResponse } from 'next/server';

import { dispatchOrderNotification } from '../../../../_lib/dispatch-order-notification';
import { extractComercioId } from '../../../../_lib/order-utils';
import { consumeRateLimit, getClientIp } from '../../../../_lib/rate-limit';
import { getUserFromBearerRequest } from '../../../../_lib/supabase-user-auth';
import { getServiceSupabaseClient } from '../../../../_lib/supabase-server';

type Params = {
  params: Promise<{ orderId: string }>;
};

type PedidoRow = Record<string, unknown> & {
  id: string;
  comercio_id?: string | null;
  estado?: string | null;
  detalles?: {
    order_id?: string | null;
    codigo_orden?: string | null;
    [key: string]: unknown;
  } | null;
};

const GENERIC = { error: 'No disponible.' } as const;

function deny() {
  return NextResponse.json(GENERIC, { status: 404 });
}

async function findOrderByPublicOrderId(
  supabase: ReturnType<typeof getServiceSupabaseClient>,
  orderId: string,
): Promise<PedidoRow | null> {
  const derivedComercioId = extractComercioId(orderId);
  let query = supabase
    .from('pedidos')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200);

  if (derivedComercioId) {
    query = query.eq('comercio_id', derivedComercioId);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error('ORDER_LOOKUP_FAILED');
  }

  return (
    ((data ?? []) as PedidoRow[]).find((row) => {
      const detalles = row.detalles;
      const code = (detalles?.order_id ?? detalles?.codigo_orden ?? '').toString().trim();
      return code === orderId;
    }) ?? null
  );
}

/**
 * Merchant-only: dispatch WhatsApp + push notifications after a status change.
 * Called by the Flutter app immediately after updating pedidos.estado.
 */
export async function POST(request: Request, { params }: Params) {
  try {
    const ip = getClientIp(request);
    const limit = consumeRateLimit(`order-notify:${ip}`, 60, 60_000);
    if (limit.ok === false) {
      return NextResponse.json(
        { error: 'Too many requests.' },
        { status: 429, headers: { 'Retry-After': String(limit.retryAfterSec) } },
      );
    }

    const user = await getUserFromBearerRequest(request);
    if (!user?.id) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    }

    const { orderId: rawOrderId } = await params;
    const orderId = decodeURIComponent(rawOrderId ?? '').trim();
    if (!orderId) {
      return deny();
    }

    let body: Record<string, unknown> = {};
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      body = {};
    }

    const previousStatus = (body.previousStatus ?? body.previous_status ?? '').toString().trim();

    const supabase = getServiceSupabaseClient();
    const order = await findOrderByPublicOrderId(supabase, orderId);
    if (!order?.comercio_id) {
      return deny();
    }

    const { data: comercio, error: comercioError } = await supabase
      .from('comercios')
      .select('id,owner_id')
      .eq('id', order.comercio_id)
      .maybeSingle();

    if (comercioError || !comercio?.owner_id || comercio.owner_id !== user.id) {
      return deny();
    }

    const oldRecord =
      previousStatus.length > 0
        ? {
            ...order,
            estado: previousStatus,
          }
        : null;

    const result = await dispatchOrderNotification({
      type: 'UPDATE',
      record: order,
      old_record: oldRecord,
    });

    return NextResponse.json(
      {
        ok: true,
        dispatched: result.ok,
        reason: result.reason ?? null,
      },
      {
        status: 200,
        headers: { 'Cache-Control': 'no-store' },
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message.includes('Missing environment variable')) {
      console.error('[order-notify] privileged client unavailable');
      return NextResponse.json({ error: 'Unavailable.' }, { status: 503 });
    }
    console.error('[order-notify] dispatch failed');
    return NextResponse.json({ error: 'Unavailable.' }, { status: 500 });
  }
}
