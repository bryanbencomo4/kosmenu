import { NextResponse } from 'next/server';

import {
  calculateTotal,
  createOrderId,
  normalizeOrderItems,
} from '../_lib/order-utils';
import { canSendOrderEmail, sendOrderEmail } from '../_lib/send-order-email';
import { getServerSupabaseClient } from '../_lib/supabase-server';

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
    const orderId = createOrderId(comercioId);
    const supabase = getServerSupabaseClient();

    const detalles = {
      order_id: orderId,
      cliente_email: clientEmail,
      items,
      total,
    };

    const payload = {
      comercio_id: comercioId,
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
        comercio_id: comercioId,
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
          comercioId,
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
