-- Directory promo ads: event stream + daily rollups for fair delivery ranking.
-- Writes go through service-role Next.js API routes (same pattern as upsell_events).

-- ---------------------------------------------------------------------------
-- Raw event stream
-- ---------------------------------------------------------------------------
create table if not exists public.directory_promo_events (
  id uuid primary key default gen_random_uuid(),
  comercio_id uuid not null references public.comercios(id) on delete cascade,
  event_type text not null check (event_type in ('impression', 'click', 'order')),
  visitor_id text not null,
  session_id text not null,
  placement text not null default 'promoted_carousel'
    check (placement in ('promoted_carousel', 'promoted_hero')),
  order_id uuid null references public.pedidos(id) on delete set null,
  -- Hour bucket for impression dedupe (API sets YYYY-MM-DDTHH UTC).
  impression_hour text null,
  created_at timestamptz not null default now()
);

create index if not exists directory_promo_events_comercio_created_idx
  on public.directory_promo_events (comercio_id, created_at desc);

create index if not exists directory_promo_events_type_created_idx
  on public.directory_promo_events (event_type, created_at desc);

create index if not exists directory_promo_events_visitor_idx
  on public.directory_promo_events (visitor_id, created_at desc);

alter table public.directory_promo_events
  add column if not exists impression_hour text null;

create unique index if not exists directory_promo_events_impression_hour_uidx
  on public.directory_promo_events (comercio_id, visitor_id, placement, impression_hour)
  where event_type = 'impression' and impression_hour is not null;

comment on table public.directory_promo_events is
  'Discovery promo funnel events: impressions, clicks, attributed orders.';

-- ---------------------------------------------------------------------------
-- Daily aggregates for ranking + admin metrics
-- ---------------------------------------------------------------------------
create table if not exists public.directory_promo_stats_daily (
  day date not null,
  comercio_id uuid not null references public.comercios(id) on delete cascade,
  impressions integer not null default 0 check (impressions >= 0),
  unique_visitors integer not null default 0 check (unique_visitors >= 0),
  clicks integer not null default 0 check (clicks >= 0),
  orders integer not null default 0 check (orders >= 0),
  updated_at timestamptz not null default now(),
  primary key (day, comercio_id)
);

create index if not exists directory_promo_stats_daily_comercio_day_idx
  on public.directory_promo_stats_daily (comercio_id, day desc);

comment on table public.directory_promo_stats_daily is
  'Rolled-up promo metrics per day for delivery ranking and admin reporting.';

-- ---------------------------------------------------------------------------
-- RLS: no anon/authenticated direct access; service_role bypasses RLS.
-- Merchant SELECT later can be added with is_comercio_owner policies.
-- ---------------------------------------------------------------------------
alter table public.directory_promo_events enable row level security;
alter table public.directory_promo_events force row level security;
alter table public.directory_promo_stats_daily enable row level security;
alter table public.directory_promo_stats_daily force row level security;

revoke all on table public.directory_promo_events from public, anon, authenticated;
revoke all on table public.directory_promo_stats_daily from public, anon, authenticated;
grant all on table public.directory_promo_events to service_role;
grant all on table public.directory_promo_stats_daily to service_role;

-- Owner can read their own daily stats (future merchant dashboard).
drop policy if exists directory_promo_stats_daily_owner_select on public.directory_promo_stats_daily;
create policy directory_promo_stats_daily_owner_select
  on public.directory_promo_stats_daily for select to authenticated
  using (public.is_comercio_owner(comercio_id));

drop policy if exists directory_promo_events_owner_select on public.directory_promo_events;
create policy directory_promo_events_owner_select
  on public.directory_promo_events for select to authenticated
  using (public.is_comercio_owner(comercio_id));
