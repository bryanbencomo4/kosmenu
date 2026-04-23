create extension if not exists pgcrypto;

create table if not exists public.delivery_invitations (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references public.pedidos(id) on delete cascade,
  order_id text not null,
  comercio_id uuid not null references public.comercios(id) on delete cascade,
  token_hash text not null unique,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'arrived', 'completed', 'expired', 'revoked')),
  invited_phone text,
  invited_note text,
  invited_by uuid,
  accepted_by_name text,
  accepted_at timestamptz,
  arrived_at timestamptz,
  completed_at timestamptz,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  last_seen_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.delivery_invitation_events (
  id bigserial primary key,
  invitation_id uuid not null references public.delivery_invitations(id) on delete cascade,
  pedido_id uuid not null references public.pedidos(id) on delete cascade,
  order_id text not null,
  event_type text not null,
  actor text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_delivery_invitations_order_id
  on public.delivery_invitations(order_id);

create index if not exists idx_delivery_invitations_pedido_id
  on public.delivery_invitations(pedido_id);

create index if not exists idx_delivery_invitations_status
  on public.delivery_invitations(status);

create index if not exists idx_delivery_invitations_expires_at
  on public.delivery_invitations(expires_at);

create index if not exists idx_delivery_events_order_id
  on public.delivery_invitation_events(order_id);

create unique index if not exists ux_delivery_invites_active_order
  on public.delivery_invitations(pedido_id)
  where status in ('accepted', 'arrived');

create or replace function public.set_delivery_invitation_updated_at()
returns trigger
language plpgsql
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
begin
  insert into public.delivery_invitation_events (
    invitation_id,
    pedido_id,
    order_id,
    event_type,
    actor,
    payload
  )
  values (
    p_invitation_id,
    p_pedido_id,
    p_order_id,
    p_event_type,
    nullif(trim(coalesce(p_actor, '')), ''),
    coalesce(p_payload, '{}'::jsonb)
  );
end;
$$;

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

  select
    p.id,
    p.comercio_id,
    lower(coalesce(p.estado::text, 'pendiente')),
    lower(coalesce(p.detalles -> 'delivery' ->> 'mode', 'pickup')),
    c.owner_id
  into
    v_pedido_id,
    v_comercio_id,
    v_estado,
    v_delivery_mode,
    v_owner_id
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

  if v_estado in ('cancelado', 'entregado') then
    raise exception 'ORDER_NOT_ASSIGNABLE' using errcode = '22023';
  end if;

  v_exp_minutes := greatest(5, least(coalesce(p_expires_in_minutes, 180), 1440));
  v_expires_at := now() + make_interval(mins => v_exp_minutes);

  update public.delivery_invitations
  set
    status = 'revoked',
    revoked_at = now(),
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('reason', 'regen')
  where pedido_id = v_pedido_id
    and status in ('pending');

  v_token := rtrim(replace(replace(translate(encode(gen_random_bytes(24), 'base64'), E'\n', ''), '+', '-'), '/', '_'), '=');
  v_token_hash := encode(digest(v_token, 'sha256'), 'hex');

  insert into public.delivery_invitations (
    pedido_id,
    order_id,
    comercio_id,
    token_hash,
    status,
    invited_phone,
    invited_note,
    invited_by,
    expires_at
  )
  values (
    v_pedido_id,
    v_order_id,
    v_comercio_id,
    v_token_hash,
    'pending',
    nullif(trim(coalesce(p_phone, '')), ''),
    nullif(trim(coalesce(p_note, '')), ''),
    v_actor,
    v_expires_at
  )
  returning id into v_invitation_id;

  update public.pedidos
  set detalles = jsonb_set(
    coalesce(detalles, '{}'::jsonb),
    '{delivery_delegate}',
    jsonb_build_object(
      'invitation_id', v_invitation_id,
      'status', 'pending',
      'invited_phone', nullif(trim(coalesce(p_phone, '')), ''),
      'invited_note', nullif(trim(coalesce(p_note, '')), ''),
      'expires_at', v_expires_at,
      'updated_at', now()
    ),
    true
  )
  where id = v_pedido_id;

  perform public.log_delivery_invitation_event(
    v_invitation_id,
    v_pedido_id,
    v_order_id,
    'created',
    coalesce(v_actor::text, 'system'),
    jsonb_build_object('expires_at', v_expires_at)
  );

  return query
  select
    v_invitation_id,
    v_token,
    v_order_id,
    v_expires_at,
    'pending'::text;
end;
$$;

create or replace function public.revoke_delivery_invitation(
  p_order_id text
)
returns table (
  revoked boolean,
  invitation_id uuid,
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
  v_owner_id uuid;
  v_target public.delivery_invitations%rowtype;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  v_order_id := trim(coalesce(p_order_id, ''));
  if v_order_id = '' then
    raise exception 'ORDER_ID_REQUIRED' using errcode = '22023';
  end if;

  select p.id, c.owner_id
  into v_pedido_id, v_owner_id
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

  select *
  into v_target
  from public.delivery_invitations
  where pedido_id = v_pedido_id
    and status in ('pending', 'accepted', 'arrived')
  order by created_at desc
  limit 1;

  if v_target.id is null then
    return query select false, null::uuid, 'none'::text;
    return;
  end if;

  update public.delivery_invitations
  set
    status = 'revoked',
    revoked_at = now(),
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('reason', 'manual')
  where id = v_target.id;

  update public.pedidos
  set detalles = jsonb_set(
    coalesce(detalles, '{}'::jsonb),
    '{delivery_delegate}',
    jsonb_build_object(
      'invitation_id', v_target.id,
      'status', 'revoked',
      'updated_at', now()
    ),
    true
  )
  where id = v_pedido_id;

  perform public.log_delivery_invitation_event(
    v_target.id,
    v_target.pedido_id,
    v_target.order_id,
    'revoked',
    coalesce(v_actor::text, 'system'),
    '{}'::jsonb
  );

  return query select true, v_target.id, 'revoked'::text;
end;
$$;

alter table public.delivery_invitations enable row level security;
alter table public.delivery_invitation_events enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'delivery_invitations'
      and policyname = 'delivery_invitations_select_owner'
  ) then
    create policy "delivery_invitations_select_owner"
    on public.delivery_invitations
    for select
    using (
      exists (
        select 1
        from public.pedidos p
        join public.comercios c on c.id = p.comercio_id
        where p.id = delivery_invitations.pedido_id
          and c.owner_id = auth.uid()
      )
    );
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'delivery_invitation_events'
      and policyname = 'delivery_events_select_owner'
  ) then
    create policy "delivery_events_select_owner"
    on public.delivery_invitation_events
    for select
    using (
      exists (
        select 1
        from public.pedidos p
        join public.comercios c on c.id = p.comercio_id
        where p.id = delivery_invitation_events.pedido_id
          and c.owner_id = auth.uid()
      )
    );
  end if;
end
$$;

grant execute on function public.create_delivery_invitation(text, integer, text, text) to authenticated;
grant execute on function public.revoke_delivery_invitation(text) to authenticated;
