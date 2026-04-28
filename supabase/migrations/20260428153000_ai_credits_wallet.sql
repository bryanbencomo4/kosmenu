create table if not exists public.ai_credits_wallet (
  id uuid primary key default gen_random_uuid(),
  commerce_id uuid not null unique,
  credits_balance numeric not null default 0,
  credits_used numeric not null default 0,
  created_at timestamp not null default now(),
  updated_at timestamp not null default now()
);

create table if not exists public.ai_credits_transactions (
  id uuid primary key default gen_random_uuid(),
  commerce_id uuid not null,
  type text not null check (type in ('credit', 'debit')),
  amount numeric not null,
  reason text,
  metadata jsonb,
  created_at timestamp not null default now()
);

create or replace function public.ensure_ai_credits_wallet(
  p_commerce_id uuid,
  p_initial_credits numeric default 100
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
begin
  perform public.ensure_ai_credits_wallet(p_commerce_id, 100);

  if v_amount <= 0 then
    select * into v_row from public.ai_credits_wallet where commerce_id = p_commerce_id;
    return v_row;
  end if;

  update public.ai_credits_wallet
  set
    credits_balance = credits_balance + v_amount,
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
    nullif(trim(coalesce(p_reason, '')), ''),
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
  perform public.ensure_ai_credits_wallet(p_commerce_id, 100);

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
  perform public.ensure_ai_credits_wallet(new.id, 100);
  return new;
end;
$$;

drop trigger if exists trg_seed_ai_credits_wallet on public.comercios;

create trigger trg_seed_ai_credits_wallet
after insert on public.comercios
for each row execute function public.trg_seed_ai_credits_wallet();

insert into public.ai_credits_wallet (
  commerce_id,
  credits_balance,
  credits_used
)
select c.id, 100, 0
from public.comercios c
left join public.ai_credits_wallet w on w.commerce_id = c.id
where w.id is null;

insert into public.ai_credits_transactions (
  commerce_id,
  type,
  amount,
  reason,
  metadata
)
select c.id, 'credit', 100, 'initial_signup_credits', jsonb_build_object('source', 'backfill')
from public.comercios c
left join public.ai_credits_transactions t
  on t.commerce_id = c.id
 and t.reason = 'initial_signup_credits'
where t.id is null;

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