import { NextResponse } from 'next/server';
import { z } from 'zod';

import { createCustomerRatingKey, isRateableOrderStatus } from '../../../../_lib/order-service-rating';
import { consumeRateLimit, getClientIp } from '../../../../_lib/rate-limit';
import { getUserFromBearerRequest } from '../../../../_lib/supabase-user-auth';
import { getServiceSupabaseClient } from '../../../../_lib/supabase-server';

type Params = { params: Promise<{ orderId: string }> };

const RatingSchema = z.object({ rating: z.number().int().min(1).max(5) }).strict();

function unavailable(status: number, error: string) {
  return NextResponse.json({ error }, { status, headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request, { params }: Params) {
  try {
    const rateLimit = consumeRateLimit(`order-rating:merchant:${getClientIp(request)}`, 12, 60_000);
    if (!rateLimit.ok) {
      return unavailable(429, 'Demasiados intentos. Intenta de nuevo en un minuto.');
    }

    const user = await getUserFromBearerRequest(request);
    if (!user?.id) return unavailable(401, 'Debes iniciar sesión para calificar.');

    const parsed = RatingSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return unavailable(400, 'Selecciona una calificación de 1 a 5 estrellas.');

    const { orderId: rawOrderId } = await params;
    const orderId = decodeURIComponent(rawOrderId ?? '').trim();
    if (!orderId) return unavailable(404, 'Pedido no disponible.');

    const supabase = getServiceSupabaseClient();
    const { data: order, error: orderError } = await supabase
      .from('pedidos')
      .select('id,comercio_id,estado,telefono_cliente,detalles')
      .eq('detalles->>order_id', orderId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (orderError) throw new Error(orderError.message);
    if (!order?.comercio_id) return unavailable(404, 'Pedido no disponible.');

    const { data: commerce, error: commerceError } = await supabase
      .from('comercios')
      .select('owner_id')
      .eq('id', order.comercio_id)
      .maybeSingle();
    if (commerceError) throw new Error(commerceError.message);

    let authorized = commerce?.owner_id === user.id;
    if (!authorized) {
      const { data: membership, error: membershipError } = await supabase
        .from('comercio_members')
        .select('id')
        .eq('comercio_id', order.comercio_id)
        .eq('user_id', user.id)
        .eq('status', 'active')
        .in('role', ['administrador', 'caja', 'cocina'])
        .limit(1)
        .maybeSingle();
      if (membershipError) throw new Error(membershipError.message);
      authorized = Boolean(membership);
    }
    if (!authorized) return unavailable(404, 'Pedido no disponible.');

    const deliveryDelegate = order.detalles?.delivery_delegate;
    const deliveryStatus =
      deliveryDelegate && typeof deliveryDelegate === 'object'
        ? (deliveryDelegate as Record<string, unknown>).status
        : null;
    if (!isRateableOrderStatus(order.estado, deliveryStatus)) {
      return unavailable(409, 'Solo puedes calificar cuando el pedido termina o se cancela.');
    }

    const customerKey = await createCustomerRatingKey(
      order.telefono_cliente ?? order.detalles?.telefono_cliente,
    );
    if (!customerKey) return unavailable(409, 'Este pedido no tiene un teléfono válido para calificar.');

    const { error: ratingError } = await supabase.rpc('submit_order_service_rating', {
      p_pedido_id: order.id,
      p_rater_side: 'merchant',
      p_rating: parsed.data.rating,
      p_customer_key: customerKey,
    });
    if (ratingError) {
      if ((ratingError as { code?: string }).code === '23505') {
        return unavailable(409, 'Este pedido ya fue calificado.');
      }
      if (ratingError.message?.includes('ORDER_NOT_RATEABLE')) {
        return unavailable(409, 'El pedido ya no está disponible para calificar.');
      }
      throw new Error(ratingError.message);
    }

    return NextResponse.json(
      { ok: true, rating: parsed.data.rating },
      { status: 200, headers: { 'Cache-Control': 'no-store' } },
    );
  } catch {
    return unavailable(503, 'No se pudo guardar la calificación. Intenta más tarde.');
  }
}