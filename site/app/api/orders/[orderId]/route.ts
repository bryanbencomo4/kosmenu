import { NextResponse } from 'next/server';

import { extractComercioId } from '../../_lib/order-utils';
import { getServerSupabaseClient } from '../../_lib/supabase-server';

type Params = {
  params: Promise<{ orderId: string }>;
};

export async function GET(_: Request, { params }: Params) {
  try {
    const { orderId: rawOrderId } = await params;
    const orderId = decodeURIComponent(rawOrderId ?? '').trim();

    if (!orderId) {
      return NextResponse.json({ error: 'Invalid orderId.' }, { status: 400 });
    }

    const supabase = getServerSupabaseClient();
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

    const order = (rows ?? []).find((row: any) => row?.detalles?.order_id === orderId);

    if (!order) {
      return NextResponse.json({ ok: true, data: null }, { status: 200 });
    }

    let comercio: any = null;
    if (order.comercio_id) {
      const comercioResult = await supabase
        .from('comercios')
        .select('id,nombre')
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
