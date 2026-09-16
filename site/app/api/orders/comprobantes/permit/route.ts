import { NextResponse } from 'next/server';

import { issueComprobantePermit, isComercioUuid } from '../../../_lib/comprobante-permit';
import { consumeRateLimit, getClientIp } from '../../../_lib/rate-limit';
import { getServiceSupabaseClient } from '../../../_lib/supabase-server';

export async function POST(request: Request) {
  try {
    const ip = getClientIp(request);
    const limit = consumeRateLimit(`comprobantes:permit:${ip}`, 10, 60_000);
    if (limit.ok === false) {
      return NextResponse.json(
        { error: 'Too many requests.' },
        { status: 429, headers: { 'Retry-After': String(limit.retryAfterSec) } },
      );
    }

    const body = (await request.json().catch(() => ({}))) as {
      slug?: unknown;
      comercioId?: unknown;
    };
    const identifier = String(body.slug ?? body.comercioId ?? '').trim();
    if (!identifier || identifier.length > 120) {
      return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
    }

    const supabase = getServiceSupabaseClient();
    const query = supabase.from('comercios').select('id,en_linea').limit(1);
    const { data, error } = isComercioUuid(identifier)
      ? await query.eq('id', identifier)
      : await query.eq('slug', identifier);

    if (error) {
      console.error('[comprobantes] permit lookup failed');
      return NextResponse.json({ error: 'Unavailable.' }, { status: 503 });
    }

    const row = (data ?? [])[0] as { id?: string; en_linea?: boolean } | undefined;
    if (!row?.id || row.en_linea !== true) {
      return NextResponse.json({ error: 'Not found.' }, { status: 404 });
    }

    const issued = issueComprobantePermit(String(row.id));
    return NextResponse.json({
      ok: true,
      data: {
        permit: issued.permit,
        expiresAt: issued.expiresAt,
        comercioId: String(row.id),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message.includes('Missing environment variable')) {
      return NextResponse.json({ error: 'Unavailable.' }, { status: 503 });
    }
    console.error('[comprobantes] permit request failed');
    return NextResponse.json({ error: 'Unavailable.' }, { status: 500 });
  }
}
