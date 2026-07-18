-- EMERGENCY P0 — LOCAL ONLY. Do NOT apply until human approval.
-- Goal: immediately close the most dangerous public access on pedidos
-- WITHOUT requiring the full sanitize_rls migration.
--
-- Flutter checkout (pre-2A.3) used:
--   from('pedidos').insert(...).select(...)
-- RETURNING requires SELECT privilege on the inserted row. Closing public SELECT
-- while keeping that client pattern would break checkout.
--
-- Safe interim strategies (choose one before apply):
-- A) Deploy Flutter/Next 2A.3 first (POST /api/orders via service_role) — preferred.
--    Then this migration can also revoke anon INSERT.
-- B) Keep a temporary anon INSERT policy AND stop using .select() on insert
--    (or route create through SECURITY DEFINER RPC below).
--
-- This file implements strategy A-ready + optional temporary INSERT retention.
-- Default: revoke public SELECT/UPDATE/DELETE; keep temporary INSERT for roll-forward.
-- After compatible clients are live, apply the follow-up revoke of INSERT (commented).

begin;

-- 1) Drop dangerous PUBLIC/anon policies on pedidos (names from live audit — adjust if renamed).
drop policy if exists "Enable read access for all users" on public.pedidos;
drop policy if exists "Enable update for all users" on public.pedidos;
drop policy if exists "Enable delete for all users" on public.pedidos;
drop policy if exists "Enable insert for all users" on public.pedidos;
drop policy if exists pedidos_public_select on public.pedidos;
drop policy if exists pedidos_public_update on public.pedidos;
drop policy if exists pedidos_public_delete on public.pedidos;
drop policy if exists pedidos_public_insert on public.pedidos;
drop policy if exists "Public can view pedidos" on public.pedidos;
drop policy if exists "Public can update pedidos" on public.pedidos;
drop policy if exists "Public can insert pedidos" on public.pedidos;

-- Also drop common USING true policies if present under generic names.
do $$
declare
  pol record;
begin
  for pol in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'pedidos'
      and (
        qual = 'true'
        or with_check = 'true'
        or roles @> array['anon']::name[]
        or roles @> array['public']::name[]
      )
  loop
    execute format('drop policy if exists %I on public.pedidos', pol.policyname);
  end loop;
end $$;

alter table public.pedidos enable row level security;

-- Temporary INSERT-only path for legacy clients (remove after 2A.3 deploy).
-- Does NOT grant SELECT — clients must not use insert().select().
create policy pedidos_emergency_anon_insert
  on public.pedidos
  for insert
  to anon, authenticated
  with check (true);

-- Owner read/update (merchant panel) — keep if helpers exist.
create policy pedidos_emergency_owner_select
  on public.pedidos
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.comercios c
      where c.id = pedidos.comercio_id
        and c.owner_id = auth.uid()
    )
  );

create policy pedidos_emergency_owner_update
  on public.pedidos
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.comercios c
      where c.id = pedidos.comercio_id
        and c.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.comercios c
      where c.id = pedidos.comercio_id
        and c.owner_id = auth.uid()
    )
  );

-- Revoke table privileges that amplify blast radius.
revoke select, update, delete, truncate, references, trigger
  on table public.pedidos from anon, public;
revoke truncate, references, trigger on table public.pedidos from authenticated;

-- Keep INSERT grant only while emergency_anon_insert policy exists.
grant insert on table public.pedidos to anon, authenticated;
grant select, update on table public.pedidos to authenticated;
grant all on table public.pedidos to service_role;

-- Catalog: remove public write; keep public SELECT for menu browsing until views/API only.
revoke insert, update, delete, truncate, references, trigger
  on table public.categorias from anon, public;
revoke insert, update, delete, truncate, references, trigger
  on table public.productos from anon, public;
revoke insert, update, delete, truncate, references, trigger
  on table public.catalogos from anon, public;

-- Optional SECURITY DEFINER checkout create (returns id without SELECT policy).
create or replace function public.emergency_insert_pedido(p_row jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into public.pedidos (
    comercio_id,
    estado,
    total,
    detalles,
    delivery_latitude,
    delivery_longitude,
    nombre_cliente,
    telefono_cliente
  )
  values (
    (p_row->>'comercio_id')::uuid,
    coalesce(nullif(p_row->>'estado', ''), 'pendiente'),
    nullif(p_row->>'total', '')::numeric,
    coalesce(p_row->'detalles', '{}'::jsonb),
    nullif(p_row->>'delivery_latitude', '')::double precision,
    nullif(p_row->>'delivery_longitude', '')::double precision,
    nullif(p_row->>'nombre_cliente', ''),
    nullif(p_row->>'telefono_cliente', '')
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.emergency_insert_pedido(jsonb) from public, anon, authenticated;
grant execute on function public.emergency_insert_pedido(jsonb) to service_role;

commit;

-- FOLLOW-UP (after Flutter/Next 2A.3 is live in the environment):
-- drop policy if exists pedidos_emergency_anon_insert on public.pedidos;
-- revoke insert on table public.pedidos from anon, authenticated;
-- drop function if exists public.emergency_insert_pedido(jsonb);
