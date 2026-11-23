-- Discovery Assistant — durable request_id ledger for cross-instance idempotency.
-- PREPARED ONLY. Do NOT apply to production until authorized.
--
-- Isolates from restaurant chatbot: ai_discovery_* only (never ai_chatbot_*).
-- Extends existing reserve/increment RPCs with optional p_request_id.
-- When p_request_id is present:
--   - reserve is atomic + idempotent (same request_id never double-increments)
--   - token increment is atomic + idempotent (same request_id never double-counts tokens)
-- When p_request_id is null (e.g. synthetic HTTP budget slots): legacy behavior.

create table if not exists public.ai_discovery_request_ledger (
  request_id text primary key,
  session_id text not null,
  period_month text not null,
  reserved_at timestamptz not null default now(),
  tokens_recorded_at timestamptz null,
  tokens_input bigint not null default 0 check (tokens_input >= 0),
  tokens_output bigint not null default 0 check (tokens_output >= 0),
  model text null,
  constraint ai_discovery_request_id_format
    check (request_id ~ '^r_[a-zA-Z0-9]{8,40}$')
);

alter table public.ai_discovery_request_ledger enable row level security;

revoke all on table public.ai_discovery_request_ledger from public;
revoke all on table public.ai_discovery_request_ledger from anon;
revoke all on table public.ai_discovery_request_ledger from authenticated;
grant all on table public.ai_discovery_request_ledger to service_role;

create index if not exists idx_ai_discovery_request_ledger_session
  on public.ai_discovery_request_ledger (session_id);

create index if not exists idx_ai_discovery_request_ledger_period
  on public.ai_discovery_request_ledger (period_month);

-- Replace reserve with request_id-aware version (same name + new trailing arg with default).
drop function if exists public.reserve_ai_discovery_quota(
  text, integer, text, integer, bigint, text
);

create or replace function public.reserve_ai_discovery_quota(
  p_session_id text,
  p_max_session_requests integer,
  p_period_month text,
  p_max_monthly_requests integer,
  p_max_monthly_tokens bigint default null,
  p_model text default null,
  p_request_id text default null
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
  req_id text;
  inserted_id text;
  existing public.ai_discovery_request_ledger;
begin
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

  req_id := nullif(trim(coalesce(p_request_id, '')), '');
  if req_id is not null then
    if req_id !~ '^r_[a-zA-Z0-9]{8,40}$' then
      raise exception 'invalid discovery request id' using errcode = '22023';
    end if;

    insert into public.ai_discovery_request_ledger as l (
      request_id, session_id, period_month, reserved_at, model
    ) values (
      req_id, trim(p_session_id), trim(p_period_month), now(), p_model
    )
    on conflict (request_id) do nothing
    returning request_id into inserted_id;

    if inserted_id is null then
      -- Idempotent retry: prior reserve already counted. Do not increment again.
      select * into existing
      from public.ai_discovery_request_ledger
      where request_id = req_id;

      select * into session_row
      from public.ai_discovery_sessions
      where session_id = existing.session_id;

      select * into usage_row
      from public.ai_discovery_usage
      where agent = 'discovery' and period_month = existing.period_month;

      return jsonb_build_object(
        'session', to_jsonb(session_row),
        'period', to_jsonb(usage_row),
        'idempotent', true,
        'request_id', req_id
      );
    end if;
  end if;

  insert into public.ai_discovery_sessions as s (session_id, requests)
  values (trim(p_session_id), 0)
  on conflict (session_id) do nothing;

  select * into session_row
  from public.ai_discovery_sessions
  where session_id = trim(p_session_id)
  for update;

  if session_row.requests >= p_max_session_requests then
    -- Roll back ledger claim so a later retry with same request_id can re-attempt
    -- after capacity frees (or fail cleanly). Fail-closed for this attempt.
    if req_id is not null then
      delete from public.ai_discovery_request_ledger where request_id = req_id;
    end if;
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
    if req_id is not null then
      delete from public.ai_discovery_request_ledger where request_id = req_id;
    end if;
    raise exception 'discovery monthly request limit' using errcode = 'P0001';
  end if;
  if p_max_monthly_tokens is not null and next_tokens >= p_max_monthly_tokens then
    if req_id is not null then
      delete from public.ai_discovery_request_ledger where request_id = req_id;
    end if;
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
    'period', to_jsonb(usage_row),
    'idempotent', false,
    'request_id', req_id
  );
end;
$$;

drop function if exists public.increment_ai_discovery_tokens(
  text, bigint, bigint, numeric, text
);

create or replace function public.increment_ai_discovery_tokens(
  p_period_month text,
  p_tokens_input bigint default 0,
  p_tokens_output bigint default 0,
  p_estimated_cost numeric default null,
  p_model text default null,
  p_request_id text default null
)
returns public.ai_discovery_usage
language plpgsql
security definer
set search_path = public
as $$
declare
  row public.ai_discovery_usage;
  req_id text;
  claimed public.ai_discovery_request_ledger;
  tin bigint := greatest(coalesce(p_tokens_input, 0), 0);
  tout bigint := greatest(coalesce(p_tokens_output, 0), 0);
begin
  if p_period_month is null or length(trim(p_period_month)) < 7 then
    raise exception 'invalid discovery period' using errcode = '22023';
  end if;

  req_id := nullif(trim(coalesce(p_request_id, '')), '');

  if req_id is not null then
    if req_id !~ '^r_[a-zA-Z0-9]{8,40}$' then
      raise exception 'invalid discovery request id' using errcode = '22023';
    end if;

    update public.ai_discovery_request_ledger
    set
      tokens_recorded_at = now(),
      tokens_input = tin,
      tokens_output = tout,
      model = coalesce(p_model, model)
    where request_id = req_id
      and tokens_recorded_at is null
    returning * into claimed;

    if not found then
      -- Already recorded (idempotent) or missing reserve.
      if exists (
        select 1
        from public.ai_discovery_request_ledger
        where request_id = req_id and tokens_recorded_at is not null
      ) then
        select * into row
        from public.ai_discovery_usage
        where agent = 'discovery' and period_month = trim(p_period_month);
        return row;
      end if;
      -- Fail-safe: never inflate tokens without a prior reserve claim.
      raise exception 'discovery request not reserved' using errcode = 'P0001';
    end if;
  end if;

  insert into public.ai_discovery_usage as u (
    agent, period_month, requests, tokens_input, tokens_output, estimated_cost, errors, model
  ) values (
    'discovery', trim(p_period_month), 0, 0, 0, null, 0, p_model
  )
  on conflict (agent, period_month) do nothing;

  update public.ai_discovery_usage
  set
    tokens_input = tokens_input + tin,
    tokens_output = tokens_output + tout,
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
  text, integer, text, integer, bigint, text, text
) from public;
revoke all on function public.reserve_ai_discovery_quota(
  text, integer, text, integer, bigint, text, text
) from anon;
revoke all on function public.reserve_ai_discovery_quota(
  text, integer, text, integer, bigint, text, text
) from authenticated;
grant execute on function public.reserve_ai_discovery_quota(
  text, integer, text, integer, bigint, text, text
) to service_role;

revoke all on function public.increment_ai_discovery_tokens(
  text, bigint, bigint, numeric, text, text
) from public;
revoke all on function public.increment_ai_discovery_tokens(
  text, bigint, bigint, numeric, text, text
) from anon;
revoke all on function public.increment_ai_discovery_tokens(
  text, bigint, bigint, numeric, text, text
) from authenticated;
grant execute on function public.increment_ai_discovery_tokens(
  text, bigint, bigint, numeric, text, text
) to service_role;

comment on table public.ai_discovery_request_ledger is
  'Discovery /asistente durable request_id ledger — idempotent reserve + token posts.';
comment on function public.reserve_ai_discovery_quota(
  text, integer, text, integer, bigint, text, text
) is
  'Atomic discovery reserve; optional p_request_id makes retries idempotent across instances.';
comment on function public.increment_ai_discovery_tokens(
  text, bigint, bigint, numeric, text, text
) is
  'Atomic discovery token increment; optional p_request_id prevents double-count across instances.';
