import { NextResponse } from 'next/server';

import { detectMenuDevice } from '../../../_lib/business-hours';
import { getServiceSupabaseClient } from '../../../_lib/supabase-server';
import { isMenuUuid } from '../../_lib/load-public-menu';
import { consumeRateLimit, getClientIp } from '../../../_lib/rate-limit';

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
  'image_load',
  'image_error',
  'image_timeout',
]);

const IMAGE_EVENTS = new Set(['image_load', 'image_error', 'image_timeout']);

function sanitizeImageMetadata(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const input = raw as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  const phase = String(input.phase ?? '').trim();
  if (phase === 'cold' || phase === 'hot' || phase === 'original') out.phase = phase;
  const kind = String(input.kind ?? '').trim();
  if (kind === 'thumb' || kind === 'card' || kind === 'hero') out.kind = kind;
  const ms = Number(input.ms);
  if (Number.isFinite(ms) && ms >= 0 && ms < 120_000) out.ms = Math.round(ms);
  const pathHash = String(input.path_hash ?? '').trim();
  if (pathHash) out.path_hash = pathHash.slice(0, 16);
  const reason = String(input.reason ?? '').trim();
  if (reason) out.reason = reason.slice(0, 40);
  const signal = String(input.signal ?? '').trim();
  if (signal) out.signal = signal.slice(0, 32);
  if (typeof input.downlink === 'number' && Number.isFinite(input.downlink)) {
    out.downlink = Math.round(input.downlink * 10) / 10;
  }
  if (typeof input.rtt === 'number' && Number.isFinite(input.rtt)) {
    out.rtt = Math.round(input.rtt);
  }
  if (input.save_data === true) out.save_data = true;
  return out;
}

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

    if (IMAGE_EVENTS.has(eventType)) {
      const ip = getClientIp(request);
      const limit = consumeRateLimit(`menu:image-events:${ip}`, 40, 60_000);
      if (limit.ok === false) {
        return new NextResponse(null, {
          status: 204,
          headers: { 'Retry-After': String(limit.retryAfterSec) },
        });
      }
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

    const metadata: Record<string, unknown> = {
      source: origin,
      ...(IMAGE_EVENTS.has(eventType) ? sanitizeImageMetadata(body.metadata) : {}),
    };

    const insert = await supabase.from('menu_analytics_events').insert({
      comercio_id: comercioId,
      event_type: eventType,
      origin,
      device,
      product_id: IMAGE_EVENTS.has(eventType) ? null : productId || null,
      metadata,
    });

    if (insert.error) {
      return new NextResponse(null, { status: 204 });
    }

    return NextResponse.json({ ok: true }, { status: 201 });
  } catch {
    return new NextResponse(null, { status: 204 });
  }
}
