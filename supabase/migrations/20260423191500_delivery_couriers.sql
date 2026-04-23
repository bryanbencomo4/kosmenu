create table if not exists public.delivery_couriers (
  id uuid primary key default gen_random_uuid(),
  comercio_id uuid not null references public.comercios(id) on delete cascade,
  alias text not null,
  phone_e164 text not null,
  normalized_phone text not null,
  created_by uuid,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists ux_delivery_couriers_comercio_phone_active
  on public.delivery_couriers(comercio_id, normalized_phone)
  where is_active = true;

create index if not exists idx_delivery_couriers_comercio_last_used
  on public.delivery_couriers(comercio_id, last_used_at desc nulls last);

create index if not exists idx_delivery_couriers_comercio_alias
  on public.delivery_couriers(comercio_id, alias);

create or replace function public.set_delivery_courier_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_delivery_courier_updated_at on public.delivery_couriers;
create trigger trg_delivery_courier_updated_at
before update on public.delivery_couriers
for each row execute function public.set_delivery_courier_updated_at();

create or replace function public.list_delivery_couriers(
  p_comercio_id uuid,
  p_query text default null,
  p_limit integer default 20
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
declare
  v_actor uuid;
  v_owner_id uuid;
  v_q text;
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

  v_q := lower(trim(coalesce(p_query, '')));

  return query
  select
    dc.id,
    dc.alias,
    dc.phone_e164,
    dc.normalized_phone,
    dc.last_used_at,
    coalesce(stats.completed_orders_count, 0)::integer as completed_orders_count,
    dc.created_at,
    dc.updated_at
  from public.delivery_couriers dc
  left join lateral (
    select count(*)::integer as completed_orders_count
    from public.delivery_invitations di
    where di.comercio_id = dc.comercio_id
      and di.status = 'completed'
      and regexp_replace(coalesce(di.invited_phone, ''), '\\D', '', 'g') = dc.normalized_phone
  ) stats on true
  where dc.comercio_id = p_comercio_id
    and dc.is_active = true
    and (
      v_q = ''
      or lower(dc.alias) like '%' || v_q || '%'
      or dc.normalized_phone like '%' || regexp_replace(v_q, '\\D', '', 'g') || '%'
      or replace(dc.phone_e164, '+', '') like '%' || regexp_replace(v_q, '\\D', '', 'g') || '%'
    )
  order by
    dc.last_used_at desc nulls last,
    stats.completed_orders_count desc,
    dc.updated_at desc
  limit greatest(1, least(coalesce(p_limit, 20), 100));
end;
$$;

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
  v_norm := regexp_replace(coalesce(p_normalized_phone, ''), '\\D', '', 'g');

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
        and regexp_replace(coalesce(di.invited_phone, ''), '\\D', '', 'g') = v_row.normalized_phone
    ) as completed_orders_count,
    v_row.created_at,
    v_row.updated_at;
end;
$$;

create or replace function public.touch_delivery_courier_last_used(
  p_courier_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;
  v_owner_id uuid;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  select c.owner_id into v_owner_id
  from public.delivery_couriers dc
  inner join public.comercios c on c.id = dc.comercio_id
  where dc.id = p_courier_id
    and dc.is_active = true;

  if v_owner_id is null then
    return false;
  end if;

  if v_owner_id <> v_actor then
    raise exception 'COURIER_FORBIDDEN' using errcode = '42501';
  end if;

  update public.delivery_couriers
  set last_used_at = now()
  where id = p_courier_id;

  return true;
end;
$$;

create or replace function public.deactivate_delivery_courier(
  p_courier_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;
  v_owner_id uuid;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  select c.owner_id into v_owner_id
  from public.delivery_couriers dc
  inner join public.comercios c on c.id = dc.comercio_id
  where dc.id = p_courier_id
    and dc.is_active = true;

  if v_owner_id is null then
    return false;
  end if;

  if v_owner_id <> v_actor then
    raise exception 'COURIER_FORBIDDEN' using errcode = '42501';
  end if;

  update public.delivery_couriers
  set is_active = false,
      updated_at = now()
  where id = p_courier_id;

  return true;
end;
$$;
