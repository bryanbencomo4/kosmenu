import { NextResponse } from 'next/server';

import { findOrderShortLink } from '../../api/_lib/order-short-links';
import { getServiceSupabaseClient } from '../../api/_lib/supabase-server';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  try {
    const { code } = await params;
    const shortLink = await findOrderShortLink(getServiceSupabaseClient(), code);
    if (!shortLink) return new NextResponse('Enlace no disponible.', { status: 404 });

    const origin = process.env.NEXT_PUBLIC_APP_SITE_URL ?? 'https://app.elmenuxfa.com';
    const destination = new URL(`/orders/view/${encodeURIComponent(shortLink.order_id)}`, origin);
    destination.searchParams.set('shortCode', shortLink.code);
    destination.searchParams.set('comprobante', '1');
    const response = NextResponse.redirect(destination, 302);
    response.headers.set('Cache-Control', 'private, no-store');
    response.headers.set('Referrer-Policy', 'no-referrer');
    return response;
  } catch {
    return new NextResponse('Enlace no disponible.', { status: 404 });
  }
}