-- Preview-only: Asistente Maestro memory + exclusive quota.
-- DO NOT apply to production without explicit authorization.
-- Project intended: Preview gsfxqzvmyzjjgpigrste

create table if not exists public.wa_master_profiles (
  from_digits text primary key,
  roles text[] not null default '{}',
  linked_comercio_ids text[] not null default '{}',
  preferences jsonb not null default '{}'::jsonb,
  preference_provenance jsonb not null default '{}'::jsonb,
  last_intent text null,
  attention_state text not null default 'ai',
  last_active_at_ms bigint not null,
  retention_until_ms bigint null,
  updated_at timestamptz not null default now()
);

create table if not exists public.wa_master_threads (
  from_digits text primary key,
  summary_json jsonb not null default '{}'::jsonb,
  updated_at_ms bigint not null,
  expires_at_ms bigint not null
);

create table if not exists public.wa_master_turns (
  id bigserial primary key,
  from_digits text not null,
  role text not null,
  text text not null,
  at_ms bigint not null,
  intent text null,
  specialist text null
);

create index if not exists wa_master_turns_from_at_idx
  on public.wa_master_turns (from_digits, at_ms desc);

create table if not exists public.wa_master_quota (
  period_month text primary key,
  requests int not null default 0,
  tokens_input bigint not null default 0,
  tokens_output bigint not null default 0,
  updated_at_ms bigint not null
);

create table if not exists public.wa_master_quota_ledger (
  request_id text primary key,
  period_month text not null,
  reserved_at_ms bigint not null,
  tokens_recorded_at_ms bigint null
);

alter table public.wa_master_profiles enable row level security;
alter table public.wa_master_threads enable row level security;
alter table public.wa_master_turns enable row level security;
alter table public.wa_master_quota enable row level security;
alter table public.wa_master_quota_ledger enable row level security;
-- service_role only (no anon policies)
