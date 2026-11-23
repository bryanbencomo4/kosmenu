import { NextResponse } from 'next/server';

import { ZOOM_OFFICES_FALLBACK } from '../../../_lib/zoom-offices-fallback';
import { getZoomOffices } from '../../../_lib/zoom-offices';
import { appCorsPreflight, withAppCors } from '../../_lib/app-cors';
import { consumeRateLimit, getClientIp } from '../../_lib/rate-limit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const CORS = {
  methods: 'GET, OPTIONS',
  headers: 'accept, content-type',
};

/**
 * Public Zoom office catalog for kit checkout.
 * Always returns selectable offices + manualFallback=true so the UI never blocks.
 * CORS enabled for Flutter web (app.elmenuxfa.com).
 */
export async function OPTIONS(request: Request) {
  return appCorsPreflight(request, CORS);
}

export async function GET(request: Request) {
  try {
    const ip = getClientIp(request);
    const limit = consumeRateLimit(`kit:zoom-offices:${ip}`, 60, 60 * 60 * 1000);
    if (limit.ok === false) {
      return withAppCors(
        request,
        NextResponse.json(
          {
            ok: true,
            source: 'fallback',
            manualFallback: true,
            offices: ZOOM_OFFICES_FALLBACK,
            warning: 'rate_limited',
            fetchedAt: new Date().toISOString(),
          },
          { status: 200, headers: { 'Retry-After': String(limit.retryAfterSec) } },
        ),
        CORS,
      );
    }

    const force = new URL(request.url).searchParams.get('refresh') === '1';
    const result = await getZoomOffices({ forceRefresh: force });

    return withAppCors(
      request,
      NextResponse.json(
        {
          ok: true,
          ...result,
        },
        {
          headers: {
            'Cache-Control': 'public, max-age=300, stale-while-revalidate=3600',
          },
        },
      ),
      CORS,
    );
  } catch (error) {
    console.error('[kit/zoom-offices]', error);
    return withAppCors(
      request,
      NextResponse.json({
        ok: true,
        source: 'fallback',
        manualFallback: true,
        offices: ZOOM_OFFICES_FALLBACK,
        warning: 'unexpected_error',
        fetchedAt: new Date().toISOString(),
      }),
      CORS,
    );
  }
}
