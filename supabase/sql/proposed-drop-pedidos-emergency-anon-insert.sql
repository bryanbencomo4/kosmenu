-- =============================================================================
-- PROPOSAL ONLY — DO NOT APPLY without human approval.
-- Local Phase 0 deliverable. Never run against production from the agent.
-- =============================================================================
--
-- Context
-- -------
-- Migration 20260718194200_emergency_p0_close_pedidos_read_update.sql created:
--
--   create policy pedidos_emergency_anon_insert
--     on public.pedidos
--     for insert
--     to anon, authenticated
--     with check (true);
--
-- and granted INSERT on public.pedidos to anon, authenticated.
--
-- That policy allows any anonymous or logged-in JWT to insert ANY row into
-- pedidos (no comercio ownership check). The follow-up DROP was left commented
-- in the same migration and no later migration removes this policy.
--
-- Current public checkout path (Next.js POST /api/orders) inserts with the
-- service_role key and does NOT need this policy. Confirm that before revoke.
--
-- =============================================================================
-- 1) READ-ONLY audit queries (safe to run in production)
-- =============================================================================

-- Active policies on pedidos
select
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
  and tablename = 'pedidos'
order by policyname;

-- Specifically: is the emergency anon insert still present?
select
  policyname,
  roles,
  cmd,
  with_check
from pg_policies
where schemaname = 'public'
  and tablename = 'pedidos'
  and policyname = 'pedidos_emergency_anon_insert';

-- Table privileges for anon / authenticated / service_role
select
  grantee,
  privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name = 'pedidos'
  and grantee in ('anon', 'authenticated', 'service_role', 'public')
order by grantee, privilege_type;

-- Optional: does any client still insert as anon? (requires log access; skip if unavailable)
-- Look for PostgREST inserts into pedidos without service role from app logs / API gateway.

-- =============================================================================
-- 2) Corrective migration (APPLY ONLY AFTER AUDIT + APPROVAL)
-- =============================================================================
-- Expected end state:
--   - Public order creates go through Next.js POST /api/orders (service_role).
--   - Flutter merchant panel reads/updates via authenticated member policies.
--   - anon cannot INSERT into pedidos.
--   - emergency_insert_pedido stays service_role-only (already true).
--
-- begin;
--
-- drop policy if exists pedidos_emergency_anon_insert on public.pedidos;
--
-- revoke insert on table public.pedidos from anon;
-- -- Keep authenticated INSERT only if a verified client still needs it under RLS.
-- -- Preferred: also revoke authenticated INSERT and rely on service_role / RPC.
-- -- revoke insert on table public.pedidos from authenticated;
--
-- -- Owner/member select+update policies from later migrations should remain:
-- --   pedidos_member_select / pedidos_member_update
-- --   (and/or pedidos_owner_* / pedidos_emergency_owner_* — verify live names)
--
-- commit;
--
-- Rollback sketch:
--   recreate policy pedidos_emergency_anon_insert ... with check (true);
--   grant insert on table public.pedidos to anon, authenticated;
