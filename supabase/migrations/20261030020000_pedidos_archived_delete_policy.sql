-- Allow permanent delete only for archived orders by merchant admins/owners.
grant delete on table public.pedidos to authenticated;

drop policy if exists "pedidos_member_delete_archived" on public.pedidos;
create policy "pedidos_member_delete_archived"
  on public.pedidos
  for delete
  to authenticated
  using (
    archived_at is not null
    and (
      public.comercio_has_role(
        comercio_id,
        array['administrador']::text[]
      )
      or exists (
        select 1
        from public.comercios c
        where c.id = pedidos.comercio_id
          and c.owner_id = auth.uid()
      )
    )
  );
