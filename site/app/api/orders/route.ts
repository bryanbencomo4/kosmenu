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
  clientName?: string;
  clientWhatsapp?: string;
  comercioNombre?: string;
  items?: unknown;
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
  orderNotes?: string;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as CreateOrderPayload;

    const comercioId = decodeURIComponent(body.comercioId ?? '').trim();
    const clientEmail = (body.clientEmail ?? '').trim().toLowerCase();
    const clientName = (body.clientName ?? '').trim();
    const clientWhatsapp = (body.clientWhatsapp ?? '').trim();
    const comercioNombre = (body.comercioNombre ?? 'Kosmenu').trim() || 'Kosmenu';
    const costoDelivery = Number(body.costoDelivery ?? 0);
    const delivery = body.delivery ?? { mode: 'pickup' as const };
    const paymentMethod = body.paymentMethod ?? null;
    const orderNotes = (body.orderNotes ?? '').trim();

    if (!comercioId) {
      return NextResponse.json({ error: 'Invalid comercioId.' }, { status: 400 });
    }

    const items = normalizeOrderItems(body.items);
    if (items.length === 0) {
      return NextResponse.json({ error: 'Order items are required.' }, { status: 400 });
    }

    if (clientName.length < 3) {
      return NextResponse.json({ error: 'Client name is required.' }, { status: 400 });
    }

    if (clientWhatsapp.replace(/\D/g, '').length < 10) {
      return NextResponse.json({ error: 'Client WhatsApp is required.' }, { status: 400 });
    }

    const subtotal = calculateTotal(items);
    const total = subtotal + (Number.isFinite(costoDelivery) ? Math.max(costoDelivery, 0) : 0);
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
      cliente_nombre: clientName,
      cliente_email: clientEmail,
      telefono_cliente: clientWhatsapp,
      metodo_pago: paymentMethod,
      delivery,
      order_notes: orderNotes,
      subtotal,
      costo_delivery: Number.isFinite(costoDelivery) ? Math.max(costoDelivery, 0) : 0,
      items,
      total,
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
          subtotal,
          costoDelivery: Number.isFinite(costoDelivery) ? Math.max(costoDelivery, 0) : 0,
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
