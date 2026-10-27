-- Dry-run the image analytics CHECK change on a disposable mirror table.
-- Does NOT touch production. Run against any Postgres ≥14:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/scripts/validate-image-analytics-migration.sql

begin;

create temporary table menu_analytics_events_mirror (
  id bigserial primary key,
  comercio_id uuid not null default gen_random_uuid(),
  event_type text not null,
  origin text,
  device text,
  product_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint menu_analytics_events_event_type_check
    check (event_type in (
      'menu_view',
      'qr_scan',
      'product_view',
      'add_to_cart',
      'checkout_started',
      'order_completed'
    ))
);

-- Seed representative commercial rows (must survive migration)
insert into menu_analytics_events_mirror (event_type) values
  ('menu_view'),
  ('qr_scan'),
  ('product_view'),
  ('add_to_cart'),
  ('checkout_started'),
  ('order_completed');

-- Forward migration (same as 20261027180000)
alter table menu_analytics_events_mirror
  drop constraint if exists menu_analytics_events_event_type_check;

alter table menu_analytics_events_mirror
  add constraint menu_analytics_events_event_type_check
  check (event_type in (
    'menu_view',
    'qr_scan',
    'product_view',
    'add_to_cart',
    'checkout_started',
    'order_completed',
    'image_load',
    'image_error',
    'image_timeout'
  ));

-- Existing commercial rows still valid
do $$
declare n int;
begin
  select count(*) into n from menu_analytics_events_mirror;
  if n <> 6 then
    raise exception 'Expected 6 commercial seed rows, found %', n;
  end if;
end $$;

-- New image events accepted
insert into menu_analytics_events_mirror (event_type, metadata) values
  ('image_load', '{"phase":"cold","kind":"card","ms":120,"path_hash":"abcd1234","signal":"img_onload"}'::jsonb),
  ('image_error', '{"phase":"cold","reason":"img_error"}'::jsonb),
  ('image_timeout', '{"phase":"cold","reason":"phase_timeout"}'::jsonb);

-- Unknown event still rejected
do $$
begin
  insert into menu_analytics_events_mirror (event_type) values ('image_paint');
  raise exception 'Expected CHECK to reject image_paint';
exception
  when check_violation then
    null;
end $$;

-- Rollback procedure (does not delete commercial rows)
alter table menu_analytics_events_mirror
  drop constraint if exists menu_analytics_events_event_type_check;

-- Must delete or reclassify image_* before restoring old CHECK
delete from menu_analytics_events_mirror
where event_type in ('image_load', 'image_error', 'image_timeout');

alter table menu_analytics_events_mirror
  add constraint menu_analytics_events_event_type_check
  check (event_type in (
    'menu_view',
    'qr_scan',
    'product_view',
    'add_to_cart',
    'checkout_started',
    'order_completed'
  ));

do $$
declare n int;
begin
  select count(*) into n from menu_analytics_events_mirror;
  if n <> 6 then
    raise exception 'Rollback should leave 6 commercial rows, found %', n;
  end if;
  raise notice 'OK: migration + rollback validated on mirror (% commercial rows intact)', n;
end $$;

rollback;
