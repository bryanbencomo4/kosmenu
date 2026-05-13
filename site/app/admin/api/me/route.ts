import { NextResponse } from 'next/server';

import { logAdminAction } from '../../_lib/admin-audit';
import { requireAdmin } from '../../_lib/admin-auth';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const admin = await requireAdmin();

  await logAdminAction({
    action: 'admin.me.read',
    actorUserId: admin.authUserId,
    actorEmail: admin.email,
    requestHeaders: request.headers,
  });

  return NextResponse.json({
    ok: true,
    data: admin,
  });
}