import { NextResponse } from 'next/server';
import { z } from 'zod';

import { consumeRateLimit, getClientIp } from '../../_lib/rate-limit';
import { getServiceSupabaseClient } from '../../_lib/supabase-server';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const bodySchema = z.object({
  comercioId: z.string().refine((v) => UUID_PATTERN.test(v), 'invalid comercioId'),
  sessionId: z.string().min(1).max(128),
  orderId: z.string().refine((v) => UUID_PATTERN.test(v)).nullish(),
  ruleId: z.string().refine((v) => UUID_PATTERN.test(v)).nullish(),
  bundleId: z.string().refine((v) => UUID_PATTERN.test(v)).nullish(),
  productId: z.string().refine((v) => UUID_PATTERN.test(v)).nullish(),
  surface: z.enum(['add_to_cart', 'cart', 'checkout']),
  eventType: z.enum(['impression', 'click', 'add', 'dismiss', 'purchase']),
  unitPrice: z.number().finite().nonnegative().nullish(),
  cartAmountBefore: z.number().finite().nonnegative().nullish(),
  cartAmountAfter: z.number().finite().nonnegative().nullish(),
});

/**
 * Fire-and-forget upsell analytics sink (impressions/clicks/adds/dismissals).
 * Never blocks the storefront: best-effort insert, generic responses only.
 */
export async function POST(request: Request) {
  const clientIp = getClientIp(request);
  const rate = consumeRateLimit(`upsell-events:${clientIp}`, 60, 60_000);
  if (!rate.ok) {
    return NextResponse.json({ ok: false }, { status: 429 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const data = parsed.data;

  try {
    const supabase = getServiceSupabaseClient();
    const { error } = await supabase.from('upsell_events').insert({
      comercio_id: data.comercioId,
      session_id: data.sessionId,
      order_id: data.orderId ?? null,
      rule_id: data.ruleId ?? null,
      bundle_id: data.bundleId ?? null,
      product_id: data.productId ?? null,
      surface: data.surface,
      event_type: data.eventType,
      unit_price: data.unitPrice ?? null,
      cart_amount_before: data.cartAmountBefore ?? null,
      cart_amount_after: data.cartAmountAfter ?? null,
    });

    if (error) {
      // Swallow: analytics failures must never surface to the customer.
      return NextResponse.json({ ok: false }, { status: 200 });
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch {
    return NextResponse.json({ ok: false }, { status: 200 });
  }
}
