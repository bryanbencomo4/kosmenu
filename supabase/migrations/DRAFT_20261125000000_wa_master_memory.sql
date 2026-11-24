-- DRAFT — Asistente Maestro memory (Package 1 design).
-- DO NOT APPLY TO PRODUCTION without explicit authorization.
-- Target preview first. Own objects only; does not alter pedidos/comercios.

-- create table if not exists public.wa_master_profiles (
--   from_digits text primary key,
--   roles text[] not null default '{}',
--   linked_comercio_ids uuid[] not null default '{}',
--   preferences jsonb not null default '{}'::jsonb,
--   preference_provenance jsonb not null default '{}'::jsonb,
--   last_intent text null,
--   attention_state text not null default 'ai',
--   last_active_at_ms bigint not null,
--   retention_until_ms bigint null,
--   updated_at timestamptz not null default now()
-- );

-- create table if not exists public.wa_master_threads (
--   from_digits text primary key,
--   summary_json jsonb not null default '{}'::jsonb,
--   updated_at_ms bigint not null,
--   expires_at_ms bigint not null
-- );

-- create table if not exists public.wa_master_turns (
--   id bigserial primary key,
--   from_digits text not null references public.wa_master_threads(from_digits) on delete cascade,
--   role text not null,
--   text text not null,
--   at_ms bigint not null,
--   intent text null,
--   specialist text null
-- );

-- create index if not exists wa_master_turns_from_at_idx
--   on public.wa_master_turns (from_digits, at_ms desc);

-- RLS: service_role only (same pattern as wa_entry_*).
