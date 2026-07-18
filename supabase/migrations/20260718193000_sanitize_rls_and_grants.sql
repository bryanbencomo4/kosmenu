-- LOCAL ONLY — do NOT apply remotely until Preview review.
-- Phase 2A.2: remove permissive PUBLIC/true policies, enable missing RLS,
-- revoke TRUNCATE/REFERENCES/TRIGGER and excess anon writes.
-- Idempotent where practical. Does not delete row data.

-- ---------------------------------------------------------------------------
-- 1) Drop dangerous permissive policies (qual/with_check = true, or known insert)
-- ---------------------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in
    select c.relname as tablename, p.polname as policyname
    from pg_policy p
    join pg_class c on c.oid = p.polrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = any (array[
        'pedidos', 'categorias', 'productos', 'catalogos', 'comercios', 'metodos_pago'
      ])
      and (
        coalesce(pg_get_expr(p.polqual, p.polrelid), '') = 'true'
        or coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '') = 'true'
        or p.polname = 'Public insert pedidos'
        or p.polname = 'Clientes pueden crear pedidos'
        or p.polname = 'Permitir inserción pública pedidos'
        or p.polname = 'Comercios pueden ver sus pedidos'
        or p.polname = 'Permitir actualización de pedidos para todos'
      )
  loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 2) Ensure helper ownership checks stay available to policy evaluation
-- ---------------------------------------------------------------------------
grant execute on function public.is_comercio_owner(uuid) to authenticated;
grant execute on function public.is_owner_of_comercio(uuid) to authenticated;
revoke execute on function public.is_comercio_owner(uuid) from anon, public;
revoke execute on function public.is_owner_of_comercio(uuid) from anon, public;

-- ---------------------------------------------------------------------------
-- 3) Replacement / hardened policies
-- ---------------------------------------------------------------------------

-- comercios: public read only when online; owners manage own
drop policy if exists "comercios_anon_select_online" on public.comercios;
create policy "comercios_anon_select_online"
  on public.comercios
  for select
  to anon
  using (en_linea = true);

drop policy if exists "comercios_authenticated_select_online_or_owner" on public.comercios;
create policy "comercios_authenticated_select_online_or_owner"
  on public.comercios
  for select
  to authenticated
  using (en_linea = true or owner_id = auth.uid());

-- Keep existing owner write policies if present; recreate minimal set for safety.
drop policy if exists "comercios_authenticated_insert_owner" on public.comercios;
create policy "comercios_authenticated_insert_owner"
  on public.comercios
  for insert
  to authenticated
  with check (owner_id = auth.uid());

drop policy if exists "comercios_authenticated_update_owner" on public.comercios;
create policy "comercios_authenticated_update_owner"
  on public.comercios
  for update
  to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

drop policy if exists "comercios_authenticated_delete_owner" on public.comercios;
create policy "comercios_authenticated_delete_owner"
  on public.comercios
  for delete
  to authenticated
  using (owner_id = auth.uid());

-- categorias / productos / catalogos: public read only for online commerces
drop policy if exists "categorias_anon_select_public_menu" on public.categorias;
create policy "categorias_anon_select_public_menu"
  on public.categorias
  for select
  to anon, authenticated
  using (
    coalesce(activo, true) = true
    and exists (
      select 1 from public.comercios c
      where c.id = categorias.comercio_id
        and c.en_linea = true
    )
  );

drop policy if exists "productos_anon_select_public_menu" on public.productos;
create policy "productos_anon_select_public_menu"
  on public.productos
  for select
  to anon, authenticated
  using (
    coalesce(disponible, true) = true
    and exists (
      select 1 from public.comercios c
      where c.id = productos.comercio_id
        and c.en_linea = true
    )
  );

drop policy if exists "catalogos_anon_select_public_menu" on public.catalogos;
create policy "catalogos_anon_select_public_menu"
  on public.catalogos
  for select
  to anon, authenticated
  using (
    coalesce(activo, true) = true
    and exists (
      select 1 from public.comercios c
      where c.id = catalogos.comercio_id
        and c.en_linea = true
    )
  );

-- Owner CRUD (authenticated) — avoid FOR ALL; split by command
drop policy if exists "categorias_owner_select" on public.categorias;
create policy "categorias_owner_select"
  on public.categorias for select to authenticated
  using (public.is_comercio_owner(comercio_id));

drop policy if exists "categorias_owner_insert" on public.categorias;
create policy "categorias_owner_insert"
  on public.categorias for insert to authenticated
  with check (public.is_comercio_owner(comercio_id));

drop policy if exists "categorias_owner_update" on public.categorias;
create policy "categorias_owner_update"
  on public.categorias for update to authenticated
  using (public.is_comercio_owner(comercio_id))
  with check (public.is_comercio_owner(comercio_id));

drop policy if exists "categorias_owner_delete" on public.categorias;
create policy "categorias_owner_delete"
  on public.categorias for delete to authenticated
  using (public.is_comercio_owner(comercio_id));

drop policy if exists "productos_owner_select" on public.productos;
create policy "productos_owner_select"
  on public.productos for select to authenticated
  using (public.is_comercio_owner(comercio_id));

drop policy if exists "productos_owner_insert" on public.productos;
create policy "productos_owner_insert"
  on public.productos for insert to authenticated
  with check (public.is_comercio_owner(comercio_id));

drop policy if exists "productos_owner_update" on public.productos;
create policy "productos_owner_update"
  on public.productos for update to authenticated
  using (public.is_comercio_owner(comercio_id))
  with check (public.is_comercio_owner(comercio_id));

drop policy if exists "productos_owner_delete" on public.productos;
create policy "productos_owner_delete"
  on public.productos for delete to authenticated
  using (public.is_comercio_owner(comercio_id));

drop policy if exists "catalogos_owner_select" on public.catalogos;
create policy "catalogos_owner_select"
  on public.catalogos for select to authenticated
  using (public.is_comercio_owner(comercio_id));

drop policy if exists "catalogos_owner_insert" on public.catalogos;
create policy "catalogos_owner_insert"
  on public.catalogos for insert to authenticated
  with check (public.is_comercio_owner(comercio_id));

drop policy if exists "catalogos_owner_update" on public.catalogos;
create policy "catalogos_owner_update"
  on public.catalogos for update to authenticated
  using (public.is_comercio_owner(comercio_id))
  with check (public.is_comercio_owner(comercio_id));

drop policy if exists "catalogos_owner_delete" on public.catalogos;
create policy "catalogos_owner_delete"
  on public.catalogos for delete to authenticated
  using (public.is_comercio_owner(comercio_id));

-- metodos_pago: public read for online commerces only
drop policy if exists "metodos_pago_anon_select_public_menu" on public.metodos_pago;
create policy "metodos_pago_anon_select_public_menu"
  on public.metodos_pago
  for select
  to anon, authenticated
  using (
    exists (
      select 1 from public.comercios c
      where c.id = metodos_pago.comercio_id
        and c.en_linea = true
    )
  );

drop policy if exists "metodos_pago_owner_select" on public.metodos_pago;
create policy "metodos_pago_owner_select"
  on public.metodos_pago for select to authenticated
  using (public.is_comercio_owner(comercio_id));

drop policy if exists "metodos_pago_owner_insert" on public.metodos_pago;
create policy "metodos_pago_owner_insert"
  on public.metodos_pago for insert to authenticated
  with check (public.is_comercio_owner(comercio_id));

drop policy if exists "metodos_pago_owner_update" on public.metodos_pago;
create policy "metodos_pago_owner_update"
  on public.metodos_pago for update to authenticated
  using (public.is_comercio_owner(comercio_id))
  with check (public.is_comercio_owner(comercio_id));

drop policy if exists "metodos_pago_owner_delete" on public.metodos_pago;
create policy "metodos_pago_owner_delete"
  on public.metodos_pago for delete to authenticated
  using (public.is_comercio_owner(comercio_id));

-- pedidos: NO anon access. Authenticated owners select/update only.
-- Public order creation must go through Next /api/orders (service_role).
drop policy if exists "Owners manage own pedidos" on public.pedidos;
drop policy if exists "pedidos_owner_select" on public.pedidos;
create policy "pedidos_owner_select"
  on public.pedidos
  for select
  to authenticated
  using (public.is_comercio_owner(comercio_id));

drop policy if exists "pedidos_owner_update" on public.pedidos;
create policy "pedidos_owner_update"
  on public.pedidos
  for update
  to authenticated
  using (public.is_comercio_owner(comercio_id))
  with check (public.is_comercio_owner(comercio_id));

alter table public.pedidos enable row level security;
alter table public.pedidos force row level security;

-- delivery_couriers: enable RLS; no direct anon access; owner select only
alter table public.delivery_couriers enable row level security;
alter table public.delivery_couriers force row level security;

drop policy if exists "delivery_couriers_owner_select" on public.delivery_couriers;
create policy "delivery_couriers_owner_select"
  on public.delivery_couriers
  for select
  to authenticated
  using (public.is_comercio_owner(comercio_id));

-- Writes intended via SECURITY DEFINER RPCs (service/postgres owner).

-- global_market_rates: public FX reference rates — SELECT only
alter table public.global_market_rates enable row level security;

drop policy if exists "global_market_rates_select" on public.global_market_rates;
create policy "global_market_rates_select"
  on public.global_market_rates
  for select
  to anon, authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- 4) Least-privilege grants (do not touch service_role)
-- ---------------------------------------------------------------------------
revoke all on table public.pedidos from anon;
revoke all on table public.pedidos from authenticated;
grant select, update on table public.pedidos to authenticated;

revoke all on table public.delivery_couriers from anon;
revoke all on table public.delivery_couriers from authenticated;
grant select on table public.delivery_couriers to authenticated;

revoke all on table public.delivery_invitations from anon;
revoke insert, update, delete, truncate, references, trigger
  on table public.delivery_invitations from authenticated;
grant select on table public.delivery_invitations to authenticated;

revoke all on table public.delivery_invitation_events from anon;
revoke insert, update, delete, truncate, references, trigger
  on table public.delivery_invitation_events from authenticated;
grant select on table public.delivery_invitation_events to authenticated;

-- Core menu tables: revoke dangerous global privileges, then grant minimum
revoke truncate, references, trigger on table public.comercios from anon, authenticated;
revoke insert, update, delete on table public.comercios from anon;
grant select on table public.comercios to anon;
grant select, insert, update, delete on table public.comercios to authenticated;

revoke truncate, references, trigger on table public.categorias from anon, authenticated;
revoke insert, update, delete on table public.categorias from anon;
grant select on table public.categorias to anon;
grant select, insert, update, delete on table public.categorias to authenticated;

revoke truncate, references, trigger on table public.productos from anon, authenticated;
revoke insert, update, delete on table public.productos from anon;
grant select on table public.productos to anon;
grant select, insert, update, delete on table public.productos to authenticated;

revoke truncate, references, trigger on table public.catalogos from anon, authenticated;
revoke insert, update, delete on table public.catalogos from anon;
grant select on table public.catalogos to anon;
grant select, insert, update, delete on table public.catalogos to authenticated;

revoke truncate, references, trigger on table public.metodos_pago from anon, authenticated;
revoke insert, update, delete on table public.metodos_pago from anon;
grant select on table public.metodos_pago to anon;
grant select, insert, update, delete on table public.metodos_pago to authenticated;

revoke all on table public.global_market_rates from anon, authenticated;
grant select on table public.global_market_rates to anon, authenticated;

revoke truncate, references, trigger on table public.user_tokens from anon, authenticated;
revoke all on table public.user_tokens from anon;

-- Contingency / rollback notes (manual):
-- 1) Re-apply previous policies from a DB dump / migration history if Flutter breaks.
-- 2) Temporarily restore constrained anon INSERT on pedidos ONLY if public_menu_view
--    Flutter path is still required before migrating it to Next /api/orders.
-- 3) service_role grants are intentionally untouched.
