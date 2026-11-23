-- Discovery Assistant (/asistente) — atomic quota, isolated from restaurant chatbot.
-- PREPARED ONLY. Do NOT apply to production until authorized.
--
-- Isolation: separate tables (ai_discovery_*) — never touch ai_chatbot_sessions / ai_chatbot_usage.
-- Kill switch: DISCOVERY_ASSISTANT_ENABLED / ALLOW_PRODUCTION / ALLOW_GEMINI (app-level)
--              + optional app.settings discovery_assistant_kill = on (checked below).
-- After apply: set DISCOVERY_ASSISTANT_QUOTA_BACKEND=postgres
--              and DISCOVERY_ASSISTANT_POSTGRES_QUOTA_READY=1 (then authorize Gemini separately).

create table if not exists public.ai_discovery_sessions (
  session_id text primary key,
  requests integer not null default 0 check (requests >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_discovery_usage (
  agent text not null default 'discovery',
  period_month text not null,
  requests integer not null default 0 check (requests >= 0),
  tokens_input bigint not null default 0 check (tokens_input >= 0),
  tokens_output bigint not null default 0 check (tokens_output >= 0),
  estimated_cost numeric,
  errors integer not null default 0 check (errors >= 0),
  model text,
  updated_at timestamptz not null default now(),
  primary key (agent, period_month)
);

alter table public.ai_discovery_sessions enable row level security;
alter table public.ai_discovery_usage enable row level security;

-- Defense in depth: no direct table access for anon/authenticated (RLS has zero policies).
-- Mutations only via security-definer RPCs granted to service_role.
revoke all on table public.ai_discovery_sessions from public;
revoke all on table public.ai_discovery_sessions from anon;
revoke all on table public.ai_discovery_sessions from authenticated;
revoke all on table public.ai_discovery_usage from public;
revoke all on table public.ai_discovery_usage from anon;
revoke all on table public.ai_discovery_usage from authenticated;
grant all on table public.ai_discovery_sessions to service_role;
grant all on table public.ai_discovery_usage to service_role;

create or replace function public.reserve_ai_discovery_quota(
  p_session_id text,
  p_max_session_requests integer,
  p_period_month text,
  p_max_monthly_requests integer,
  p_max_monthly_tokens bigint default null,
  p_model text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  session_row public.ai_discovery_sessions;
  usage_row public.ai_discovery_usage;
  next_requests integer;
  next_tokens bigint;
  kill_flag text;
begin
  -- Optional DB kill switch (set via ALTER DATABASE … SET app.discovery_assistant_kill = 'on')
  begin
    kill_flag := current_setting('app.discovery_assistant_kill', true);
  exception when others then
    kill_flag := null;
  end;
  if lower(coalesce(kill_flag, '')) in ('on', '1', 'true', 'yes') then
    raise exception 'discovery assistant killed' using errcode = 'P0001';
  end if;

  if p_session_id is null or length(trim(p_session_id)) < 8 then
    raise exception 'invalid discovery session' using errcode = '22023';
  end if;
  if p_period_month is null or length(trim(p_period_month)) < 7 then
    raise exception 'invalid discovery period' using errcode = '22023';
  end if;

  insert into public.ai_discovery_sessions as s (session_id, requests)
  values (trim(p_session_id), 0)
  on conflict (session_id) do nothing;

  select * into session_row
  from public.ai_discovery_sessions
  where session_id = trim(p_session_id)
  for update;

  if session_row.requests >= p_max_session_requests then
    raise exception 'discovery session request limit' using errcode = 'P0001';
  end if;

  insert into public.ai_discovery_usage as u (
    agent, period_month, requests, tokens_input, tokens_output, estimated_cost, errors, model
  ) values (
    'discovery', trim(p_period_month), 0, 0, 0, null, 0, p_model
  )
  on conflict (agent, period_month) do nothing;

  select * into usage_row
  from public.ai_discovery_usage
  where agent = 'discovery' and period_month = trim(p_period_month)
  for update;

  next_requests := usage_row.requests + 1;
  next_tokens := usage_row.tokens_input + usage_row.tokens_output;

  if p_max_monthly_requests is not null and next_requests > p_max_monthly_requests then
    raise exception 'discovery monthly request limit' using errcode = 'P0001';
  end if;
  if p_max_monthly_tokens is not null and next_tokens >= p_max_monthly_tokens then
    raise exception 'discovery monthly token limit' using errcode = 'P0001';
  end if;

  update public.ai_discovery_sessions
  set requests = requests + 1, updated_at = now()
  where session_id = trim(p_session_id)
  returning * into session_row;

  update public.ai_discovery_usage
  set
    requests = next_requests,
    model = coalesce(p_model, model),
    updated_at = now()
  where agent = 'discovery' and period_month = trim(p_period_month)
  returning * into usage_row;

  return jsonb_build_object(
    'session', to_jsonb(session_row),
    'period', to_jsonb(usage_row)
  );
end;
$$;

create or replace function public.increment_ai_discovery_tokens(
  p_period_month text,
  p_tokens_input bigint default 0,
  p_tokens_output bigint default 0,
  p_estimated_cost numeric default null,
  p_model text default null
)
returns public.ai_discovery_usage
language plpgsql
security definer
set search_path = public
as $$
declare
  row public.ai_discovery_usage;
begin
  insert into public.ai_discovery_usage as u (
    agent, period_month, requests, tokens_input, tokens_output, estimated_cost, errors, model
  ) values (
    'discovery', trim(p_period_month), 0, 0, 0, null, 0, p_model
  )
  on conflict (agent, period_month) do nothing;

  update public.ai_discovery_usage
  set
    tokens_input = tokens_input + greatest(coalesce(p_tokens_input, 0), 0),
    tokens_output = tokens_output + greatest(coalesce(p_tokens_output, 0), 0),
    estimated_cost = case
      when p_estimated_cost is null then estimated_cost
      when estimated_cost is null then p_estimated_cost
      else estimated_cost + p_estimated_cost
    end,
    model = coalesce(p_model, model),
    updated_at = now()
  where agent = 'discovery' and period_month = trim(p_period_month)
  returning * into row;

  return row;
end;
$$;

revoke all on function public.reserve_ai_discovery_quota(
  text, integer, text, integer, bigint, text
) from public;
revoke all on function public.reserve_ai_discovery_quota(
  text, integer, text, integer, bigint, text
) from anon;
revoke all on function public.reserve_ai_discovery_quota(
  text, integer, text, integer, bigint, text
) from authenticated;
grant execute on function public.reserve_ai_discovery_quota(
  text, integer, text, integer, bigint, text
) to service_role;

revoke all on function public.increment_ai_discovery_tokens(
  text, bigint, bigint, numeric, text
) from public;
revoke all on function public.increment_ai_discovery_tokens(
  text, bigint, bigint, numeric, text
) from anon;
revoke all on function public.increment_ai_discovery_tokens(
  text, bigint, bigint, numeric, text
) from authenticated;
grant execute on function public.increment_ai_discovery_tokens(
  text, bigint, bigint, numeric, text
) to service_role;

comment on table public.ai_discovery_sessions is
  'Discovery assistant (/asistente) session counters — isolated from ai_chatbot_sessions.';
comment on table public.ai_discovery_usage is
  'Discovery assistant monthly usage — isolated from restaurant ai_chatbot_usage.';
comment on function public.reserve_ai_discovery_quota is
  'Atomic discovery session + monthly quota reserve (service_role only).';
