-- PREVIEW BOOTSTRAP ONLY — DO NOT APPLY TO PRODUCTION
-- Allowed project ref: gsfxqzvmyzjjgpigrste (kosmenu-preview)
-- Forbidden: qqhberaayhohxlbbhdyi (production)
--
-- Asistente Maestro memory (L1/L2/L3) + exclusive quota.
-- Own objects only. Does not touch pedidos, wasender_message_queue,
-- chat_supervision, discovery quota, or commerce mutation tables.

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
grant select, insert, update, delete on public.wa_master_profiles to service_role;
grant select, insert, update, delete on public.wa_master_threads to service_role;
grant select, insert, update, delete on public.wa_master_turns to service_role;
grant select, insert, update, delete on public.wa_master_quota to service_role;
grant select, insert, update, delete on public.wa_master_quota_ledger to service_role;
grant usage, select on all sequences in schema public to service_role;

-- Atomic exclusive Master Gemini quota (never touches discovery_* counters).
create or replace function public.wa_master_quota_reserve(
  p_period_month text,
  p_max_requests int
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  cur int;
begin
  if p_max_requests is null or p_max_requests < 1 then
    return false;
  end if;
  insert into public.wa_master_quota (period_month, requests, tokens_input, tokens_output, updated_at_ms)
  values (p_period_month, 0, 0, 0, (extract(epoch from now()) * 1000)::bigint)
  on conflict (period_month) do nothing;

  select requests into cur
  from public.wa_master_quota
  where period_month = p_period_month
  for update;

  if cur >= p_max_requests then
    return false;
  end if;

  update public.wa_master_quota
  set requests = requests + 1,
      updated_at_ms = (extract(epoch from now()) * 1000)::bigint
  where period_month = p_period_month;
  return true;
end;
$$;

create or replace function public.wa_master_quota_record_tokens(
  p_period_month text,
  p_tokens_input bigint,
  p_tokens_output bigint,
  p_request_id text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_request_id is null or length(trim(p_request_id)) = 0 then
    return false;
  end if;

  insert into public.wa_master_quota_ledger (request_id, period_month, reserved_at_ms, tokens_recorded_at_ms)
  values (
    p_request_id,
    p_period_month,
    (extract(epoch from now()) * 1000)::bigint,
    null
  )
  on conflict (request_id) do nothing;

  update public.wa_master_quota_ledger
  set tokens_recorded_at_ms = (extract(epoch from now()) * 1000)::bigint
  where request_id = p_request_id
    and tokens_recorded_at_ms is null;

  if not found then
    -- Already recorded (idempotent) or insert race lost — treat as success.
    return true;
  end if;

  insert into public.wa_master_quota (period_month, requests, tokens_input, tokens_output, updated_at_ms)
  values (p_period_month, 0, 0, 0, (extract(epoch from now()) * 1000)::bigint)
  on conflict (period_month) do nothing;

  update public.wa_master_quota
  set tokens_input = tokens_input + greatest(0, coalesce(p_tokens_input, 0)),
      tokens_output = tokens_output + greatest(0, coalesce(p_tokens_output, 0)),
      updated_at_ms = (extract(epoch from now()) * 1000)::bigint
  where period_month = p_period_month;

  return true;
end;
$$;

grant execute on function public.wa_master_quota_reserve(text, int) to service_role;
grant execute on function public.wa_master_quota_record_tokens(text, bigint, bigint, text) to service_role;
