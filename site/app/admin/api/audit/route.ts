import { NextResponse } from 'next/server';

import { logAdminAction } from '../../_lib/admin-audit';
import { requireAdminPermission } from '../../_lib/admin-auth';
import { getAdminSupabaseClient } from '../../_lib/admin-supabase';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const admin = await requireAdminPermission('audit.read');
  const requestUrl = new URL(request.url);
  const requestedLimit = Number(requestUrl.searchParams.get('limit') ?? '20');
  const limit = Number.isFinite(requestedLimit)
    ? Math.max(1, Math.min(Math.trunc(requestedLimit), 100))
    : 20;
  const supabase = getAdminSupabaseClient();

  const { data, error } = await supabase
    .from('admin_audit_logs')
    .select('id, actor_user_id, actor_email, action, entity_type, entity_id, metadata, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await logAdminAction({
    action: 'admin.audit.read',
    actorUserId: admin.authUserId,
    actorEmail: admin.email,
    metadata: { limit },
    requestHeaders: request.headers,
  });

  return NextResponse.json({
    ok: true,
    data: data ?? [],
  });
}