import { NextResponse } from 'next/server';

import {
  calculateTotal,
  createOrderId,
  normalizeOrderItems,
} from '../_lib/order-utils';
import { canSendOrderEmail, sendOrderEmail } from '../_lib/send-order-email';
import { getServerSupabaseClient } from '../_lib/supabase-server';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: string) {
  return UUID_PATTERN.test(value);
}

type CreateOrderPayload = {
  comercioId?: string;
  clientEmail?: string;
  comercioNombre?: string;
  items?: unknown;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as CreateOrderPayload;

    const comercioId = decodeURIComponent(body.comercioId ?? '').trim();
    const clientEmail = (body.clientEmail ?? '').trim().toLowerCase();
    const comercioNombre = (body.comercioNombre ?? 'Kosmenu').trim() || 'Kosmenu';

    if (!comercioId) {
      return NextResponse.json({ error: 'Invalid comercioId.' }, { status: 400 });
    }

    const items = normalizeOrderItems(body.items);
    if (items.length === 0) {
      return NextResponse.json({ error: 'Order items are required.' }, { status: 400 });
    }

    const total = calculateTotal(items);
    const supabase = getServerSupabaseClient();

    const comercioQuery = supabase
      .from('comercios')
      .select('id')
      .limit(1);
    const { data: comercios, error: comercioError } = isUuid(comercioId)
      ? await comercioQuery.eq('id', comercioId)
      : await comercioQuery.eq('slug', comercioId);

    if (comercioError) {
      throw new Error(comercioError.message);
    }

    const resolvedComercioId = (comercios ?? [])[0]?.id?.toString().trim() ?? '';
    if (!resolvedComercioId) {
      return NextResponse.json({ error: 'Comercio not found.' }, { status: 404 });
    }

    const orderId = createOrderId(resolvedComercioId);

    const detalles = {
      order_id: orderId,
      cliente_email: clientEmail,
      items,
      total,
    };

    const payload = {
      comercio_id: resolvedComercioId,
      estado: 'pendiente',
      total,
      detalles,
      cliente_email: clientEmail,
    };

    let insertError: any = null;
    const insertResult = await supabase.from('pedidos').insert(payload);
    insertError = insertResult.error;

    if (insertError?.message?.toLowerCase().includes('cliente_email')) {
      const fallbackResult = await supabase.from('pedidos').insert({
        comercio_id: resolvedComercioId,
        estado: 'pendiente',
        total,
        detalles,
      });
      insertError = fallbackResult.error;
    }

    if (insertError) {
      throw new Error(insertError.message ?? 'Failed to create order.');
    }

    const trackingUrl = `https://kosmenu.vercel.app/orders/${encodeURIComponent(orderId)}`;
    let emailStatus: 'sent' | 'skipped' | 'failed' = 'skipped';

    if (clientEmail && canSendOrderEmail()) {
      try {
        await sendOrderEmail({
          clientEmail,
          comercioNombre,
          orderId,
          orderTrackingUrl: trackingUrl,
        });
        emailStatus = 'sent';
      } catch {
        emailStatus = 'failed';
      }
    }

    return NextResponse.json(
      {
        ok: true,
        data: {
          orderId,
          comercioId: resolvedComercioId,
          total,
          trackingUrl,
          emailStatus,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create order.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
