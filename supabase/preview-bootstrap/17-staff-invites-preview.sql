-- PREVIEW BOOTSTRAP ONLY — kosmenu-preview (gsfxqzvmyzjjgpigrste)
-- Staff invites table + role checks matching Flutter merchant panel.
-- Service-role can write (assistant already gates canManageStaff).

create table if not exists public.comercio_member_invites (
  id uuid primary key default gen_random_uuid(),
  comercio_id uuid not null references public.comercios(id) on delete cascade,
  email text not null,
  role text not null check (role in ('administrador', 'caja', 'cocina', 'marketing', 'mesero')),
  token text not null unique,
  invited_by uuid references auth.users(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked')),
  created_at timestamptz not null default now(),
  accepted_at timestamptz
);

create unique index if not exists comercio_member_invites_pending_email_idx
  on public.comercio_member_invites (comercio_id, lower(email))
  where status = 'pending';

-- Widen role checks if Preview still has the pre-mesero constraint.
do $$
begin
  alter table public.comercio_members drop constraint if exists comercio_members_role_check;
  alter table public.comercio_members
    add constraint comercio_members_role_check
    check (role in ('administrador', 'caja', 'cocina', 'marketing', 'mesero'));
exception when others then
  null;
end
$$;

do $$
begin
  alter table public.comercio_member_invites drop constraint if exists comercio_member_invites_role_check;
  alter table public.comercio_member_invites
    add constraint comercio_member_invites_role_check
    check (role in ('administrador', 'caja', 'cocina', 'marketing', 'mesero'));
exception when others then
  null;
end
$$;

alter table public.comercio_member_invites enable row level security;
alter table public.comercio_member_invites force row level security;

revoke all on table public.comercio_member_invites from public, anon;
grant select on table public.comercio_member_invites to authenticated;
grant all on table public.comercio_member_invites to service_role;
