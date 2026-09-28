create table if not exists public.order_service_ratings (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references public.pedidos(id) on delete cascade,
  comercio_id uuid not null references public.comercios(id) on delete cascade,
  customer_key text not null check (customer_key ~ '^[a-f0-9]{64}$'),
  rater_side text not null check (rater_side in ('customer', 'merchant')),
  rating smallint not null check (rating between 1 and 5),
  created_at timestamptz not null default now(),
  unique (pedido_id, rater_side)
);

create index if not exists order_service_ratings_comercio_customer_idx
  on public.order_service_ratings (comercio_id, rater_side, created_at desc);

create index if not exists order_service_ratings_customer_key_idx
  on public.order_service_ratings (customer_key, rater_side, created_at desc);

alter table public.order_service_ratings enable row level security;
alter table public.order_service_ratings force row level security;
revoke all on table public.order_service_ratings from public, anon, authenticated;
grant all on table public.order_service_ratings to service_role;

create or replace function public.get_order_service_rating_summary(
  p_comercio_id uuid,
  p_customer_key text default null
)
returns table (
  comercio_average numeric,
  comercio_count bigint,
  customer_average numeric,
  customer_count bigint
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    coalesce(round(avg(r.rating) filter (where r.rater_side = 'customer' and r.comercio_id = p_comercio_id), 1), 0),
    count(*) filter (where r.rater_side = 'customer' and r.comercio_id = p_comercio_id),
    coalesce(round(avg(r.rating) filter (where r.rater_side = 'merchant' and r.customer_key = p_customer_key), 1), 0),
    count(*) filter (where r.rater_side = 'merchant' and r.customer_key = p_customer_key)
  from public.order_service_ratings r
  where (r.rater_side = 'customer' and r.comercio_id = p_comercio_id)
    or (r.rater_side = 'merchant' and r.customer_key = p_customer_key);
$$;

create or replace function public.submit_order_service_rating(
  p_pedido_id uuid,
  p_rater_side text,
  p_rating smallint,
  p_customer_key text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_comercio_id uuid;
  v_status text;
  v_details jsonb;
  v_rating_key text;
begin
  if p_rater_side not in ('customer', 'merchant') then
    raise exception 'INVALID_RATER_SIDE' using errcode = '22023';
  end if;

  if p_rating < 1 or p_rating > 5 then
    raise exception 'INVALID_RATING' using errcode = '22023';
  end if;

  select p.comercio_id, p.estado::text, coalesce(p.detalles, '{}'::jsonb)
    into v_comercio_id, v_status, v_details
  from public.pedidos p
  where p.id = p_pedido_id
  for update;

  if not found then
    raise exception 'ORDER_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_status not in ('entregado', 'cancelado')
    and coalesce(v_details #>> '{delivery_delegate,status}', '') <> 'completed' then
    raise exception 'ORDER_NOT_RATEABLE' using errcode = 'P0001';
  end if;

  if coalesce(p_customer_key, '') !~ '^[a-f0-9]{64}$' then
    raise exception 'INVALID_CUSTOMER_KEY' using errcode = '22023';
  end if;

  v_rating_key := case
    when p_rater_side = 'customer' then 'customer_service_rating'
    else 'merchant_service_rating'
  end;

  insert into public.order_service_ratings (
    pedido_id,
    comercio_id,
    customer_key,
    rater_side,
    rating
  ) values (
    p_pedido_id,
    v_comercio_id,
    p_customer_key,
    p_rater_side,
    p_rating
  );

  update public.pedidos
  set detalles = jsonb_set(v_details, array[v_rating_key], to_jsonb(p_rating), true)
  where id = p_pedido_id;
end;
$$;

revoke all on function public.get_order_service_rating_summary(uuid, text) from public, anon, authenticated;
revoke all on function public.submit_order_service_rating(uuid, text, smallint, text) from public, anon, authenticated;
grant execute on function public.get_order_service_rating_summary(uuid, text) to service_role;
grant execute on function public.submit_order_service_rating(uuid, text, smallint, text) to service_role;