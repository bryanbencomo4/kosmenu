import { NextResponse, type NextRequest } from 'next/server';

import {
  COURIER_ORDER_COOKIE,
  customerOrderCookieName,
  expiredCourierOrderCookie,
  resolveShortLinkAudience,
} from '../../api/_lib/courier-order-link';
import { findOrderShortLink } from '../../api/_lib/order-short-links';
import { getServiceSupabaseClient } from '../../api/_lib/supabase-server';

export const dynamic = 'force-dynamic';

function redirectNoStore(url: URL) {
  const response = NextResponse.redirect(url, 302);
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code: rawCode } = await params;
  let code = '';
  try {
    code = decodeURIComponent(rawCode ?? '').trim();
  } catch {
    return new NextResponse('Enlace no disponible.', { status: 404 });
  }
  const supabase = getServiceSupabaseClient();
  const shortLink = await findOrderShortLink(supabase, code);

  if (!shortLink) {
    return new NextResponse('Enlace no disponible.', { status: 404 });
  }

  const audience = await resolveShortLinkAudience({
    supabase,
    shortLink,
    courierToken: request.cookies.get(COURIER_ORDER_COOKIE)?.value,
    customerToken: request.cookies.get(customerOrderCookieName(shortLink.code))?.value,
  });

  if (audience.target === 'courier') {
    return redirectNoStore(
      new URL(`/delivery/invite/${encodeURIComponent(audience.token)}`, request.url),
    );
  }

  const publicUrl = new URL(
    `/orders/${encodeURIComponent(shortLink.order_id)}`,
    request.url,
  );
  publicUrl.searchParams.set('s', shortLink.code);
  const response = redirectNoStore(publicUrl);
  if (audience.clearCourierCookie) {
    response.cookies.set(expiredCourierOrderCookie(shortLink.code));
  }
  return response;
}
