-- Phase 2.1 — chatbot sessions + optional per-commerce kill switch.
-- PREPARED ONLY. Do NOT apply to production until authorized.
-- Independent from ai_usage_control / ai_credits_wallet.

-- Optional per-commerce enable flag (default false until Plan Pro / ops enable it).
alter table public.comercios
  add column if not exists chatbot_enabled boolean not null default false;

comment on column public.comercios.chatbot_enabled is
  'Public sales chatbot. Separate from ai_enabled (panel Gemini tools).';

-- Session counters (anonymous consumers). Service role only.
create table if not exists public.ai_chatbot_sessions (
  session_id text primary key,
  commerce_id uuid not null references public.comercios(id) on delete cascade,
  requests integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ai_chatbot_sessions_commerce_idx
  on public.ai_chatbot_sessions (commerce_id);

alter table public.ai_chatbot_sessions enable row level security;

-- Atomic session reserve + tenant lock
create or replace function public.reserve_ai_chatbot_session(
  p_session_id text,
  p_commerce_id uuid,
  p_max_requests integer
)
returns public.ai_chatbot_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  row public.ai_chatbot_sessions;
begin
  if p_session_id is null or length(trim(p_session_id)) < 8 then
    raise exception 'invalid chatbot session' using errcode = '22023';
  end if;

  insert into public.ai_chatbot_sessions as s (session_id, commerce_id, requests)
  values (trim(p_session_id), p_commerce_id, 0)
  on conflict (session_id) do nothing;

  select * into row
  from public.ai_chatbot_sessions
  where session_id = trim(p_session_id)
  for update;

  if row.commerce_id <> p_commerce_id then
    raise exception 'chatbot session tenant mismatch' using errcode = 'P0001';
  end if;

  if row.requests >= p_max_requests then
    raise exception 'chatbot session request limit' using errcode = 'P0001';
  end if;

  update public.ai_chatbot_sessions
  set requests = requests + 1, updated_at = now()
  where session_id = trim(p_session_id)
  returning * into row;

  return row;
end;
$$;

revoke all on function public.reserve_ai_chatbot_session(text, uuid, integer) from public;
grant execute on function public.reserve_ai_chatbot_session(text, uuid, integer) to service_role;

-- Strengthen monthly increment: reject when commerce chatbot_enabled is false (optional hard gate).
create or replace function public.increment_ai_chatbot_usage(
  p_commerce_id uuid,
  p_period_month text,
  p_requests integer default 1,
  p_conversations integer default 0,
  p_tokens_input bigint default 0,
  p_tokens_output bigint default 0,
  p_estimated_cost numeric default null,
  p_errors integer default 0,
  p_model text default null,
  p_max_requests integer default null,
  p_max_tokens bigint default null
)
returns public.ai_chatbot_usage
language plpgsql
security definer
set search_path = public
as $$
declare
  row public.ai_chatbot_usage;
  next_requests integer;
  next_tokens bigint;
  commerce_ok boolean;
begin
  -- Kill switch on any mutating reserve (p_requests > 0). Token-only updates may still record.
  if coalesce(p_requests, 0) > 0 then
    select coalesce(c.chatbot_enabled, false) into commerce_ok
    from public.comercios c
    where c.id = p_commerce_id;
    if commerce_ok is distinct from true then
      raise exception 'chatbot commerce disabled' using errcode = 'P0001';
    end if;
  end if;

  insert into public.ai_chatbot_usage as u (
    commerce_id, period_month, requests, conversations,
    tokens_input, tokens_output, estimated_cost, errors, model
  ) values (
    p_commerce_id, p_period_month, 0, 0, 0, 0, null, 0, p_model
  )
  on conflict (commerce_id, period_month) do nothing;

  select * into row
  from public.ai_chatbot_usage
  where commerce_id = p_commerce_id and period_month = p_period_month
  for update;

  next_requests := row.requests + greatest(coalesce(p_requests, 0), 0);
  next_tokens := row.tokens_input + row.tokens_output
    + greatest(coalesce(p_tokens_input, 0), 0)
    + greatest(coalesce(p_tokens_output, 0), 0);

  if p_max_requests is not null and next_requests > p_max_requests then
    raise exception 'chatbot monthly request limit' using errcode = 'P0001';
  end if;
  if p_max_tokens is not null and next_tokens > p_max_tokens then
    raise exception 'chatbot monthly token limit' using errcode = 'P0001';
  end if;

  update public.ai_chatbot_usage
  set
    requests = next_requests,
    conversations = conversations + greatest(coalesce(p_conversations, 0), 0),
    tokens_input = tokens_input + greatest(coalesce(p_tokens_input, 0), 0),
    tokens_output = tokens_output + greatest(coalesce(p_tokens_output, 0), 0),
    estimated_cost = case
      when p_estimated_cost is null then estimated_cost
      else coalesce(estimated_cost, 0) + p_estimated_cost
    end,
    errors = errors + greatest(coalesce(p_errors, 0), 0),
    model = coalesce(p_model, model),
    updated_at = now()
  where commerce_id = p_commerce_id and period_month = p_period_month
  returning * into row;

  return row;
end;
$$;

revoke all on function public.increment_ai_chatbot_usage(
  uuid, text, integer, integer, bigint, bigint, numeric, integer, text, integer, bigint
) from public;
grant execute on function public.increment_ai_chatbot_usage(
  uuid, text, integer, integer, bigint, bigint, numeric, integer, text, integer, bigint
) to service_role;
