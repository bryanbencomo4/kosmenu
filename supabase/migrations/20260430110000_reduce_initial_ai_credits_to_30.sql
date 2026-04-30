create or replace function public.ensure_ai_credits_wallet(
  p_commerce_id uuid,
  p_initial_credits numeric default 30
)
returns public.ai_credits_wallet
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.ai_credits_wallet;
  v_initial numeric := greatest(coalesce(p_initial_credits, 0), 0);
begin
  insert into public.ai_credits_wallet (
    commerce_id,
    credits_balance,
    credits_used
  )
  values (
    p_commerce_id,
    v_initial,
    0
  )
  on conflict (commerce_id) do nothing;

  if found and v_initial > 0 then
    insert into public.ai_credits_transactions (
      commerce_id,
      type,
      amount,
      reason,
      metadata
    )
    values (
      p_commerce_id,
      'credit',
      v_initial,
      'initial_signup_credits',
      jsonb_build_object('source', 'ensure_wallet')
    );
  end if;

  select * into v_row
  from public.ai_credits_wallet
  where commerce_id = p_commerce_id;

  if not found then
    raise exception 'Could not ensure AI credits wallet for commerce %', p_commerce_id;
  end if;

  return v_row;
end;
$$;

create or replace function public.add_ai_credits(
  p_commerce_id uuid,
  p_amount numeric,
  p_reason text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns public.ai_credits_wallet
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.ai_credits_wallet;
  v_amount numeric := greatest(coalesce(p_amount, 0), 0);
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_is_refund boolean := coalesce(v_reason, '') ilike '%refund%';
begin
  perform public.ensure_ai_credits_wallet(p_commerce_id, 30);

  if v_amount <= 0 then
    select * into v_row from public.ai_credits_wallet where commerce_id = p_commerce_id;
    return v_row;
  end if;

  update public.ai_credits_wallet
  set
    credits_balance = credits_balance + v_amount,
    credits_used = case
      when v_is_refund then greatest(credits_used - v_amount, 0)
      else credits_used
    end,
    updated_at = now()
  where commerce_id = p_commerce_id
  returning * into v_row;

  insert into public.ai_credits_transactions (
    commerce_id,
    type,
    amount,
    reason,
    metadata
  )
  values (
    p_commerce_id,
    'credit',
    v_amount,
    v_reason,
    coalesce(p_metadata, '{}'::jsonb)
  );

  return v_row;
end;
$$;

create or replace function public.deduct_ai_credits(
  p_commerce_id uuid,
  p_amount numeric,
  p_reason text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns public.ai_credits_wallet
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.ai_credits_wallet;
  v_amount numeric := greatest(coalesce(p_amount, 0), 0);
begin
  perform public.ensure_ai_credits_wallet(p_commerce_id, 30);

  if v_amount <= 0 then
    select * into v_row from public.ai_credits_wallet where commerce_id = p_commerce_id;
    return v_row;
  end if;

  update public.ai_credits_wallet
  set
    credits_balance = credits_balance - v_amount,
    credits_used = credits_used + v_amount,
    updated_at = now()
  where commerce_id = p_commerce_id
    and credits_balance >= v_amount
  returning * into v_row;

  if not found then
    raise exception 'Not enough credits';
  end if;

  insert into public.ai_credits_transactions (
    commerce_id,
    type,
    amount,
    reason,
    metadata
  )
  values (
    p_commerce_id,
    'debit',
    v_amount,
    nullif(trim(coalesce(p_reason, '')), ''),
    coalesce(p_metadata, '{}'::jsonb)
  );

  return v_row;
end;
$$;

create or replace function public.trg_seed_ai_credits_wallet()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.ensure_ai_credits_wallet(new.id, 30);
  return new;
end;
$$;

revoke all on function public.ensure_ai_credits_wallet(uuid, numeric) from public;
revoke all on function public.ensure_ai_credits_wallet(uuid, numeric) from anon;
revoke all on function public.ensure_ai_credits_wallet(uuid, numeric) from authenticated;
grant execute on function public.ensure_ai_credits_wallet(uuid, numeric) to service_role;

revoke all on function public.add_ai_credits(uuid, numeric, text, jsonb) from public;
revoke all on function public.add_ai_credits(uuid, numeric, text, jsonb) from anon;
revoke all on function public.add_ai_credits(uuid, numeric, text, jsonb) from authenticated;
grant execute on function public.add_ai_credits(uuid, numeric, text, jsonb) to service_role;

revoke all on function public.deduct_ai_credits(uuid, numeric, text, jsonb) from public;
revoke all on function public.deduct_ai_credits(uuid, numeric, text, jsonb) from anon;
revoke all on function public.deduct_ai_credits(uuid, numeric, text, jsonb) from authenticated;
grant execute on function public.deduct_ai_credits(uuid, numeric, text, jsonb) to service_role;