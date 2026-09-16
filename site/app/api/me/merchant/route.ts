import { NextResponse } from 'next/server';

import { appSiteUrl } from '../../../_lib/public-site-config';
import { sanitizeMerchantPresence } from '../../../_lib/merchant-presence';
import { consumeRateLimit, getClientIp } from '../../_lib/rate-limit';
import { getUserFromBearerRequest } from '../../_lib/supabase-user-auth';
import { getServiceSupabaseClient } from '../../_lib/supabase-server';

export const dynamic = 'force-dynamic';

function corsHeaders(request: Request): HeadersInit {
  const origin = (request.headers.get('origin') ?? '').trim();
  const allowed = new Set([
    appSiteUrl,
    'https://app.elmenuxfa.com',
    'http://localhost:5000',
    'http://localhost:8080',
    'http://127.0.0.1:5000',
    'http://127.0.0.1:8080',
  ]);
  if (!origin || !allowed.has(origin)) {
    return {};
  }
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, content-type',
    Vary: 'Origin',
  };
}

export async function OPTIONS(request: Request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(request) });
}

export async function GET(request: Request) {
  const headers = corsHeaders(request);
  const ip = getClientIp(request);
  const limit = consumeRateLimit(`me:merchant:${ip}`, 30, 60_000);
  if (limit.ok === false) {
    return NextResponse.json(
      { error: 'Too many requests.' },
      { status: 429, headers: { ...headers, 'Retry-After': String(limit.retryAfterSec) } },
    );
  }

  const user = await getUserFromBearerRequest(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401, headers });
  }

  try {
    const supabase = getServiceSupabaseClient();
    const { data, error } = await supabase
      .from('comercios')
      .select('nombre,logo_url,slug')
      .eq('owner_id', user.id)
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('[me/merchant] lookup failed');
      return NextResponse.json({ error: 'Unavailable.' }, { status: 503, headers });
    }

    const row = (data ?? null) as { nombre?: string; logo_url?: string; slug?: string } | null;
    const presence = sanitizeMerchantPresence({
      name: row?.nombre?.trim() || 'Tu cuenta',
      logoUrl: row?.logo_url ?? null,
      slug: row?.slug ?? null,
    });

    return NextResponse.json(
      { ok: true, data: presence },
      { status: 200, headers: { ...headers, 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message.includes('Missing environment variable')) {
      return NextResponse.json({ error: 'Unavailable.' }, { status: 503, headers });
    }
    console.error('[me/merchant] request failed');
    return NextResponse.json({ error: 'Unavailable.' }, { status: 500, headers });
  }
}
