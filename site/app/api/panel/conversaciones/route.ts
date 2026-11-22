import { NextResponse } from 'next/server';

import { getServiceSupabaseClient } from '../../_lib/supabase-server';
import { consumeRateLimit, getClientIp } from '../../_lib/rate-limit';
import { requireMerchantConversationAccess } from './_lib/auth';
import { isSupervisionEnabledForCommerce } from '../../chat/_lib/supervision-config';

export const runtime = 'nodejs';

/**
 * GET /api/panel/conversaciones?comercioId=
 * Bearer auth. Lists recent conversations for the merchant inbox.
 */
export async function GET(request: Request) {
  const ip = getClientIp(request);
  const limit = consumeRateLimit(`panel:chat:list:${ip}`, 60, 60_000);
  if (!limit.ok) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  }

  const url = new URL(request.url);
  const comercioId = (url.searchParams.get('comercioId') || '').trim();
  const access = await requireMerchantConversationAccess(request, comercioId);
  if ('error' in access) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  if (!isSupervisionEnabledForCommerce(access.comercioId)) {
    return NextResponse.json({ error: 'supervision_disabled' }, { status: 403 });
  }

  const sb = getServiceSupabaseClient();
  const { data, error } = await sb
    .from('chat_conversations')
    .select(
      'id,status,consumer_label,last_message_at,last_message_preview,unread_merchant_count,assigned_user_id,attention_version,created_at',
    )
    .eq('comercio_id', access.comercioId)
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: 'list_failed' }, { status: 503 });
  }

  return NextResponse.json({
    ok: true,
    comercioId: access.comercioId,
    conversations: data || [],
  });
}
