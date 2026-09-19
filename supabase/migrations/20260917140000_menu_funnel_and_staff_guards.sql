-- Funnel analytics + kitchen write guard. Additive on merchant panel modules.

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

alter table public.menu_analytics_events
  add column if not exists product_id uuid;

alter table public.menu_analytics_events
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create index if not exists menu_analytics_events_product_idx
  on public.menu_analytics_events (comercio_id, event_type, product_id)
  where product_id is not null;

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
  where e.comercio_id = p_comercio_id and e.event_type = 'menu_view' and e.created_at >= v_since;

  select count(*) into v_scans
  from public.menu_analytics_events e
  where e.comercio_id = p_comercio_id and e.event_type = 'qr_scan' and e.created_at >= v_since;

  select count(*) into v_product_views
  from public.menu_analytics_events e
  where e.comercio_id = p_comercio_id and e.event_type = 'product_view' and e.created_at >= v_since;

  select count(*) into v_add_to_cart
  from public.menu_analytics_events e
  where e.comercio_id = p_comercio_id and e.event_type = 'add_to_cart' and e.created_at >= v_since;

  select count(*) into v_checkouts
  from public.menu_analytics_events e
  where e.comercio_id = p_comercio_id and e.event_type = 'checkout_started' and e.created_at >= v_since;

  select count(*), coalesce(sum(p.total), 0)
  into v_orders, v_revenue
  from public.pedidos p
  where p.comercio_id = p_comercio_id
    and p.created_at >= v_since
    and coalesce(p.estado::text, '') <> 'cancelado';

  select count(*) into v_repeat_customers
  from (
    select 1
    from public.pedidos p
    where p.comercio_id = p_comercio_id
      and coalesce(p.estado::text, '') <> 'cancelado'
    group by coalesce(nullif(trim(p.telefono_cliente), ''), p.id::text)
    having count(*) > 1
  ) repeats;

  select coalesce(jsonb_agg(jsonb_build_object('date', to_char(day, 'YYYY-MM-DD'), 'count', coalesce(cnt, 0)) order by day), '[]'::jsonb)
  into v_visits_by_day
  from (
    select gs::date as day
    from generate_series((now() at time zone 'America/Caracas')::date - 6, (now() at time zone 'America/Caracas')::date, interval '1 day') gs
  ) days
  left join (
    select ((e.created_at at time zone 'America/Caracas')::date) as day, count(*)::int as cnt
    from public.menu_analytics_events e
    where e.comercio_id = p_comercio_id and e.event_type = 'menu_view' and e.created_at >= (now() - interval '7 days')
    group by 1
  ) counts on counts.day = days.day;

  select coalesce(jsonb_agg(jsonb_build_object('date', to_char(day, 'YYYY-MM-DD'), 'count', coalesce(cnt, 0)) order by day), '[]'::jsonb)
  into v_orders_by_day
  from (
    select gs::date as day
    from generate_series((now() at time zone 'America/Caracas')::date - 6, (now() at time zone 'America/Caracas')::date, interval '1 day') gs
  ) days
  left join (
    select ((p.created_at at time zone 'America/Caracas')::date) as day, count(*)::int as cnt
    from public.pedidos p
    where p.comercio_id = p_comercio_id
      and p.created_at >= (now() - interval '7 days')
      and coalesce(p.estado::text, '') <> 'cancelado'
    group by 1
  ) counts on counts.day = days.day;

  select coalesce(jsonb_agg(jsonb_build_object(
      'product_id', product_id,
      'name', name,
      'views', views
    ) order by views desc), '[]'::jsonb)
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
    'conversion', case when v_visits > 0 then round((v_orders::numeric / v_visits::numeric) * 100, 1) else 0 end,
    'visits_by_day', v_visits_by_day,
    'orders_by_day', v_orders_by_day,
    'top_viewed', v_top_viewed
  );
end;
$$;

create or replace function public.enforce_staff_pedido_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text := lower(coalesce(new.estado::text, ''));
  v_new_estado public.pedidos.estado%type := new.estado;
begin
  if auth.uid() is null then
    return new;
  end if;
  if public.is_comercio_owner(new.comercio_id)
     or public.comercio_has_role(new.comercio_id, array['administrador', 'caja']::text[]) then
    return new;
  end if;
  if public.comercio_has_role(new.comercio_id, array['cocina']::text[]) then
    if v_status not in ('pendiente', 'confirmado', 'preparando', 'listo', 'en_preparacion') then
      raise exception 'Cocina solo puede actualizar el estado de preparación';
    end if;
    new := old;
    new.estado := v_new_estado;
    return new;
  end if;
  raise exception 'not authorized';
end;
$$;

drop trigger if exists trg_enforce_staff_pedido_update on public.pedidos;
create trigger trg_enforce_staff_pedido_update
before update on public.pedidos
for each row execute function public.enforce_staff_pedido_update();
