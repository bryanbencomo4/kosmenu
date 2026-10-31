import { NextResponse } from 'next/server';

import { requireAdminPermission } from '../../../_lib/admin-auth';
import { getAdminOpsOverview } from '../../../_lib/admin-ops';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  await requireAdminPermission('analytics.read');
  const url = new URL(request.url);
  const days = Number(url.searchParams.get('days') ?? 7);
  const topLimit = Number(url.searchParams.get('top') ?? 10);
  const excludeDemosRaw = (url.searchParams.get('excludeDemos') ?? '1').trim();
  const excludeDemos = excludeDemosRaw !== '0' && excludeDemosRaw !== 'false';
  const excludedIds = (url.searchParams.get('exclude') ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  try {
    const data = await getAdminOpsOverview({
      days: Number.isFinite(days) ? days : 7,
      topLimit: Number.isFinite(topLimit) ? topLimit : 10,
      excludeDemos,
      excludedIds,
    });

    // Intentionally no audit log: this endpoint is used for ops monitoring and
    // must not write a row on every refresh.
    return NextResponse.json({ ok: true, data });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'No se pudo cargar el panel operativo.',
      },
      { status: 500 },
    );
  }
}
