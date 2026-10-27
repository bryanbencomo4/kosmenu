-- Allow lightweight public-menu image load/error/timeout telemetry.

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
    'order_completed',
    'image_load',
    'image_error',
    'image_timeout'
  ));
