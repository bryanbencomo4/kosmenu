-- Phase 2 / 2.1 chatbot usage (independent from ai_usage_control / photo credits).
-- PREPARED for production; do NOT apply until chatbot prod activation is authorized.
-- Local/dev uses site/.data/chatbot-usage/ (CHATBOT_QUOTA_BACKEND=filesystem).
-- Production must use postgres (see 20261122123000 for sessions + commerce flag).

create table if not exists public.ai_chatbot_usage (
  id uuid primary key default gen_random_uuid(),
  commerce_id uuid not null references public.comercios(id) on delete cascade,
  period_month text not null,
  requests integer not null default 0,
  conversations integer not null default 0,
  tokens_input bigint not null default 0,
  tokens_output bigint not null default 0,
  estimated_cost numeric(12, 6),
  errors integer not null default 0,
  model text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (commerce_id, period_month)
);

create index if not exists ai_chatbot_usage_commerce_period_idx
  on public.ai_chatbot_usage (commerce_id, period_month);

alter table public.ai_chatbot_usage enable row level security;

-- No anon/authenticated policies: service_role only via RPC.

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
begin
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
