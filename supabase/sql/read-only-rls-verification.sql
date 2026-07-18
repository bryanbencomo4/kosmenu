-- READ-ONLY RLS / Storage / Realtime verification for ElMenúXFA (H04)
-- Run in Supabase SQL Editor as a privileged role (postgres / service_role).
--
-- SAFETY: This file must contain ONLY read/catalog statements.
-- Allowed: SELECT (and WITH ... AS used by SELECT).
-- Forbidden: INSERT, UPDATE, DELETE, ALTER, DROP, CREATE, GRANT, REVOKE, TRUNCATE, CALL that mutates.
-- Do NOT select rows from pedidos/comercios with PII — catalog metadata only.

-- =============================================================================
-- 1) RLS enabled flag for core tables
-- =============================================================================
select
  n.nspname as schema,
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relname in (
    'comercios',
    'categorias',
    'productos',
    'metodos_pago',
    'pedidos',
    'catalogos',
    'delivery_invitations',
    'delivery_invitation_events',
    'delivery_couriers',
    'admin_users',
    'admin_audit_logs',
    'sectores_negocio',
    'consumer_newsletter_subscribers',
    'user_tokens',
    'global_market_rates'
  )
order by c.relname;

-- =============================================================================
-- 2) Policies on those tables (roles + cmd + expressions)
-- =============================================================================
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
  and tablename in (
    'comercios',
    'categorias',
    'productos',
    'metodos_pago',
    'pedidos',
    'catalogos',
    'delivery_invitations',
    'delivery_invitation_events',
    'delivery_couriers',
    'admin_users',
    'admin_audit_logs',
    'sectores_negocio',
    'consumer_newsletter_subscribers',
    'user_tokens'
  )
order by tablename, policyname;

-- =============================================================================
-- 3) Table grants to anon / authenticated / service_role / public
-- =============================================================================
select
  table_schema,
  table_name,
  grantee,
  privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in (
    'comercios',
    'categorias',
    'productos',
    'metodos_pago',
    'pedidos',
    'catalogos',
    'delivery_invitations',
    'delivery_invitation_events',
    'delivery_couriers',
    'user_tokens'
  )
  and grantee in ('anon', 'authenticated', 'service_role', 'public')
order by table_name, grantee, privilege_type;

-- =============================================================================
-- 4) Ownership relation: does comercios.owner_id exist? (column metadata only)
-- =============================================================================
select
  table_name,
  column_name,
  data_type,
  is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'comercios'
  and column_name in ('id', 'owner_id', 'slug', 'user_id')
order by column_name;

-- =============================================================================
-- 5) pedidos columns related to tracking / proofs (names only, no values)
-- =============================================================================
select
  column_name,
  data_type,
  is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'pedidos'
  and column_name in (
    'id',
    'comercio_id',
    'estado',
    'detalles',
    'cliente_email',
    'public_tracking_token_hash',
    'created_at'
  )
order by column_name;

-- =============================================================================
-- 6) Storage buckets (public flag + limits — no object listing)
-- =============================================================================
select id, name, public, file_size_limit, allowed_mime_types
from storage.buckets
order by name;

-- =============================================================================
-- 7) Storage policies on storage.objects
-- =============================================================================
select
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname = 'storage'
  and tablename = 'objects'
order by policyname;

-- =============================================================================
-- 8) Storage schema grants (anon / authenticated)
-- =============================================================================
select
  table_schema,
  table_name,
  grantee,
  privilege_type
from information_schema.role_table_grants
where table_schema = 'storage'
  and table_name in ('objects', 'buckets')
  and grantee in ('anon', 'authenticated', 'service_role', 'public')
order by table_name, grantee, privilege_type;

-- =============================================================================
-- 9) SECURITY DEFINER functions in public / storage (signature only)
-- =============================================================================
select
  n.nspname as schema,
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as args,
  p.prosecdef as security_definer,
  p.provolatile as volatility,
  r.rolname as owner
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
join pg_roles r on r.oid = p.proowner
where n.nspname in ('public', 'storage')
  and p.prosecdef = true
order by n.nspname, p.proname;

-- =============================================================================
-- 10) Realtime publication membership (which tables clients can subscribe to)
-- =============================================================================
select
  pubname,
  schemaname,
  tablename
from pg_publication_tables
where pubname = 'supabase_realtime'
order by schemaname, tablename;

-- =============================================================================
-- 11) delivery_invitations column surface (token-related names only)
-- =============================================================================
select
  column_name,
  data_type,
  is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'delivery_invitations'
order by ordinal_position;

-- Manual checklist after results:
-- - anon may read public menu data for online comercios only (or via server API).
-- - anon must NOT update/delete arbitrary pedidos by guessing UUID/order_id.
-- - client order tracking should use constrained access (token + Next API).
-- - comprobantes bucket: public=false; no open list/read; uploads via server.
-- - comercios.owner_id must be the auth.uid() join key for Flutter merchant policies.
-- - Realtime on pedidos is dangerous if RLS is weak or disabled.
-- - SECURITY DEFINER functions must not bypass ownership checks unsafely.
;
