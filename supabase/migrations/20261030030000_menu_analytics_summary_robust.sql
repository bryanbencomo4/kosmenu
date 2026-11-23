-- Harden menu analytics summary: safer aggregates, exclude archived orders.
create or replace function public.get_menu_analytics_summary(
  p_comercio_id uuid,
  p_days integer default 30
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_days integer := greatest(coalesce(p_days, 30), 1);
  v_since timestamptz := now() - make_interval(days => v_days);
  v_visits bigint := 0;
  v_scans bigint := 0;
  v_product_views bigint := 0;
  v_add_to_cart bigint := 0;
  v_checkouts bigint := 0;
  v_orders bigint := 0;
  v_revenue numeric := 0;
  v_repeat_customers bigint := 0;
  v_visits_by_day jsonb := '[]'::jsonb;
  v_orders_by_day jsonb := '[]'::jsonb;
  v_top_viewed jsonb := '[]'::jsonb;
begin
  if auth.uid() is null or not public.is_comercio_member(p_comercio_id) then
    raise exception 'not authorized';
  end if;

  select count(*) into v_visits
  from public.menu_analytics_events e
  where e.comercio_id = p_comercio_id
    and e.event_type = 'menu_view'
    and e.created_at >= v_since;

  select count(*) into v_scans
  from public.menu_analytics_events e
  where e.comercio_id = p_comercio_id
    and e.event_type = 'qr_scan'
    and e.created_at >= v_since;

  select count(*) into v_product_views
  from public.menu_analytics_events e
  where e.comercio_id = p_comercio_id
    and e.event_type = 'product_view'
    and e.created_at >= v_since;

  select count(*) into v_add_to_cart
  from public.menu_analytics_events e
  where e.comercio_id = p_comercio_id
    and e.event_type = 'add_to_cart'
    and e.created_at >= v_since;

  select count(*) into v_checkouts
  from public.menu_analytics_events e
  where e.comercio_id = p_comercio_id
    and e.event_type = 'checkout_started'
    and e.created_at >= v_since;

  select count(*), coalesce(sum(coalesce(p.total, 0)), 0)
  into v_orders, v_revenue
  from public.pedidos p
  where p.comercio_id = p_comercio_id
    and p.created_at >= v_since
    and p.archived_at is null
    and lower(coalesce(p.estado::text, '')) not in ('cancelado', 'canceled', 'cancelled');

  select count(*) into v_repeat_customers
  from (
    select 1
    from public.pedidos p
    where p.comercio_id = p_comercio_id
      and p.archived_at is null
      and lower(coalesce(p.estado::text, '')) not in ('cancelado', 'canceled', 'cancelled')
    group by coalesce(nullif(trim(p.telefono_cliente), ''), p.id::text)
    having count(*) > 1
  ) repeats;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'date', to_char(day, 'YYYY-MM-DD'),
        'count', coalesce(cnt, 0)
      )
      order by day
    ),
    '[]'::jsonb
  )
  into v_visits_by_day
  from (
    select gs::date as day
    from generate_series(
      (now() at time zone 'America/Caracas')::date - 6,
      (now() at time zone 'America/Caracas')::date,
      interval '1 day'
    ) gs
  ) days
  left join (
    select ((e.created_at at time zone 'America/Caracas')::date) as day,
           count(*)::int as cnt
    from public.menu_analytics_events e
    where e.comercio_id = p_comercio_id
      and e.event_type = 'menu_view'
      and e.created_at >= (now() - interval '7 days')
    group by 1
  ) counts on counts.day = days.day;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'date', to_char(day, 'YYYY-MM-DD'),
        'count', coalesce(cnt, 0)
      )
      order by day
    ),
    '[]'::jsonb
  )
  into v_orders_by_day
  from (
    select gs::date as day
    from generate_series(
      (now() at time zone 'America/Caracas')::date - 6,
      (now() at time zone 'America/Caracas')::date,
      interval '1 day'
    ) gs
  ) days
  left join (
    select ((p.created_at at time zone 'America/Caracas')::date) as day,
           count(*)::int as cnt
    from public.pedidos p
    where p.comercio_id = p_comercio_id
      and p.created_at >= (now() - interval '7 days')
      and p.archived_at is null
      and lower(coalesce(p.estado::text, '')) not in ('cancelado', 'canceled', 'cancelled')
    group by 1
  ) counts on counts.day = days.day;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'product_id', product_id,
        'name', name,
        'views', views
      )
      order by views desc
    ),
    '[]'::jsonb
  )
  into v_top_viewed
  from (
    select e.product_id,
           coalesce(nullif(trim(pr.nombre), ''), 'Producto') as name,
           count(*)::int as views
    from public.menu_analytics_events e
    left join public.productos pr on pr.id = e.product_id
    where e.comercio_id = p_comercio_id
      and e.event_type = 'product_view'
      and e.product_id is not null
      and e.created_at >= v_since
    group by e.product_id, pr.nombre
    order by count(*) desc
    limit 8
  ) ranked;

  return jsonb_build_object(
    'visits', v_visits,
    'scans', v_scans,
    'product_views', v_product_views,
    'add_to_cart', v_add_to_cart,
    'checkouts', v_checkouts,
    'orders', v_orders,
    'revenue', v_revenue,
    'repeat_customers', v_repeat_customers,
    'avg_ticket', case when v_orders > 0 then round(v_revenue / v_orders, 2) else 0 end,
    'conversion', case
      when v_visits > 0 then round((v_orders::numeric / v_visits::numeric) * 100, 1)
      else 0
    end,
    'visits_by_day', v_visits_by_day,
    'orders_by_day', v_orders_by_day,
    'top_viewed', v_top_viewed
  );
end;
$$;

revoke all on function public.get_menu_analytics_summary(uuid, integer) from public, anon;
grant execute on function public.get_menu_analytics_summary(uuid, integer) to authenticated, service_role;
