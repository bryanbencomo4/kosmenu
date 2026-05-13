create extension if not exists pgcrypto;

create table if not exists public.admin_users (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete cascade,
  email text not null unique,
  role text not null,
  is_active boolean not null default true,
  invited_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint admin_users_email_not_empty
    check (length(btrim(email)) > 3),
  constraint admin_users_email_normalized
    check (email = lower(btrim(email))),
  constraint admin_users_role_check
    check (role in ('super_admin', 'support', 'sales', 'finance', 'business_owner'))
);

create index if not exists idx_admin_users_auth_user_id
  on public.admin_users(auth_user_id);

create index if not exists idx_admin_users_role_is_active
  on public.admin_users(role, is_active);

create table if not exists public.admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid null references auth.users(id) on delete set null,
  actor_email text null,
  action text not null,
  entity_type text null,
  entity_id text null,
  old_data jsonb null,
  new_data jsonb null,
  ip_address text null,
  user_agent text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_admin_audit_logs_created_at
  on public.admin_audit_logs(created_at desc);

create index if not exists idx_admin_audit_logs_actor_user_id
  on public.admin_audit_logs(actor_user_id);

create index if not exists idx_admin_audit_logs_action
  on public.admin_audit_logs(action);

create or replace function public.set_admin_users_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_admin_users_updated_at on public.admin_users;
create trigger trg_admin_users_updated_at
before update on public.admin_users
for each row execute function public.set_admin_users_updated_at();

create or replace function public.is_active_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_users
    where auth_user_id = auth.uid()
      and is_active = true
  );
$$;

create or replace function public.current_admin_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role
  from public.admin_users
  where auth_user_id = auth.uid()
    and is_active = true
  limit 1;
$$;

alter table public.admin_users enable row level security;
alter table public.admin_audit_logs enable row level security;

drop policy if exists admin_users_select_active_admins on public.admin_users;
create policy admin_users_select_active_admins
on public.admin_users
for select
to authenticated
using (public.is_active_admin());

drop policy if exists admin_audit_logs_select_super_admin on public.admin_audit_logs;
create policy admin_audit_logs_select_super_admin
on public.admin_audit_logs
for select
to authenticated
using (public.current_admin_role() = 'super_admin');

revoke all on public.admin_users from anon;
revoke all on public.admin_users from authenticated;
revoke all on public.admin_audit_logs from anon;
revoke all on public.admin_audit_logs from authenticated;

grant select on public.admin_users to authenticated;
grant select on public.admin_audit_logs to authenticated;
grant select, insert, update, delete on public.admin_users to service_role;
grant select, insert, update, delete on public.admin_audit_logs to service_role;

revoke all on function public.is_active_admin() from public;
revoke all on function public.current_admin_role() from public;
grant execute on function public.is_active_admin() to authenticated, service_role;
grant execute on function public.current_admin_role() to authenticated, service_role;