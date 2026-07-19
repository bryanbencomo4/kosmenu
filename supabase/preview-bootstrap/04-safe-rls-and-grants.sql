-- PREVIEW BOOTSTRAP ONLY
-- DO NOT APPLY TO PRODUCTION
-- Allowed project ref: gsfxqzvmyzjjgpigrste
-- Forbidden project ref: qqhberaayhohxlbbhdyi
--
-- Final secure state. No interim USING true / WITH CHECK true public policies
-- on pedidos or catalog writes.

-- ---------------------------------------------------------------------------
-- Enable FORCE RLS
-- ---------------------------------------------------------------------------
alter table public.comercios enable row level security;
alter table public.comercios force row level security;
alter table public.catalogos enable row level security;
alter table public.catalogos force row level security;
alter table public.categorias enable row level security;
alter table public.categorias force row level security;
alter table public.productos enable row level security;
alter table public.productos force row level security;
alter table public.metodos_pago enable row level security;
alter table public.metodos_pago force row level security;
alter table public.pedidos enable row level security;
alter table public.pedidos force row level security;
alter table public.delivery_invitations enable row level security;
alter table public.delivery_invitations force row level security;
alter table public.delivery_invitation_events enable row level security;
alter table public.delivery_invitation_events force row level security;
alter table public.delivery_couriers enable row level security;
alter table public.delivery_couriers force row level security;
alter table public.global_market_rates enable row level security;
alter table public.global_market_rates force row level security;
alter table public.order_idempotency_keys enable row level security;
alter table public.order_idempotency_keys force row level security;
alter table public.user_tokens enable row level security;
alter table public.user_tokens force row level security;
alter table public.admin_users enable row level security;
alter table public.admin_users force row level security;
alter table public.admin_audit_logs enable row level security;
alter table public.admin_audit_logs force row level security;
alter table public.consumer_newsletter_subscribers enable row level security;
alter table public.consumer_newsletter_subscribers force row level security;

-- ---------------------------------------------------------------------------
-- comercios: no anon on base table (use comercios_menu_public view)
-- ---------------------------------------------------------------------------
drop policy if exists comercios_authenticated_select_owner_or_online on public.comercios;
create policy comercios_authenticated_select_owner_or_online
  on public.comercios for select to authenticated
  using (en_linea = true or owner_id = auth.uid());

drop policy if exists comercios_authenticated_insert_owner on public.comercios;
create policy comercios_authenticated_insert_owner
  on public.comercios for insert to authenticated
  with check (owner_id = auth.uid());

drop policy if exists comercios_authenticated_update_owner on public.comercios;
create policy comercios_authenticated_update_owner
  on public.comercios for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

drop policy if exists comercios_authenticated_delete_owner on public.comercios;
create policy comercios_authenticated_delete_owner
  on public.comercios for delete to authenticated
  using (owner_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Catalog: anon/auth SELECT for online menus; owner CRUD
-- ---------------------------------------------------------------------------
drop policy if exists categorias_public_select on public.categorias;
create policy categorias_public_select
  on public.categorias for select to anon, authenticated
  using (
    coalesce(activo, true) = true
    and exists (
      select 1 from public.comercios c
      where c.id = categorias.comercio_id and c.en_linea = true
    )
  );

drop policy if exists productos_public_select on public.productos;
create policy productos_public_select
  on public.productos for select to anon, authenticated
  using (
    coalesce(disponible, true) = true
    and exists (
      select 1 from public.comercios c
      where c.id = productos.comercio_id and c.en_linea = true
    )
  );

drop policy if exists catalogos_public_select on public.catalogos;
create policy catalogos_public_select
  on public.catalogos for select to anon, authenticated
  using (
    coalesce(activo, true) = true
    and exists (
      select 1 from public.comercios c
      where c.id = catalogos.comercio_id and c.en_linea = true
    )
  );

drop policy if exists metodos_pago_public_select on public.metodos_pago;
create policy metodos_pago_public_select
  on public.metodos_pago for select to anon, authenticated
  using (
    exists (
      select 1 from public.comercios c
      where c.id = metodos_pago.comercio_id and c.en_linea = true
    )
  );

-- Owner CRUD helpers
do $$
declare
  t text;
begin
  foreach t in array array['categorias','productos','catalogos','metodos_pago']
  loop
    execute format('drop policy if exists %I on public.%I', t || '_owner_select', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (public.is_comercio_owner(comercio_id))',
      t || '_owner_select', t
    );
    execute format('drop policy if exists %I on public.%I', t || '_owner_insert', t);
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (public.is_comercio_owner(comercio_id))',
      t || '_owner_insert', t
    );
    execute format('drop policy if exists %I on public.%I', t || '_owner_update', t);
    execute format(
      'create policy %I on public.%I for update to authenticated using (public.is_comercio_owner(comercio_id)) with check (public.is_comercio_owner(comercio_id))',
      t || '_owner_update', t
    );
    execute format('drop policy if exists %I on public.%I', t || '_owner_delete', t);
    execute format(
      'create policy %I on public.%I for delete to authenticated using (public.is_comercio_owner(comercio_id))',
      t || '_owner_delete', t
    );
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- pedidos: NO anon. Owners select/update only. Inserts via service_role API.
-- ---------------------------------------------------------------------------
drop policy if exists pedidos_owner_select on public.pedidos;
create policy pedidos_owner_select
  on public.pedidos for select to authenticated
  using (public.is_comercio_owner(comercio_id));

drop policy if exists pedidos_owner_update on public.pedidos;
create policy pedidos_owner_update
  on public.pedidos for update to authenticated
  using (public.is_comercio_owner(comercio_id))
  with check (public.is_comercio_owner(comercio_id));

-- ---------------------------------------------------------------------------
-- Delivery tables
-- ---------------------------------------------------------------------------
drop policy if exists delivery_invitations_owner_select on public.delivery_invitations;
create policy delivery_invitations_owner_select
  on public.delivery_invitations for select to authenticated
  using (public.is_comercio_owner(comercio_id));

drop policy if exists delivery_events_owner_select on public.delivery_invitation_events;
create policy delivery_events_owner_select
  on public.delivery_invitation_events for select to authenticated
  using (
    exists (
      select 1 from public.pedidos p
      where p.id = delivery_invitation_events.pedido_id
        and public.is_comercio_owner(p.comercio_id)
    )
  );

drop policy if exists delivery_couriers_owner_select on public.delivery_couriers;
create policy delivery_couriers_owner_select
  on public.delivery_couriers for select to authenticated
  using (public.is_comercio_owner(comercio_id));

-- Reviewed intentional public FX read (rates only; no PII)
drop policy if exists global_market_rates_select on public.global_market_rates;
create policy global_market_rates_select
  on public.global_market_rates for select to anon, authenticated
  using (true);

-- user_tokens: owner of row only
drop policy if exists user_tokens_owner_all on public.user_tokens;
create policy user_tokens_owner_select
  on public.user_tokens for select to authenticated
  using (user_id = auth.uid());
create policy user_tokens_owner_insert
  on public.user_tokens for insert to authenticated
  with check (user_id = auth.uid());
create policy user_tokens_owner_update
  on public.user_tokens for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
create policy user_tokens_owner_delete
  on public.user_tokens for delete to authenticated
  using (user_id = auth.uid());

-- Admin tables: active admins only
drop policy if exists admin_users_admin_select on public.admin_users;
create policy admin_users_admin_select
  on public.admin_users for select to authenticated
  using (public.is_active_admin());

drop policy if exists admin_audit_admin_select on public.admin_audit_logs;
create policy admin_audit_admin_select
  on public.admin_audit_logs for select to authenticated
  using (public.is_active_admin());

-- Newsletter: no direct client table access (RPC only)
-- (no policies for anon/authenticated → deny by default under FORCE RLS)

-- Idempotency: no client policies (service_role only)
-- (deny by default)

-- ---------------------------------------------------------------------------
-- Grants (minimal; no TRUNCATE / REFERENCES / TRIGGER for clients)
-- ---------------------------------------------------------------------------
revoke all on table public.pedidos from anon, authenticated, public;
grant select, update on table public.pedidos to authenticated;

revoke all on table public.comercios from anon, authenticated, public;
grant select, insert, update, delete on table public.comercios to authenticated;

revoke all on table public.categorias from anon, authenticated, public;
grant select on table public.categorias to anon;
grant select, insert, update, delete on table public.categorias to authenticated;

revoke all on table public.productos from anon, authenticated, public;
grant select on table public.productos to anon;
grant select, insert, update, delete on table public.productos to authenticated;

revoke all on table public.catalogos from anon, authenticated, public;
grant select on table public.catalogos to anon;
grant select, insert, update, delete on table public.catalogos to authenticated;

revoke all on table public.metodos_pago from anon, authenticated, public;
grant select on table public.metodos_pago to anon;
grant select, insert, update, delete on table public.metodos_pago to authenticated;

revoke all on table public.delivery_couriers from anon, authenticated, public;
grant select on table public.delivery_couriers to authenticated;

revoke all on table public.delivery_invitations from anon, authenticated, public;
grant select on table public.delivery_invitations to authenticated;

revoke all on table public.delivery_invitation_events from anon, authenticated, public;
grant select on table public.delivery_invitation_events to authenticated;

revoke all on table public.global_market_rates from anon, authenticated, public;
grant select on table public.global_market_rates to anon, authenticated;

revoke all on table public.order_idempotency_keys from anon, authenticated, public;
grant all on table public.order_idempotency_keys to service_role;

revoke all on table public.user_tokens from anon, authenticated, public;
grant select, insert, update, delete on table public.user_tokens to authenticated;

revoke all on table public.admin_users from anon, authenticated, public;
grant select on table public.admin_users to authenticated;

revoke all on table public.admin_audit_logs from anon, authenticated, public;
grant select on table public.admin_audit_logs to authenticated;

revoke all on table public.consumer_newsletter_subscribers from anon, authenticated, public;

revoke all on public.comercios_menu_public from anon, authenticated, public;
grant select on public.comercios_menu_public to anon, authenticated;
revoke all on public.metodos_pago_menu_public from anon, authenticated, public;
grant select on public.metodos_pago_menu_public to anon, authenticated;

-- Function EXECUTE
revoke execute on function public.is_comercio_owner(uuid) from anon, public;
grant execute on function public.is_comercio_owner(uuid) to authenticated;
revoke execute on function public.is_owner_of_comercio(uuid) from anon, public;
grant execute on function public.is_owner_of_comercio(uuid) to authenticated;

revoke execute on function public.log_delivery_invitation_event(uuid, uuid, text, text, text, jsonb)
  from anon, authenticated, public;
grant execute on function public.log_delivery_invitation_event(uuid, uuid, text, text, text, jsonb)
  to service_role;

revoke execute on function public.create_delivery_invitation(text, integer, text, text) from anon, public;
grant execute on function public.create_delivery_invitation(text, integer, text, text) to authenticated, service_role;
revoke execute on function public.revoke_delivery_invitation(text) from anon, public;
grant execute on function public.revoke_delivery_invitation(text) to authenticated, service_role;

revoke execute on function public.upsert_delivery_courier(uuid, text, text, text) from anon, public;
grant execute on function public.upsert_delivery_courier(uuid, text, text, text) to authenticated, service_role;
revoke execute on function public.list_delivery_couriers(uuid, text, integer) from anon, public;
grant execute on function public.list_delivery_couriers(uuid, text, integer) to authenticated, service_role;
revoke execute on function public.deactivate_delivery_courier(uuid) from anon, public;
grant execute on function public.deactivate_delivery_courier(uuid) to authenticated, service_role;
revoke execute on function public.touch_delivery_courier_last_used(uuid) from anon, public;
grant execute on function public.touch_delivery_courier_last_used(uuid) to authenticated, service_role;

revoke execute on function public.subscribe_consumer_newsletter(text, text, jsonb) from public;
grant execute on function public.subscribe_consumer_newsletter(text, text, jsonb) to anon, authenticated, service_role;

revoke execute on function public.is_active_admin() from anon, public;
grant execute on function public.is_active_admin() to authenticated, service_role;
revoke execute on function public.current_admin_role() from anon, public;
grant execute on function public.current_admin_role() to authenticated, service_role;
