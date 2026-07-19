-- PREVIEW BOOTSTRAP ONLY
-- DO NOT APPLY TO PRODUCTION
-- Allowed project ref: gsfxqzvmyzjjgpigrste
-- Forbidden project ref: qqhberaayhohxlbbhdyi

-- Owner helpers (NOT security definer)
create or replace function public.is_comercio_owner(target_comercio_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select exists (
    select 1
    from public.comercios c
    where c.id = target_comercio_id
      and c.owner_id = auth.uid()
  );
$$;

create or replace function public.is_owner_of_comercio(p_comercio_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select public.is_comercio_owner(p_comercio_id);
$$;

create or replace function public.set_delivery_invitation_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_delivery_invitation_updated_at on public.delivery_invitations;
create trigger trg_delivery_invitation_updated_at
before update on public.delivery_invitations
for each row execute function public.set_delivery_invitation_updated_at();

-- Hardened event logger (from 2A.3) — no arbitrary client events
create or replace function public.log_delivery_invitation_event(
  p_invitation_id uuid,
  p_pedido_id uuid,
  p_order_id text,
  p_event_type text,
  p_actor text,
  p_payload jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event text;
  v_inv_pedido_id uuid;
  v_inv_order_id text;
  v_inv_comercio_id uuid;
  v_pedido_comercio_id uuid;
  v_allowed boolean := false;
begin
  v_event := lower(trim(coalesce(p_event_type, '')));
  if v_event not in (
    'created','accepted','declined','revoked','expired','arrived','completed','viewed','status_changed'
  ) then
    raise exception 'EVENT_TYPE_NOT_ALLOWED' using errcode = '22023';
  end if;

  if p_invitation_id is null or p_pedido_id is null then
    raise exception 'INVITATION_OR_PEDIDO_REQUIRED' using errcode = '22023';
  end if;

  select i.pedido_id, i.order_id, p.comercio_id
  into v_inv_pedido_id, v_inv_order_id, v_inv_comercio_id
  from public.delivery_invitations i
  inner join public.pedidos p on p.id = i.pedido_id
  where i.id = p_invitation_id
  limit 1;

  if v_inv_pedido_id is null then
    raise exception 'INVITATION_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_inv_pedido_id <> p_pedido_id then
    raise exception 'INVITATION_PEDIDO_MISMATCH' using errcode = '22023';
  end if;
  if trim(coalesce(p_order_id, '')) <> ''
     and trim(coalesce(v_inv_order_id, '')) <> ''
     and trim(p_order_id) <> trim(v_inv_order_id) then
    raise exception 'INVITATION_ORDER_MISMATCH' using errcode = '22023';
  end if;

  select p.comercio_id into v_pedido_comercio_id
  from public.pedidos p where p.id = p_pedido_id limit 1;

  if v_pedido_comercio_id is null then
    raise exception 'PEDIDO_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_inv_comercio_id is distinct from v_pedido_comercio_id then
    raise exception 'COMERCIO_MISMATCH' using errcode = '22023';
  end if;

  if auth.uid() is not null then
    select exists (
      select 1 from public.comercios c
      where c.id = v_pedido_comercio_id and c.owner_id = auth.uid()
    ) into v_allowed;
    if not coalesce(v_allowed, false) then
      raise exception 'EVENT_FORBIDDEN' using errcode = '42501';
    end if;
  end if;

  insert into public.delivery_invitation_events (
    invitation_id, pedido_id, order_id, event_type, actor, payload
  ) values (
    p_invitation_id, p_pedido_id,
    nullif(trim(coalesce(p_order_id, '')), ''),
    v_event,
    nullif(trim(coalesce(p_actor, '')), ''),
    coalesce(p_payload, '{}'::jsonb)
  );
end;
$$;

-- Delivery invite create/revoke (owner-authorized SECURITY DEFINER)
create or replace function public.create_delivery_invitation(
  p_order_id text,
  p_expires_in_minutes integer default 180,
  p_phone text default null,
  p_note text default null
)
returns table (
  invitation_id uuid,
  token text,
  order_id text,
  expires_at timestamptz,
  status text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;
  v_order_id text;
  v_pedido_id uuid;
  v_comercio_id uuid;
  v_owner_id uuid;
  v_estado text;
  v_delivery_mode text;
  v_exp_minutes integer;
  v_token text;
  v_token_hash text;
  v_expires_at timestamptz;
  v_invitation_id uuid;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  v_order_id := trim(coalesce(p_order_id, ''));
  if v_order_id = '' then
    raise exception 'ORDER_ID_REQUIRED' using errcode = '22023';
  end if;

  select p.id, p.comercio_id, lower(coalesce(p.estado::text, 'pendiente')),
         lower(coalesce(p.detalles -> 'delivery' ->> 'mode', 'pickup')), c.owner_id
  into v_pedido_id, v_comercio_id, v_estado, v_delivery_mode, v_owner_id
  from public.pedidos p
  inner join public.comercios c on c.id = p.comercio_id
  where coalesce(p.detalles ->> 'order_id', p.detalles ->> 'codigo_orden') = v_order_id
  order by p.created_at desc
  limit 1;

  if v_pedido_id is null then
    raise exception 'ORDER_NOT_FOUND' using errcode = 'P0002';
  end if;
  if coalesce(v_owner_id, '00000000-0000-0000-0000-000000000000'::uuid) <> v_actor then
    raise exception 'ORDER_FORBIDDEN' using errcode = '42501';
  end if;
  if v_delivery_mode <> 'delivery' then
    raise exception 'ORDER_NOT_DELIVERY' using errcode = '22023';
  end if;

  v_exp_minutes := greatest(coalesce(p_expires_in_minutes, 180), 15);
  v_token := encode(extensions.gen_random_bytes(24), 'hex');
  v_token_hash := encode(extensions.digest(v_token, 'sha256'), 'hex');
  v_expires_at := now() + make_interval(mins => v_exp_minutes);

  update public.delivery_invitations
  set status = 'revoked', revoked_at = now(), updated_at = now()
  where pedido_id = v_pedido_id and status = 'pending';

  insert into public.delivery_invitations (
    pedido_id, order_id, comercio_id, token_hash, status,
    invited_phone, invited_note, invited_by, expires_at
  ) values (
    v_pedido_id, v_order_id, v_comercio_id, v_token_hash, 'pending',
    nullif(trim(coalesce(p_phone, '')), ''),
    nullif(trim(coalesce(p_note, '')), ''),
    v_actor, v_expires_at
  ) returning id into v_invitation_id;

  perform public.log_delivery_invitation_event(
    v_invitation_id, v_pedido_id, v_order_id, 'created', v_actor::text, '{}'::jsonb
  );

  return query select v_invitation_id, v_token, v_order_id, v_expires_at, 'pending'::text;
end;
$$;

create or replace function public.revoke_delivery_invitation(p_order_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;
  v_pedido_id uuid;
  v_owner_id uuid;
  v_invitation_id uuid;
  v_order_id text;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;
  v_order_id := trim(coalesce(p_order_id, ''));

  select p.id, c.owner_id into v_pedido_id, v_owner_id
  from public.pedidos p
  inner join public.comercios c on c.id = p.comercio_id
  where coalesce(p.detalles ->> 'order_id', p.detalles ->> 'codigo_orden') = v_order_id
  order by p.created_at desc
  limit 1;

  if v_pedido_id is null then
    raise exception 'ORDER_NOT_FOUND' using errcode = 'P0002';
  end if;
  if coalesce(v_owner_id, '00000000-0000-0000-0000-000000000000'::uuid) <> v_actor then
    raise exception 'ORDER_FORBIDDEN' using errcode = '42501';
  end if;

  select id into v_invitation_id
  from public.delivery_invitations
  where pedido_id = v_pedido_id and status = 'pending'
  order by created_at desc
  limit 1;

  if v_invitation_id is null then
    return;
  end if;

  update public.delivery_invitations
  set status = 'revoked', revoked_at = now(), updated_at = now()
  where id = v_invitation_id;

  perform public.log_delivery_invitation_event(
    v_invitation_id, v_pedido_id, v_order_id, 'revoked', v_actor::text, '{}'::jsonb
  );
end;
$$;

-- Courier RPCs (owner-gated)
create or replace function public.upsert_delivery_courier(
  p_comercio_id uuid, p_alias text, p_phone_e164 text, p_normalized_phone text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_owner uuid;
  v_id uuid;
begin
  if v_actor is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  select owner_id into v_owner from public.comercios where id = p_comercio_id;
  if v_owner is null or v_owner <> v_actor then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  insert into public.delivery_couriers (comercio_id, alias, phone_e164, normalized_phone, created_by)
  values (p_comercio_id, trim(p_alias), trim(p_phone_e164), trim(p_normalized_phone), v_actor)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.list_delivery_couriers(
  p_comercio_id uuid, p_query text default null, p_limit integer default 50
)
returns setof public.delivery_couriers
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_owner uuid;
begin
  if v_actor is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  select owner_id into v_owner from public.comercios where id = p_comercio_id;
  if v_owner is null or v_owner <> v_actor then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  return query
  select *
  from public.delivery_couriers dc
  where dc.comercio_id = p_comercio_id
    and dc.is_active = true
    and (
      p_query is null or trim(p_query) = ''
      or dc.alias ilike '%' || trim(p_query) || '%'
      or dc.normalized_phone ilike '%' || trim(p_query) || '%'
    )
  order by dc.last_used_at desc nulls last, dc.created_at desc
  limit greatest(coalesce(p_limit, 50), 1);
end;
$$;

create or replace function public.deactivate_delivery_courier(p_courier_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_comercio uuid;
  v_owner uuid;
begin
  if v_actor is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  select comercio_id into v_comercio from public.delivery_couriers where id = p_courier_id;
  select owner_id into v_owner from public.comercios where id = v_comercio;
  if v_owner is null or v_owner <> v_actor then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  update public.delivery_couriers set is_active = false, updated_at = now() where id = p_courier_id;
end;
$$;

create or replace function public.touch_delivery_courier_last_used(p_courier_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_comercio uuid;
  v_owner uuid;
begin
  if v_actor is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  select comercio_id into v_comercio from public.delivery_couriers where id = p_courier_id;
  select owner_id into v_owner from public.comercios where id = v_comercio;
  if v_owner is null or v_owner <> v_actor then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  update public.delivery_couriers set last_used_at = now(), updated_at = now() where id = p_courier_id;
end;
$$;

create or replace function public.is_active_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admin_users au
    where au.auth_user_id = auth.uid() and au.is_active = true
  );
$$;

create or replace function public.current_admin_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select au.role from public.admin_users au
  where au.auth_user_id = auth.uid() and au.is_active = true
  limit 1;
$$;

create or replace function public.subscribe_consumer_newsletter(
  p_email text, p_source text default 'preview', p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.consumer_newsletter_subscribers as s (email, source, metadata)
  values (lower(trim(p_email)), coalesce(nullif(trim(p_source), ''), 'preview'), coalesce(p_metadata, '{}'::jsonb))
  on conflict (email) do update
  set status = 'active',
      last_subscribed_at = now(),
      updated_at = now(),
      source = excluded.source,
      metadata = coalesce(s.metadata, '{}'::jsonb) || coalesce(excluded.metadata, '{}'::jsonb);
end;
$$;
