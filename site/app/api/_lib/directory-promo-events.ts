import 'server-only';

import { getServiceSupabaseClient } from './supabase-server';
import type { PromoDeliveryStats } from './directory-promo-rank';

export type PromoEventType = 'impression' | 'click' | 'order';
export type PromoPlacement = 'promoted_carousel' | 'promoted_hero';

export type PromoEventInput = {
  comercioId: string;
  eventType: PromoEventType;
  visitorId: string;
  sessionId: string;
  placement?: PromoPlacement;
  orderId?: string | null;
};

function todayUtcDate() {
  return new Date().toISOString().slice(0, 10);
}

function daysAgoUtcDate(days: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

async function bumpDailyStats(options: {
  comercioId: string;
  eventType: PromoEventType;
  visitorId: string;
  isNewUniqueVisitor: boolean;
}) {
  const supabase = getServiceSupabaseClient();
  const day = todayUtcDate();

  const { data: existing } = await supabase
    .from('directory_promo_stats_daily')
    .select('impressions,unique_visitors,clicks,orders')
    .eq('day', day)
    .eq('comercio_id', options.comercioId)
    .maybeSingle();

  const row = (existing ?? {
    impressions: 0,
    unique_visitors: 0,
    clicks: 0,
    orders: 0,
  }) as {
    impressions: number;
    unique_visitors: number;
    clicks: number;
    orders: number;
  };

  const next = {
    day,
    comercio_id: options.comercioId,
    impressions: row.impressions + (options.eventType === 'impression' ? 1 : 0),
    unique_visitors:
      row.unique_visitors +
      (options.eventType === 'impression' && options.isNewUniqueVisitor ? 1 : 0),
    clicks: row.clicks + (options.eventType === 'click' ? 1 : 0),
    orders: row.orders + (options.eventType === 'order' ? 1 : 0),
    updated_at: new Date().toISOString(),
  };

  await supabase.from('directory_promo_stats_daily').upsert(next, {
    onConflict: 'day,comercio_id',
  });
}

export async function recordDirectoryPromoEvents(events: PromoEventInput[]) {
  if (events.length === 0) return { inserted: 0, skipped: 0 };

  const supabase = getServiceSupabaseClient();
  let inserted = 0;
  let skipped = 0;

  for (const event of events) {
    const placement = event.placement ?? 'promoted_carousel';
    const impressionHour =
      event.eventType === 'impression'
        ? new Date().toISOString().slice(0, 13) // YYYY-MM-DDTHH UTC
        : null;
    const { data, error } = await supabase
      .from('directory_promo_events')
      .insert({
        comercio_id: event.comercioId,
        event_type: event.eventType,
        visitor_id: event.visitorId.slice(0, 128),
        session_id: event.sessionId.slice(0, 128),
        placement,
        order_id: event.orderId ?? null,
        impression_hour: impressionHour,
      })
      .select('id')
      .maybeSingle();

    if (error) {
      // Unique hourly impression index → treat as successful dedupe skip.
      const msg = (error.message ?? '').toLowerCase();
      if (msg.includes('duplicate') || msg.includes('unique')) {
        skipped += 1;
        continue;
      }
      skipped += 1;
      continue;
    }

    if (!data) {
      skipped += 1;
      continue;
    }

    inserted += 1;

    let isNewUniqueVisitor = false;
    if (event.eventType === 'impression') {
      const day = todayUtcDate();
      const dayStart = `${day}T00:00:00.000Z`;
      const { count } = await supabase
        .from('directory_promo_events')
        .select('id', { count: 'exact', head: true })
        .eq('comercio_id', event.comercioId)
        .eq('visitor_id', event.visitorId)
        .eq('event_type', 'impression')
        .gte('created_at', dayStart);
      // This insert is the first of the day when count === 1.
      isNewUniqueVisitor = (count ?? 0) <= 1;
    }

    await bumpDailyStats({
      comercioId: event.comercioId,
      eventType: event.eventType,
      visitorId: event.visitorId,
      isNewUniqueVisitor,
    });
  }

  return { inserted, skipped };
}

export async function loadPromoStatsWindow(
  comercioIds: string[],
  days = 7,
): Promise<Map<string, PromoDeliveryStats>> {
  const out = new Map<string, PromoDeliveryStats>();
  if (comercioIds.length === 0) return out;

  for (const id of comercioIds) {
    out.set(id, {
      comercioId: id,
      impressions: 0,
      uniqueVisitors: 0,
      clicks: 0,
      orders: 0,
    });
  }

  const supabase = getServiceSupabaseClient();
  const since = daysAgoUtcDate(Math.max(0, days - 1));

  const { data, error } = await supabase
    .from('directory_promo_stats_daily')
    .select('comercio_id,impressions,unique_visitors,clicks,orders')
    .in('comercio_id', comercioIds)
    .gte('day', since);

  if (error || !data) return out;

  for (const row of data as Array<{
    comercio_id?: string | null;
    impressions?: number | null;
    unique_visitors?: number | null;
    clicks?: number | null;
    orders?: number | null;
  }>) {
    const id = (row.comercio_id ?? '').toString().trim();
    if (!id) continue;
    const current = out.get(id) ?? {
      comercioId: id,
      impressions: 0,
      uniqueVisitors: 0,
      clicks: 0,
      orders: 0,
    };
    current.impressions += Number(row.impressions) || 0;
    current.uniqueVisitors += Number(row.unique_visitors) || 0;
    current.clicks += Number(row.clicks) || 0;
    current.orders += Number(row.orders) || 0;
    out.set(id, current);
  }

  return out;
}

export const PROMO_ATTR_COOKIE = 'elmx_promo_attr';
export const PROMO_ATTR_MAX_AGE_SEC = 24 * 60 * 60;

export type PromoAttribution = {
  comercioId: string;
  ts: number;
};

export function parsePromoAttributionCookie(raw: string | null | undefined): PromoAttribution | null {
  if (!raw) return null;
  try {
    const decoded = decodeURIComponent(raw);
    const parsed = JSON.parse(decoded) as { c?: string; t?: number };
    const comercioId = (parsed.c ?? '').toString().trim();
    const ts = Number(parsed.t);
    if (!comercioId || !Number.isFinite(ts)) return null;
    if (Date.now() - ts > PROMO_ATTR_MAX_AGE_SEC * 1000) return null;
    return { comercioId, ts };
  } catch {
    return null;
  }
}

export function serializePromoAttributionCookie(comercioId: string) {
  return encodeURIComponent(JSON.stringify({ c: comercioId, t: Date.now() }));
}
