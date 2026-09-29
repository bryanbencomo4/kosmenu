import { NextResponse } from 'next/server';

import { findOrderShortLink } from '../../api/_lib/order-short-links';
import { getServiceSupabaseClient } from '../../api/_lib/supabase-server';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code: rawCode } = await params;
  const code = decodeURIComponent(rawCode ?? '').trim();
  const supabase = getServiceSupabaseClient();
  const shortLink = await findOrderShortLink(supabase, code);

  if (!shortLink) {
    return new NextResponse('Enlace no disponible.', { status: 404 });
  }

  const publicUrl = new URL(
    `/orders/${encodeURIComponent(shortLink.order_id)}`,
    request.url,
  );
  publicUrl.searchParams.set('s', shortLink.code);
  return NextResponse.redirect(publicUrl, 302);
}
