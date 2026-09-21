-- Operational rollback for 20260917120000 + 20260917140000.
-- Additive reverse only. Does NOT restore merchant rows.
-- Does NOT rewind to the 2026-09-16 physical backup.
-- Run on production ONLY if those two migrations were applied and must be undone.
-- Prefer this over physical restore (physical restore drops ~24h of writes).
-- After this script, restore owner helpers from
-- backups/prod-20260917-021516/restore_owner_helpers.sql

begin;

drop trigger if exists trg_enforce_staff_pedido_update on public.pedidos;
drop function if exists public.enforce_staff_pedido_update();

drop function if exists public.get_menu_analytics_summary(uuid, integer);
drop function if exists public.invite_comercio_member(uuid, text, text);
drop function if exists public.accept_pending_comercio_invites();
drop function if exists public.revoke_comercio_member(uuid, uuid, uuid);
drop function if exists public.list_comercio_team(uuid);
drop function if exists public.comercio_has_role(uuid, text[]);
drop function if exists public.is_comercio_member(uuid);

drop policy if exists "menu_analytics_member_select" on public.menu_analytics_events;
drop policy if exists "comercio_members_self_or_admin_select" on public.comercio_members;
drop policy if exists "comercio_invites_admin_select" on public.comercio_member_invites;
drop policy if exists "comercios_member_select" on public.comercios;
drop policy if exists "comercios_member_update_admin" on public.comercios;
drop policy if exists "pedidos_member_select" on public.pedidos;
drop policy if exists "pedidos_member_update" on public.pedidos;
drop policy if exists "categorias_member_select" on public.categorias;
drop policy if exists "categorias_member_insert" on public.categorias;
drop policy if exists "categorias_member_update" on public.categorias;
drop policy if exists "categorias_member_delete" on public.categorias;
drop policy if exists "productos_member_select" on public.productos;
drop policy if exists "productos_member_insert" on public.productos;
drop policy if exists "productos_member_update" on public.productos;
drop policy if exists "productos_member_delete" on public.productos;
drop policy if exists "catalogos_member_select" on public.catalogos;
drop policy if exists "ai_credits_wallet_member_select" on public.ai_credits_wallet;
drop policy if exists "ai_credits_tx_member_select" on public.ai_credits_transactions;
drop policy if exists "upsell_settings_member_select" on public.upsell_settings;
drop policy if exists "upsell_settings_member_write" on public.upsell_settings;
drop policy if exists "upsell_rules_member_select" on public.upsell_rules;
drop policy if exists "upsell_rules_member_write" on public.upsell_rules;
drop policy if exists "bundles_member_select" on public.bundles;
drop policy if exists "bundles_member_write" on public.bundles;

drop table if exists public.comercio_member_invites;
drop table if exists public.comercio_members;
drop table if exists public.menu_analytics_events;

-- Hours JSON added by 120000. Empty {} at apply time; drop only if you accept
-- losing any horarios written after the migration.
alter table public.comercios drop column if exists horarios;

commit;

-- Next: apply restore_owner_helpers.sql so is_comercio_owner matches pre-cutover.
