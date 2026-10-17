-- Optional waiter (mesero) staff role: take assisted orders only.
-- Additive — restaurants that never invite a mesero are unchanged.

alter table public.comercio_members
  drop constraint if exists comercio_members_role_check;

alter table public.comercio_members
  add constraint comercio_members_role_check
  check (role in ('administrador', 'caja', 'cocina', 'marketing', 'mesero'));

alter table public.comercio_member_invites
  drop constraint if exists comercio_member_invites_role_check;

alter table public.comercio_member_invites
  add constraint comercio_member_invites_role_check
  check (role in ('administrador', 'caja', 'cocina', 'marketing', 'mesero'));

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
  if v_role not in ('administrador', 'caja', 'cocina', 'marketing', 'mesero') then
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

revoke all on function public.invite_comercio_member(uuid, text, text) from public, anon;
grant execute on function public.invite_comercio_member(uuid, text, text) to authenticated, service_role;

-- Mesero must not update kitchen/cashier order state (create stays on public API).
-- pedidos_member_update already omits mesero; keep that invariant explicit here.
comment on constraint comercio_members_role_check on public.comercio_members is
  'Staff roles: administrador|caja|cocina|marketing|mesero (mesero = assisted orders only).';
