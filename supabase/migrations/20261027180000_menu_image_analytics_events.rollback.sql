-- Rollback for 20261027180000_menu_image_analytics_events.sql
-- Safe: restores prior CHECK; does NOT delete rows.
-- If any image_* rows exist, delete or reclassify them before re-adding the old CHECK.

-- Optional: remove image telemetry rows only (commercial events untouched)
-- delete from public.menu_analytics_events
-- where event_type in ('image_load', 'image_error', 'image_timeout');

alter table public.menu_analytics_events
  drop constraint if exists menu_analytics_events_event_type_check;

alter table public.menu_analytics_events
  add constraint menu_analytics_events_event_type_check
  check (event_type in (
    'menu_view',
    'qr_scan',
    'product_view',
    'add_to_cart',
    'checkout_started',
    'order_completed'
  ));
