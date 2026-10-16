-- Allow customers to update an existing per-order rating (one row per pedido/rater).
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
  v_management_mode text;
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

  v_management_mode := coalesce(v_details ->> 'management_mode', 'platform');

  -- WhatsApp-managed orders can be rated immediately; platform orders only when terminal.
  if v_management_mode <> 'whatsapp_manual'
    and v_status not in ('entregado', 'cancelado')
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
  )
  on conflict (pedido_id, rater_side) do update
  set
    rating = excluded.rating,
    customer_key = excluded.customer_key;

  update public.pedidos
  set detalles = jsonb_set(v_details, array[v_rating_key], to_jsonb(p_rating), true)
  where id = p_pedido_id;
end;
$$;
