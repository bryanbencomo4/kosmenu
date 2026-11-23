import { NextResponse } from 'next/server';
import { z } from 'zod';

import {
  PROMO_ATTR_COOKIE,
  PROMO_ATTR_MAX_AGE_SEC,
  recordDirectoryPromoEvents,
  serializePromoAttributionCookie,
} from '../../../_lib/directory-promo-events';
import { consumeRateLimit, getClientIp } from '../../../_lib/rate-limit';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const bodySchema = z.object({
  visitorId: z.string().min(8).max(128),
  sessionId: z.string().min(4).max(128),
  events: z
    .array(
      z.object({
        comercioId: z.string().refine((v) => UUID_PATTERN.test(v), 'invalid comercioId'),
        type: z.enum(['impression', 'click']),
        placement: z.enum(['promoted_carousel', 'promoted_hero']).optional(),
      }),
    )
    .min(1)
    .max(20),
});

export async function POST(request: Request) {
  const clientIp = getClientIp(request);
  const rate = consumeRateLimit(`directory-promo-events:${clientIp}`, 90, 60_000);
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

  const { visitorId, sessionId, events } = parsed.data;

  try {
    await recordDirectoryPromoEvents(
      events.map((event) => ({
        comercioId: event.comercioId,
        eventType: event.type,
        visitorId,
        sessionId,
        placement: event.placement ?? 'promoted_carousel',
      })),
    );

    const lastClick = [...events].reverse().find((event) => event.type === 'click');
    const headers = new Headers();
    if (lastClick) {
      headers.append(
        'Set-Cookie',
        `${PROMO_ATTR_COOKIE}=${serializePromoAttributionCookie(lastClick.comercioId)}; Path=/; Max-Age=${PROMO_ATTR_MAX_AGE_SEC}; SameSite=Lax`,
      );
    }

    return NextResponse.json({ ok: true }, { status: 200, headers });
  } catch {
    return NextResponse.json({ ok: false }, { status: 200 });
  }
}
