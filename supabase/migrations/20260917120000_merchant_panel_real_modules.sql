-- Merchant panel: hours, analytics, staff, and owner-readable AI credit history.
-- Additive. Does not drop existing owner policies.
-- Rollback: restore from backup. Do not DROP horarios in prod (data loss).
-- Tenant gate: is_comercio_owner = authenticated uid owns the row.
-- Staff gate: is_comercio_member / comercio_has_role (owner OR active member role).

create or replace function public.is_comercio_owner(target_comercio_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select
    auth.uid() is not null
    and exists (
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

revoke all on function public.is_comercio_owner(uuid) from public, anon;
revoke all on function public.is_owner_of_comercio(uuid) from public, anon;
grant execute on function public.is_comercio_owner(uuid) to authenticated, service_role;
grant execute on function public.is_owner_of_comercio(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 1) Business hours on comercios
-- ---------------------------------------------------------------------------
alter table public.comercios
  add column if not exists horarios jsonb not null default '{}'::jsonb;

comment on column public.comercios.horarios is
  'Weekly schedule: {timezone, days: {monday: {open, ranges:[{start,end}]}}}';

-- ---------------------------------------------------------------------------
-- 2) Public menu analytics
-- ---------------------------------------------------------------------------
create table if not exists public.menu_analytics_events (
  id uuid primary key default gen_random_uuid(),
  comercio_id uuid not null references public.comercios(id) on delete cascade,
  event_type text not null check (event_type in ('menu_view', 'qr_scan')),
  origin text,
  device text,
  created_at timestamptz not null default now()
);

create index if not exists menu_analytics_events_comercio_created_idx
  on public.menu_analytics_events (comercio_id, created_at desc);

create index if not exists menu_analytics_events_comercio_type_created_idx
  on public.menu_analytics_events (comercio_id, event_type, created_at desc);

alter table public.menu_analytics_events enable row level security;
alter table public.menu_analytics_events force row level security;

revoke all on table public.menu_analytics_events from public;
revoke all on table public.menu_analytics_events from anon;
grant select on table public.menu_analytics_events to authenticated;
grant all on table public.menu_analytics_events to service_role;

-- ---------------------------------------------------------------------------
-- 3) Staff / team
-- ---------------------------------------------------------------------------
create table if not exists public.comercio_members (
  id uuid primary key default gen_random_uuid(),
  comercio_id uuid not null references public.comercios(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('administrador', 'caja', 'cocina', 'marketing')),
  status text not null default 'active' check (status in ('active', 'disabled')),
  invited_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (comercio_id, user_id)
);

create table if not exists public.comercio_member_invites (
  id uuid primary key default gen_random_uuid(),
  comercio_id uuid not null references public.comercios(id) on delete cascade,
  email text not null,
  role text not null check (role in ('administrador', 'caja', 'cocina', 'marketing')),
  token text not null unique,
  invited_by uuid references auth.users(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked')),
  created_at timestamptz not null default now(),
  accepted_at timestamptz
);

create index if not exists comercio_members_user_idx
  on public.comercio_members (user_id)
  where status = 'active';

create unique index if not exists comercio_member_invites_pending_email_idx
  on public.comercio_member_invites (comercio_id, lower(email))
  where status = 'pending';

alter table public.comercio_members enable row level security;
alter table public.comercio_members force row level security;
alter table public.comercio_member_invites enable row level security;
alter table public.comercio_member_invites force row level security;

revoke all on table public.comercio_members from public, anon;
revoke all on table public.comercio_member_invites from public, anon;
grant select on table public.comercio_members to authenticated;
grant select on table public.comercio_member_invites to authenticated;
grant all on table public.comercio_members to service_role;
grant all on table public.comercio_member_invites to service_role;

-- ---------------------------------------------------------------------------
-- 4) Membership helpers (SECURITY DEFINER so RLS can call them without recursion)
-- ---------------------------------------------------------------------------
create or replace function public.is_comercio_member(target_comercio_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    exists (
      select 1
      from public.comercios c
      where c.id = target_comercio_id
        and c.owner_id = auth.uid()
    )
    or exists (
      select 1
      from public.comercio_members m
      where m.comercio_id = target_comercio_id
        and m.user_id = auth.uid()
        and m.status = 'active'
    );
$$;

create or replace function public.comercio_has_role(
  target_comercio_id uuid,
  allowed_roles text[]
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    exists (
      select 1
      from public.comercios c
      where c.id = target_comercio_id
        and c.owner_id = auth.uid()
    )
    or exists (
      select 1
      from public.comercio_members m
      where m.comercio_id = target_comercio_id
        and m.user_id = auth.uid()
        and m.status = 'active'
        and m.role = any (coalesce(allowed_roles, '{}'::text[]))
    );
$$;

revoke all on function public.is_comercio_member(uuid) from public, anon;
revoke all on function public.comercio_has_role(uuid, text[]) from public, anon;
grant execute on function public.is_comercio_member(uuid) to authenticated, service_role;
grant execute on function public.comercio_has_role(uuid, text[]) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5) RLS for new tables + extra member access on existing tables
-- ---------------------------------------------------------------------------
drop policy if exists "menu_analytics_member_select" on public.menu_analytics_events;
create policy "menu_analytics_member_select"
  on public.menu_analytics_events
  for select
  to authenticated
  using (public.is_comercio_member(comercio_id));

drop policy if exists "comercio_members_self_or_admin_select" on public.comercio_members;
create policy "comercio_members_self_or_admin_select"
  on public.comercio_members
  for select
  to authenticated
  using (
    user_id = auth.uid()
    or public.comercio_has_role(comercio_id, array['administrador']::text[])
  );

drop policy if exists "comercio_invites_admin_select" on public.comercio_member_invites;
create policy "comercio_invites_admin_select"
  on public.comercio_member_invites
  for select
  to authenticated
  using (public.comercio_has_role(comercio_id, array['administrador']::text[]));

drop policy if exists "comercios_member_select" on public.comercios;
create policy "comercios_member_select"
  on public.comercios
  for select
  to authenticated
  using (public.is_comercio_member(id));

drop policy if exists "comercios_member_update_admin" on public.comercios;
create policy "comercios_member_update_admin"
  on public.comercios
  for update
  to authenticated
  using (public.comercio_has_role(id, array['administrador']::text[]))
  with check (public.comercio_has_role(id, array['administrador']::text[]));

drop policy if exists "pedidos_member_select" on public.pedidos;
create policy "pedidos_member_select"
  on public.pedidos
  for select
  to authenticated
  using (public.is_comercio_member(comercio_id));

drop policy if exists "pedidos_member_update" on public.pedidos;
create policy "pedidos_member_update"
  on public.pedidos
  for update
  to authenticated
  using (
    public.comercio_has_role(
      comercio_id,
      array['administrador', 'caja', 'cocina']::text[]
    )
  )
  with check (
    public.comercio_has_role(
      comercio_id,
      array['administrador', 'caja', 'cocina']::text[]
    )
  );

drop policy if exists "categorias_member_select" on public.categorias;
create policy "categorias_member_select"
  on public.categorias for select to authenticated
  using (public.is_comercio_member(comercio_id));

drop policy if exists "categorias_member_insert" on public.categorias;
create policy "categorias_member_insert"
  on public.categorias for insert to authenticated
  with check (public.comercio_has_role(comercio_id, array['administrador']::text[]));

drop policy if exists "categorias_member_update" on public.categorias;
create policy "categorias_member_update"
  on public.categorias for update to authenticated
  using (public.comercio_has_role(comercio_id, array['administrador']::text[]))
  with check (public.comercio_has_role(comercio_id, array['administrador']::text[]));

drop policy if exists "categorias_member_delete" on public.categorias;
create policy "categorias_member_delete"
  on public.categorias for delete to authenticated
  using (public.comercio_has_role(comercio_id, array['administrador']::text[]));

drop policy if exists "productos_member_select" on public.productos;
create policy "productos_member_select"
  on public.productos for select to authenticated
  using (public.is_comercio_member(comercio_id));

drop policy if exists "productos_member_insert" on public.productos;
create policy "productos_member_insert"
  on public.productos for insert to authenticated
  with check (public.comercio_has_role(comercio_id, array['administrador']::text[]));

drop policy if exists "productos_member_update" on public.productos;
create policy "productos_member_update"
  on public.productos for update to authenticated
  using (public.comercio_has_role(comercio_id, array['administrador']::text[]))
  with check (public.comercio_has_role(comercio_id, array['administrador']::text[]));

drop policy if exists "productos_member_delete" on public.productos;
create policy "productos_member_delete"
  on public.productos for delete to authenticated
  using (public.comercio_has_role(comercio_id, array['administrador']::text[]));

drop policy if exists "catalogos_member_select" on public.catalogos;
create policy "catalogos_member_select"
  on public.catalogos for select to authenticated
  using (public.is_comercio_member(comercio_id));

-- AI credits: owners/admins may read their own ledger (writes stay service_role RPCs)
drop policy if exists "ai_credits_wallet_member_select" on public.ai_credits_wallet;
create policy "ai_credits_wallet_member_select"
  on public.ai_credits_wallet
  for select
  to authenticated
  using (public.is_comercio_member(commerce_id));

drop policy if exists "ai_credits_tx_member_select" on public.ai_credits_transactions;
create policy "ai_credits_tx_member_select"
  on public.ai_credits_transactions
  for select
  to authenticated
  using (public.is_comercio_member(commerce_id));

grant select on table public.ai_credits_wallet to authenticated;
grant select on table public.ai_credits_transactions to authenticated;

-- ---------------------------------------------------------------------------
-- 6) Analytics summary RPC
-- ---------------------------------------------------------------------------
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
  v_orders bigint := 0;
  v_visits_by_day jsonb := '[]'::jsonb;
  v_orders_by_day jsonb := '[]'::jsonb;
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

  select count(*) into v_orders
  from public.pedidos p
  where p.comercio_id = p_comercio_id
    and p.created_at >= v_since
    and coalesce(p.estado::text, '') <> 'cancelado';

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
    from generate_series((now() at time zone 'America/Caracas')::date - (6), (now() at time zone 'America/Caracas')::date, interval '1 day') gs
  ) days
  left join (
    select ((e.created_at at time zone 'America/Caracas')::date) as day, count(*)::int as cnt
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
    from generate_series((now() at time zone 'America/Caracas')::date - (6), (now() at time zone 'America/Caracas')::date, interval '1 day') gs
  ) days
  left join (
    select ((p.created_at at time zone 'America/Caracas')::date) as day, count(*)::int as cnt
    from public.pedidos p
    where p.comercio_id = p_comercio_id
      and p.created_at >= (now() - interval '7 days')
      and coalesce(p.estado::text, '') <> 'cancelado'
    group by 1
  ) counts on counts.day = days.day;

  return jsonb_build_object(
    'visits', v_visits,
    'scans', v_scans,
    'orders', v_orders,
    'conversion', case
      when v_visits > 0 then round((v_orders::numeric / v_visits::numeric) * 100, 1)
      else 0
    end,
    'visits_by_day', v_visits_by_day,
    'orders_by_day', v_orders_by_day
  );
end;
$$;

revoke all on function public.get_menu_analytics_summary(uuid, integer) from public, anon;
grant execute on function public.get_menu_analytics_summary(uuid, integer) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 7) Staff RPCs
-- ---------------------------------------------------------------------------
create or replace function public.invite_comercio_member(
  p_comercio_id uuid,
  p_email text,
  p_role text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_role text := lower(trim(coalesce(p_role, '')));
  v_existing uuid;
  v_invite public.comercio_member_invites;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if not public.comercio_has_role(p_comercio_id, array['administrador']::text[]) then
    raise exception 'not authorized';
  end if;
  if v_email !~ '^[^@]+@[^@]+\.[^@]+$' then
    raise exception 'invalid email';
  end if;
  if v_role not in ('administrador', 'caja', 'cocina', 'marketing') then
    raise exception 'invalid role';
  end if;

  select u.id into v_existing
  from auth.users u
  where lower(u.email) = v_email
  limit 1;

  if v_existing is not null then
    if exists (
      select 1 from public.comercios c
      where c.id = p_comercio_id and c.owner_id = v_existing
    ) then
      raise exception 'El propietario ya tiene acceso a este negocio.';
    end if;

    insert into public.comercio_members (
      comercio_id, user_id, role, status, invited_by
    )
    values (
      p_comercio_id, v_existing, v_role, 'active', auth.uid()
    )
    on conflict (comercio_id, user_id) do update
      set role = excluded.role,
          status = 'active',
          updated_at = now();

    update public.comercio_member_invites
    set status = 'accepted', accepted_at = now()
    where comercio_id = p_comercio_id
      and lower(email) = v_email
      and status = 'pending';

    return jsonb_build_object('status', 'active', 'email', v_email, 'role', v_role);
  end if;

  update public.comercio_member_invites
  set role = v_role,
      token = encode(gen_random_bytes(24), 'hex'),
      status = 'pending',
      invited_by = auth.uid(),
      accepted_at = null
  where comercio_id = p_comercio_id
    and lower(email) = v_email
    and status = 'pending'
  returning * into v_invite;

  if v_invite.id is null then
    insert into public.comercio_member_invites (
      comercio_id, email, role, token, invited_by, status
    )
    values (
      p_comercio_id,
      v_email,
      v_role,
      encode(gen_random_bytes(24), 'hex'),
      auth.uid(),
      'pending'
    )
    returning * into v_invite;
  end if;

  return jsonb_build_object(
    'status', 'pending',
    'email', v_email,
    'role', v_role,
    'invite_id', v_invite.id
  );
end;
$$;

create or replace function public.accept_pending_comercio_invites()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_count integer := 0;
  r record;
begin
  if auth.uid() is null then
    return 0;
  end if;

  select lower(email) into v_email
  from auth.users
  where id = auth.uid();

  if v_email is null or v_email = '' then
    return 0;
  end if;

  for r in
    select *
    from public.comercio_member_invites
    where status = 'pending'
      and lower(email) = v_email
  loop
    insert into public.comercio_members (
      comercio_id, user_id, role, status, invited_by
    )
    values (
      r.comercio_id, auth.uid(), r.role, 'active', r.invited_by
    )
    on conflict (comercio_id, user_id) do update
      set role = excluded.role,
          status = 'active',
          updated_at = now();

    update public.comercio_member_invites
    set status = 'accepted', accepted_at = now()
    where id = r.id;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

create or replace function public.revoke_comercio_member(
  p_comercio_id uuid,
  p_member_id uuid default null,
  p_invite_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if not public.comercio_has_role(p_comercio_id, array['administrador']::text[]) then
    raise exception 'not authorized';
  end if;

  if p_member_id is not null then
    update public.comercio_members
    set status = 'disabled', updated_at = now()
    where id = p_member_id
      and comercio_id = p_comercio_id
      and user_id <> auth.uid();
  end if;

  if p_invite_id is not null then
    update public.comercio_member_invites
    set status = 'revoked'
    where id = p_invite_id
      and comercio_id = p_comercio_id
      and status = 'pending';
  end if;
end;
$$;

create or replace function public.list_comercio_team(p_comercio_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_owner jsonb;
  v_members jsonb;
  v_invites jsonb;
begin
  if auth.uid() is null or not public.is_comercio_member(p_comercio_id) then
    raise exception 'not authorized';
  end if;

  select jsonb_build_object(
    'kind', 'owner',
    'user_id', c.owner_id,
    'email', u.email,
    'role', 'administrador',
    'status', 'active'
  )
  into v_owner
  from public.comercios c
  left join auth.users u on u.id = c.owner_id
  where c.id = p_comercio_id;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'kind', 'member',
      'id', m.id,
      'user_id', m.user_id,
      'email', u.email,
      'role', m.role,
      'status', m.status
    )
    order by m.created_at
  ), '[]'::jsonb)
  into v_members
  from public.comercio_members m
  left join auth.users u on u.id = m.user_id
  where m.comercio_id = p_comercio_id
    and m.status = 'active';

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'kind', 'invite',
      'id', i.id,
      'email', i.email,
      'role', i.role,
      'status', i.status
    )
    order by i.created_at
  ), '[]'::jsonb)
  into v_invites
  from public.comercio_member_invites i
  where i.comercio_id = p_comercio_id
    and i.status = 'pending';

  return jsonb_build_object(
    'owner', v_owner,
    'members', v_members,
    'invites', v_invites
  );
end;
$$;

revoke all on function public.invite_comercio_member(uuid, text, text) from public, anon;
revoke all on function public.accept_pending_comercio_invites() from public, anon;
revoke all on function public.revoke_comercio_member(uuid, uuid, uuid) from public, anon;
revoke all on function public.list_comercio_team(uuid) from public, anon;
grant execute on function public.invite_comercio_member(uuid, text, text) to authenticated, service_role;
grant execute on function public.accept_pending_comercio_invites() to authenticated, service_role;
grant execute on function public.revoke_comercio_member(uuid, uuid, uuid) to authenticated, service_role;
grant execute on function public.list_comercio_team(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 8) Marketing staff can manage upsell tools
-- ---------------------------------------------------------------------------
drop policy if exists "upsell_settings_member_select" on public.upsell_settings;
create policy "upsell_settings_member_select"
  on public.upsell_settings for select to authenticated
  using (public.is_comercio_member(comercio_id));
drop policy if exists "upsell_settings_member_write" on public.upsell_settings;
create policy "upsell_settings_member_write"
  on public.upsell_settings for all to authenticated
  using (public.comercio_has_role(comercio_id, array['administrador','marketing']::text[]))
  with check (public.comercio_has_role(comercio_id, array['administrador','marketing']::text[]));

drop policy if exists "upsell_rules_member_select" on public.upsell_rules;
create policy "upsell_rules_member_select"
  on public.upsell_rules for select to authenticated
  using (public.is_comercio_member(comercio_id));
drop policy if exists "upsell_rules_member_write" on public.upsell_rules;
create policy "upsell_rules_member_write"
  on public.upsell_rules for all to authenticated
  using (public.comercio_has_role(comercio_id, array['administrador','marketing']::text[]))
  with check (public.comercio_has_role(comercio_id, array['administrador','marketing']::text[]));

drop policy if exists "bundles_member_select" on public.bundles;
create policy "bundles_member_select"
  on public.bundles for select to authenticated
  using (public.is_comercio_member(comercio_id));
drop policy if exists "bundles_member_write" on public.bundles;
create policy "bundles_member_write"
  on public.bundles for all to authenticated
  using (public.comercio_has_role(comercio_id, array['administrador','marketing']::text[]))
  with check (public.comercio_has_role(comercio_id, array['administrador','marketing']::text[]));
