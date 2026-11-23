-- =============================================================================
-- READ-ONLY audit — pedidos_emergency_anon_insert
-- Safe to run against production. Does NOT DROP or ALTER anything.
-- =============================================================================

-- 1) Is the emergency anon insert policy present?
select
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
  and tablename = 'pedidos'
  and policyname = 'pedidos_emergency_anon_insert';

-- 2) All policies on pedidos (context)
select
  policyname,
  roles,
  cmd,
  with_check
from pg_policies
where schemaname = 'public'
  and tablename = 'pedidos'
order by policyname;

-- 3) Table privileges for anon / authenticated / service_role
select
  grantee,
  privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name = 'pedidos'
  and grantee in ('anon', 'authenticated', 'service_role', 'public')
order by grantee, privilege_type;
