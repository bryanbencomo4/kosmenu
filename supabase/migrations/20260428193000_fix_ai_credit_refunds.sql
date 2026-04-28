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
  perform public.ensure_ai_credits_wallet(p_commerce_id, 100);

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

update public.ai_credits_wallet wallet
set
  credits_used = usage.net_used,
  updated_at = now()
from (
  select
    commerce_id,
    greatest(
      coalesce(
        sum(
          case
            when type = 'debit' then amount
            when type = 'credit' and coalesce(reason, '') ilike '%refund%' then -amount
            else 0
          end
        ),
        0
      ),
      0
    ) as net_used
  from public.ai_credits_transactions
  group by commerce_id
) usage
where usage.commerce_id = wallet.commerce_id;

update public.ai_credits_wallet
set credits_used = 0, updated_at = now()
where credits_used < 0;

revoke all on function public.add_ai_credits(uuid, numeric, text, jsonb) from public;
revoke all on function public.add_ai_credits(uuid, numeric, text, jsonb) from anon;
revoke all on function public.add_ai_credits(uuid, numeric, text, jsonb) from authenticated;
grant execute on function public.add_ai_credits(uuid, numeric, text, jsonb) to service_role;