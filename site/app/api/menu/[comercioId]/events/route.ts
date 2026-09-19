import { NextResponse } from 'next/server';

import { detectMenuDevice } from '../../../_lib/business-hours';
import { getServiceSupabaseClient } from '../../../_lib/supabase-server';
import { isMenuUuid } from '../../_lib/load-public-menu';

type Params = {
  params: Promise<{ comercioId: string }>;
};

const EVENT_TYPES = new Set([
  'menu_view',
  'qr_scan',
  'product_view',
  'add_to_cart',
  'checkout_started',
  'order_completed',
]);

export async function POST(request: Request, { params }: Params) {
  try {
    const { comercioId: rawComercioId } = await params;
    const identifier = decodeURIComponent(rawComercioId ?? '').trim();
    if (!identifier) {
      return NextResponse.json({ error: 'Invalid comercioId.' }, { status: 400 });
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const eventType = String(body.event ?? body.event_type ?? '').trim();
    if (!EVENT_TYPES.has(eventType)) {
      return NextResponse.json({ error: 'Invalid event.' }, { status: 400 });
    }

    const origin = String(body.origin ?? '').trim().slice(0, 120) || 'direct';
    const device =
      String(body.device ?? '').trim().slice(0, 40) ||
      detectMenuDevice(request.headers.get('user-agent') ?? '');
    const productId = String(body.product_id ?? body.productId ?? '').trim();

    const supabase = getServiceSupabaseClient();
    const query = supabase.from('comercios').select('id').limit(1);
    const { data, error } = isMenuUuid(identifier)
      ? await query.eq('id', identifier)
      : await query.eq('slug', identifier);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    const comercioId = (data?.[0] as { id?: string } | undefined)?.id;
    if (!comercioId) {
      return NextResponse.json({ error: 'Comercio not found.' }, { status: 404 });
    }

    const insert = await supabase.from('menu_analytics_events').insert({
      comercio_id: comercioId,
      event_type: eventType,
      origin,
      device,
      product_id: productId || null,
      metadata: {
        source: origin,
      },
    });

    if (insert.error) {
      return NextResponse.json({ ok: false }, { status: 204 });
    }

    return NextResponse.json({ ok: true }, { status: 201 });
  } catch {
    return NextResponse.json({ ok: false }, { status: 204 });
  }
}
