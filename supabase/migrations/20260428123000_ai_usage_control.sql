create extension if not exists pgcrypto;

create table if not exists public.ai_usage_control (
  id uuid primary key default gen_random_uuid(),
  commerce_id uuid not null,
  period_month text not null,
  tokens_input integer not null default 0,
  tokens_output integer not null default 0,
  requests integer not null default 0,
  estimated_cost numeric not null default 0,
  created_at timestamp not null default now(),
  updated_at timestamp not null default now(),
  unique (commerce_id, period_month)
);

alter table public.comercios
add column if not exists ai_enabled boolean not null default true;

create or replace function public.increment_ai_usage_control(
  p_commerce_id uuid,
  p_period_month text,
  p_input_tokens integer,
  p_output_tokens integer,
  p_requests integer,
  p_estimated_cost numeric
)
returns public.ai_usage_control
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.ai_usage_control;
begin
  insert into public.ai_usage_control (
    commerce_id,
    period_month,
    tokens_input,
    tokens_output,
    requests,
    estimated_cost
  )
  values (
    p_commerce_id,
    p_period_month,
    greatest(coalesce(p_input_tokens, 0), 0),
    greatest(coalesce(p_output_tokens, 0), 0),
    greatest(coalesce(p_requests, 0), 0),
    greatest(coalesce(p_estimated_cost, 0), 0)
  )
  on conflict (commerce_id, period_month)
  do update
  set
    tokens_input = ai_usage_control.tokens_input + greatest(coalesce(excluded.tokens_input, 0), 0),
    tokens_output = ai_usage_control.tokens_output + greatest(coalesce(excluded.tokens_output, 0), 0),
    requests = ai_usage_control.requests + greatest(coalesce(excluded.requests, 0), 0),
    estimated_cost = ai_usage_control.estimated_cost + greatest(coalesce(excluded.estimated_cost, 0), 0),
    updated_at = now()
  returning * into v_row;

  return v_row;
end;
$$;