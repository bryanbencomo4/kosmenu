-- Do not invite users who already own a restaurant account.

create or replace function public.invite_comercio_member(
  p_comercio_id uuid,
  p_email text,
  p_role text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_role text := lower(trim(coalesce(p_role, '')));
  v_existing uuid;
  v_invite public.comercio_member_invites;
  v_token text := encode(extensions.gen_random_bytes(24), 'hex');
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
      where c.owner_id = v_existing
    ) then
      raise exception 'Esta persona ya tiene una cuenta de restaurante y no puede unirse como personal.';
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
      token = v_token,
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
      v_token,
      auth.uid(),
      'pending'
    )
    returning * into v_invite;
  end if;

  return jsonb_build_object(
    'status', 'pending',
    'email', v_email,
    'role', v_role,
    'invite_id', v_invite.id,
    'token', v_invite.token
  );
end;
$$;

revoke all on function public.invite_comercio_member(uuid, text, text) from public, anon;
grant execute on function public.invite_comercio_member(uuid, text, text) to authenticated, service_role;

-- Public invite preview (token is the secret).
create or replace function public.get_staff_invite_public(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite public.comercio_member_invites;
  v_nombre text;
  v_user_id uuid;
  v_existing boolean := false;
begin
  if p_token is null or length(trim(p_token)) < 16 then
    return null;
  end if;

  select * into v_invite
  from public.comercio_member_invites
  where token = trim(p_token)
    and status = 'pending'
  limit 1;

  if v_invite.id is null then
    return null;
  end if;

  select c.nombre into v_nombre
  from public.comercios c
  where c.id = v_invite.comercio_id;

  select u.id into v_user_id
  from auth.users u
  where lower(u.email) = lower(v_invite.email)
  limit 1;

  if v_user_id is not null then
    v_existing := true;
    if exists (
      select 1 from public.comercios c where c.owner_id = v_user_id
    ) then
      return jsonb_build_object('error', 'owner');
    end if;
  end if;

  return jsonb_build_object(
    'email', lower(v_invite.email),
    'role', v_invite.role,
    'comercio_id', v_invite.comercio_id,
    'comercio_nombre', coalesce(nullif(trim(v_nombre), ''), 'el restaurante'),
    'existing_account', v_existing
  );
end;
$$;

revoke all on function public.get_staff_invite_public(text) from public;
grant execute on function public.get_staff_invite_public(text) to anon, authenticated, service_role;
