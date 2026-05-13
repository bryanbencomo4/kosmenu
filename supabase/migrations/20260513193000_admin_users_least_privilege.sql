drop policy if exists admin_users_select_active_admins on public.admin_users;
drop policy if exists admin_users_select_self_or_super_admin on public.admin_users;

create policy admin_users_select_self_or_super_admin
on public.admin_users
for select
to authenticated
using (
  public.current_admin_role() = 'super_admin'
  or (
    public.is_active_admin()
    and auth_user_id = auth.uid()
  )
);