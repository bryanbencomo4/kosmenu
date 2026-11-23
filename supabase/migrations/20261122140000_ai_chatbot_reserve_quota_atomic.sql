-- Phase 2.2 — atomic session + monthly chatbot quota reserve (single transaction).
-- PREPARED ONLY. Do NOT apply to production until authorized.
-- Fixes: session counter leak when monthly increment fails after session reserve.

create or replace function public.reserve_ai_chatbot_quota(
  p_session_id text,
  p_commerce_id uuid,
  p_max_session_requests integer,
  p_period_month text,
  p_max_monthly_requests integer,
  p_max_monthly_tokens bigint,
  p_is_new_conversation boolean default false,
  p_model text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  session_row public.ai_chatbot_sessions;
  usage_row public.ai_chatbot_usage;
  next_requests integer;
  next_tokens bigint;
  commerce_ok boolean;
begin
  if p_session_id is null or length(trim(p_session_id)) < 8 then
    raise exception 'invalid chatbot session' using errcode = '22023';
  end if;
  if p_period_month is null or length(trim(p_period_month)) < 7 then
    raise exception 'invalid chatbot period' using errcode = '22023';
  end if;

  -- Immediate kill switch: chatbot_enabled must be true (no deploy needed to disable).
  select coalesce(c.chatbot_enabled, false) into commerce_ok
  from public.comercios c
  where c.id = p_commerce_id;

  if commerce_ok is distinct from true then
    raise exception 'chatbot commerce disabled' using errcode = 'P0001';
  end if;

  -- Session lock + increment
  insert into public.ai_chatbot_sessions as s (session_id, commerce_id, requests)
  values (trim(p_session_id), p_commerce_id, 0)
  on conflict (session_id) do nothing;

  select * into session_row
  from public.ai_chatbot_sessions
  where session_id = trim(p_session_id)
  for update;

  if session_row.commerce_id <> p_commerce_id then
    raise exception 'chatbot session tenant mismatch' using errcode = 'P0001';
  end if;

  if session_row.requests >= p_max_session_requests then
    raise exception 'chatbot session request limit' using errcode = 'P0001';
  end if;

  -- Monthly lock + limit check BEFORE mutating either counter permanently
  insert into public.ai_chatbot_usage as u (
    commerce_id, period_month, requests, conversations,
    tokens_input, tokens_output, estimated_cost, errors, model
  ) values (
    p_commerce_id, trim(p_period_month), 0, 0, 0, 0, null, 0, p_model
  )
  on conflict (commerce_id, period_month) do nothing;

  select * into usage_row
  from public.ai_chatbot_usage
  where commerce_id = p_commerce_id and period_month = trim(p_period_month)
  for update;

  next_requests := usage_row.requests + 1;
  next_tokens := usage_row.tokens_input + usage_row.tokens_output;

  if p_max_monthly_requests is not null and next_requests > p_max_monthly_requests then
    raise exception 'chatbot monthly request limit' using errcode = 'P0001';
  end if;
  if p_max_monthly_tokens is not null and next_tokens >= p_max_monthly_tokens then
    raise exception 'chatbot monthly token limit' using errcode = 'P0001';
  end if;

  update public.ai_chatbot_sessions
  set requests = requests + 1, updated_at = now()
  where session_id = trim(p_session_id)
  returning * into session_row;

  update public.ai_chatbot_usage
  set
    requests = next_requests,
    conversations = conversations + case when p_is_new_conversation then 1 else 0 end,
    model = coalesce(p_model, model),
    updated_at = now()
  where commerce_id = p_commerce_id and period_month = trim(p_period_month)
  returning * into usage_row;

  return jsonb_build_object(
    'session', to_jsonb(session_row),
    'period', to_jsonb(usage_row)
  );
end;
$$;

revoke all on function public.reserve_ai_chatbot_quota(
  text, uuid, integer, text, integer, bigint, boolean, text
) from public;
grant execute on function public.reserve_ai_chatbot_quota(
  text, uuid, integer, text, integer, bigint, boolean, text
) to service_role;

comment on function public.reserve_ai_chatbot_quota is
  'Phase 2.2 atomic chatbot quota reserve (session + monthly) in one transaction.';
