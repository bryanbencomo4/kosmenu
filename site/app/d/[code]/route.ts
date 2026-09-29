import { NextResponse } from 'next/server';

import { getServiceSupabaseClient } from '../../api/_lib/supabase-server';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code: rawCode } = await params;
  const code = decodeURIComponent(rawCode ?? '').trim();
  if (!/^[A-Za-z0-9_-]{10}$/.test(code)) {
    return new NextResponse('Enlace no disponible.', { status: 404 });
  }

  const { data, error } = await getServiceSupabaseClient()
    .from('delivery_invite_short_links')
    .select('token')
    .eq('code', code)
    .maybeSingle();

  if (error || !data?.token) {
    return new NextResponse('Enlace no disponible.', { status: 404 });
  }

  const target = new URL(
    `/delivery/invite/${encodeURIComponent(data.token.toString())}`,
    request.url,
  );
  return NextResponse.redirect(target, 302);
}
