import { NextResponse } from 'next/server';

import { requireAdminPermission } from '../../../_lib/admin-auth';
import { loadPromoStatsWindow } from '../../../../api/_lib/directory-promo-events';
import { getAdminSupabaseClient } from '../../../_lib/admin-supabase';
import { readPromotedFromBranding } from '../../../_lib/admin-businesses';

export const dynamic = 'force-dynamic';

export async function GET() {
  await requireAdminPermission('businesses.read');

  try {
    const supabase = getAdminSupabaseClient();
    const { data, error } = await supabase
      .from('comercios')
      .select('id,branding_ia')
      .limit(1000);

    if (error) {
      throw new Error(error.message);
    }

    const promotedIds = ((data ?? []) as Array<{ id?: string | null; branding_ia?: unknown }>)
      .filter((row) => readPromotedFromBranding(row.branding_ia))
      .map((row) => (row.id ?? '').toString().trim())
      .filter(Boolean);

    const statsById = await loadPromoStatsWindow(promotedIds, 7);
    const rows = promotedIds.map((id) => {
      const stats = statsById.get(id) ?? {
        comercioId: id,
        impressions: 0,
        uniqueVisitors: 0,
        clicks: 0,
        orders: 0,
      };
      const ctr = stats.impressions > 0 ? stats.clicks / stats.impressions : 0;
      const cvr = stats.clicks > 0 ? stats.orders / stats.clicks : 0;
      return {
        comercioId: id,
        impressions: stats.impressions,
        uniqueVisitors: stats.uniqueVisitors,
        clicks: stats.clicks,
        orders: stats.orders,
        ctr,
        cvr,
      };
    });

    return NextResponse.json({ ok: true, data: rows, windowDays: 7 });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'No se pudieron cargar las metricas de promocion.',
      },
      { status: 500 },
    );
  }
}
