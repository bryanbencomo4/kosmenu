create or replace function public.upsert_delivery_courier(
  p_comercio_id uuid,
  p_alias text,
  p_phone_e164 text,
  p_normalized_phone text
)
returns table (
  id uuid,
  alias text,
  phone_e164 text,
  normalized_phone text,
  last_used_at timestamptz,
  completed_orders_count integer,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_actor uuid;
  v_owner_id uuid;
  v_alias text;
  v_phone text;
  v_norm text;
  v_row public.delivery_couriers%rowtype;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  select c.owner_id into v_owner_id
  from public.comercios c
  where c.id = p_comercio_id;

  if v_owner_id is null then
    raise exception 'COMERCIO_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_owner_id <> v_actor then
    raise exception 'COMERCIO_FORBIDDEN' using errcode = '42501';
  end if;

  v_alias := trim(coalesce(p_alias, ''));
  v_phone := trim(coalesce(p_phone_e164, ''));
  v_norm := regexp_replace(coalesce(p_normalized_phone, ''), '\D', '', 'g');

  if v_norm = '' or length(v_norm) < 10 then
    raise exception 'COURIER_PHONE_INVALID' using errcode = '22023';
  end if;

  if v_alias = '' then
    v_alias := 'Repartidor ' || right(v_norm, 4);
  end if;

  insert into public.delivery_couriers (
    comercio_id,
    alias,
    phone_e164,
    normalized_phone,
    created_by,
    is_active,
    last_used_at
  )
  values (
    p_comercio_id,
    v_alias,
    v_phone,
    v_norm,
    v_actor,
    true,
    now()
  )
  on conflict (comercio_id, normalized_phone) where is_active = true
  do update
    set alias = excluded.alias,
        phone_e164 = excluded.phone_e164,
        is_active = true,
        last_used_at = now(),
        updated_at = now()
  returning * into v_row;

  return query
  select
    v_row.id,
    v_row.alias,
    v_row.phone_e164,
    v_row.normalized_phone,
    v_row.last_used_at,
    (
      select count(*)::integer
      from public.delivery_invitations di
      where di.comercio_id = v_row.comercio_id
        and di.status = 'completed'
        and regexp_replace(coalesce(di.invited_phone, ''), '\D', '', 'g') = v_row.normalized_phone
    ) as completed_orders_count,
    v_row.created_at,
    v_row.updated_at;
end;
$$;

revoke all on function public.upsert_delivery_courier(uuid, text, text, text) from public, anon;
grant execute on function public.upsert_delivery_courier(uuid, text, text, text) to authenticated, service_role;