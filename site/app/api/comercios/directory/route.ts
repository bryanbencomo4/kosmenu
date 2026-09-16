import { NextResponse } from 'next/server';

import { searchPublicDirectory } from '../../_lib/public-directory';
import { consumeRateLimit, getClientIp } from '../../_lib/rate-limit';

export async function GET(request: Request) {
  try {
    const ip = getClientIp(request);
    const limit = consumeRateLimit(`directory:search:${ip}`, 60, 60_000);
    if (limit.ok === false) {
      return NextResponse.json(
        { error: 'Too many requests.' },
        { status: 429, headers: { 'Retry-After': String(limit.retryAfterSec) } },
      );
    }

    const url = new URL(request.url);
    const query = (url.searchParams.get('q') ?? '').trim().slice(0, 80);
    const rawLimit = Number(url.searchParams.get('limit') ?? 8);
    const safeLimit = Number.isFinite(rawLimit) ? rawLimit : 8;

    const results = await searchPublicDirectory({
      query,
      limit: safeLimit,
    });

    return NextResponse.json(
      {
        ok: true,
        data: {
          query,
          results,
        },
      },
      {
        status: 200,
        headers: {
          'Cache-Control': query ? 'private, max-age=15' : 'public, s-maxage=60, stale-while-revalidate=120',
        },
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to search directory.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
