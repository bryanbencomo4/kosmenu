-- =============================================================================
-- APPLY ONLY AFTER EXPLICIT OWNER AUTHORIZATION
-- Mirror of migration 20261122090000_drop_pedidos_emergency_anon_insert.sql
-- Run after read-only audit confirms the emergency policy is still present.
-- =============================================================================

begin;

drop policy if exists pedidos_emergency_anon_insert on public.pedidos;

revoke insert on table public.pedidos from anon;
revoke insert on table public.pedidos from authenticated;

grant all on table public.pedidos to service_role;

commit;

-- Post-apply verification (read-only):
-- select policyname from pg_policies
-- where schemaname='public' and tablename='pedidos'
--   and policyname='pedidos_emergency_anon_insert';
-- Expect: 0 rows
