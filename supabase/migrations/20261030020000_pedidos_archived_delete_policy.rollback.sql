drop policy if exists "pedidos_member_delete_archived" on public.pedidos;
revoke delete on table public.pedidos from authenticated;
