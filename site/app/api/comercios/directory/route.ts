import { NextResponse } from 'next/server';

import { listClientDirectory, searchPublicDirectory } from '../../_lib/public-directory';
import { DIRECTORY_CATEGORY_CHIPS } from '../../_lib/public-directory-geo';
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
    const mode = (url.searchParams.get('mode') ?? '').trim().toLowerCase();
    const query = (url.searchParams.get('q') ?? '').trim().slice(0, 80);

    if (mode === 'clientes') {
      const rawLimit = Number(url.searchParams.get('limit') ?? 60);
      const lat = Number(url.searchParams.get('lat'));
      const lng = Number(url.searchParams.get('lng'));
      const payload = await listClientDirectory({
        query,
        region: (url.searchParams.get('region') ?? '').trim().slice(0, 60),
        category: (url.searchParams.get('category') ?? '').trim().slice(0, 40),
        lat: Number.isFinite(lat) ? lat : undefined,
        lng: Number.isFinite(lng) ? lng : undefined,
        limit: Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 120) : 60,
      });

      return NextResponse.json(
        {
          ok: true,
          data: {
            query,
            ...payload,
            categories: DIRECTORY_CATEGORY_CHIPS,
          },
        },
        {
          status: 200,
          headers: {
            'Cache-Control': query
              ? 'private, max-age=15'
              : 'public, s-maxage=45, stale-while-revalidate=90',
          },
        },
      );
    }

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
          'Cache-Control': query
            ? 'private, max-age=15'
            : 'public, s-maxage=60, stale-while-revalidate=120',
        },
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to search directory.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
