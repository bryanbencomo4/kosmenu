import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

import { requireAdminPermission } from '../../../_lib/admin-auth';
import {
  getAdminDashboardChartData,
  isDashboardChartRange,
} from '../../../_lib/admin-dashboard-chart';
import {
  ADMIN_EXCLUSIONS_COOKIE,
  parseAdminExclusions,
} from '../../../_lib/admin-exclusions';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  await requireAdminPermission('dashboard.read');
  const url = new URL(request.url);
  const rangeRaw = (url.searchParams.get('range') ?? '7d').trim();
  const range = isDashboardChartRange(rangeRaw) ? rangeRaw : '7d';

  const cookieStore = await cookies();
  const rawCookie = cookieStore.get(ADMIN_EXCLUSIONS_COOKIE)?.value;
  const exclusions = parseAdminExclusions(
    rawCookie ? decodeURIComponent(rawCookie) : null,
  );

  try {
    const data = await getAdminDashboardChartData({ range, exclusions });
    return NextResponse.json({ ok: true, data });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'No se pudo cargar la grafica.',
      },
      { status: 500 },
    );
  }
}
