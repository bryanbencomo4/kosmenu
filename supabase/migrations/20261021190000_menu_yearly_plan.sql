-- Annual plan at $90 (marketing) so checkout can charge the yearly price
-- instead of 12 × monthly.

insert into public.plans (
  code, name, description, price_amount, price_currency, billing_interval, is_active, features
)
values (
  'menu_yearly',
  'Menú Digital Anual',
  'Menú digital con QR, pedidos, panel y kit portamenú. Pago anual.',
  90,
  'USD',
  'year',
  true,
  jsonb_build_array(
    'Menú digital con QR',
    'Pedidos por WhatsApp',
    'Panel de administración',
    'Soporte técnico',
    '4 portamenús físicos incluidos'
  )
)
on conflict (code) do update
set
  name = excluded.name,
  description = excluded.description,
  price_amount = excluded.price_amount,
  price_currency = excluded.price_currency,
  billing_interval = excluded.billing_interval,
  is_active = excluded.is_active,
  features = excluded.features,
  updated_at = now();

-- Replace monthly-only pricing with plan-aware amount (yearly = $90 flat).
drop function if exists public.submit_manual_payment(uuid, text, integer, text, text, text, text, numeric, text);

create or replace function public.submit_manual_payment(
  p_business_id uuid,
  p_method_code text,
  p_months integer default 1,
  p_reference text default null,
  p_payer_name text default null,
  p_receipt_path text default null,
  p_advisor_code text default null,
  p_declared_amount numeric default null,
  p_declared_currency text default null,
  p_plan_code text default 'menu_monthly'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_owner uuid;
  v_method public.payment_methods%rowtype;
  v_plan public.plans%rowtype;
  v_advisor public.sales_advisors%rowtype;
  v_advisor_id uuid := null;
  v_reference text := nullif(btrim(coalesce(p_reference, '')), '');
  v_receipt text := nullif(btrim(coalesce(p_receipt_path, '')), '');
  v_submission public.payment_submissions%rowtype;
  v_plan_code text := coalesce(nullif(btrim(p_plan_code), ''), 'menu_monthly');
  v_months integer;
  v_amount numeric(12, 2);
begin
  if v_actor is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;

  select owner_id into v_owner
  from public.comercios
  where id = p_business_id;
  if v_owner is distinct from v_actor then
    raise exception 'NOT_BUSINESS_OWNER' using errcode = '42501';
  end if;

  if p_months is null or p_months < 1 or p_months > 24 then
    raise exception 'INVALID_MONTHS' using errcode = '22023';
  end if;

  select * into v_method
  from public.payment_methods
  where code = p_method_code and is_active = true;
  if not found then
    raise exception 'METHOD_NOT_AVAILABLE' using errcode = 'P0002';
  end if;
  if v_method.verification <> 'manual' then
    raise exception 'METHOD_NOT_MANUAL' using errcode = '22023';
  end if;

  if v_method.requires_reference and v_reference is null then
    raise exception 'REFERENCE_REQUIRED' using errcode = '22023';
  end if;

  if v_method.requires_receipt and v_receipt is null then
    raise exception 'RECEIPT_REQUIRED' using errcode = '22023';
  end if;

  if v_receipt is not null then
    if not exists (
      select 1
      from storage.objects o
      where o.bucket_id = 'comprobantes-suscripcion'
        and o.name = v_receipt
        and (storage.foldername(o.name))[1] = p_business_id::text
    ) then
      raise exception 'RECEIPT_NOT_FOUND' using errcode = 'P0002';
    end if;
  end if;

  if v_method.requires_advisor_code then
    select * into v_advisor
    from public.sales_advisors
    where code = upper(btrim(coalesce(p_advisor_code, '')))
      and is_active = true;
    if not found then
      raise exception 'ADVISOR_CODE_INVALID' using errcode = '22023';
    end if;
    v_advisor_id := v_advisor.id;
  end if;

  if v_plan_code not in ('menu_monthly', 'menu_yearly') then
    raise exception 'PLAN_NOT_FOUND' using errcode = 'P0002';
  end if;

  select * into v_plan
  from public.plans
  where code = v_plan_code and is_active = true;
  if not found then
    raise exception 'PLAN_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_plan.billing_interval = 'year' then
    v_months := 12;
    v_amount := round(v_plan.price_amount, 2);
  else
    v_months := p_months;
    v_amount := round(v_plan.price_amount * p_months, 2);
  end if;

  if exists (
    select 1 from public.payment_submissions
    where business_id = p_business_id and status = 'pending'
  ) then
    raise exception 'SUBMISSION_ALREADY_PENDING' using errcode = '22023';
  end if;

  begin
    insert into public.payment_submissions (
      business_id, user_id, method_code, plan_code, months, amount_usd,
      declared_amount, declared_currency, reference, payer_name, receipt_path,
      advisor_id, status
    )
    values (
      p_business_id, v_actor, v_method.code, v_plan.code, v_months,
      v_amount,
      p_declared_amount,
      nullif(btrim(upper(coalesce(p_declared_currency, ''))), ''),
      v_reference,
      nullif(btrim(coalesce(p_payer_name, '')), ''),
      v_receipt,
      v_advisor_id,
      'pending'
    )
    returning * into v_submission;
  exception
    when unique_violation then
      raise exception 'REFERENCE_ALREADY_USED' using errcode = '22023';
  end;

  return jsonb_build_object(
    'ok', true,
    'submission_id', v_submission.id,
    'status', v_submission.status,
    'amount_usd', v_submission.amount_usd,
    'review_sla_minutes', v_method.review_sla_minutes
  );
end;
$$;

revoke all on function public.submit_manual_payment(uuid, text, integer, text, text, text, text, numeric, text, text)
  from public, anon;

grant execute on function public.submit_manual_payment(uuid, text, integer, text, text, text, text, numeric, text, text)
  to authenticated, service_role;
