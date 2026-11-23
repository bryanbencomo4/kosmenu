-- Switch Pago Móvil publishing checkout from BDV auto-match to manual review
-- with receipt. Keep BDV ingest tables/endpoints for ops; stop creating new
-- checkout orders so the Bridge cannot auto-activate new subscriptions.

update public.payment_methods
set
  requires_receipt = true,
  requires_reference = true,
  tagline = 'Paga desde tu banco de Venezuela. Revisamos tu comprobante.',
  instructions = 'Transfiere el monto exacto en bolívares (tasa BCV del día) a los datos de abajo. Sube una foto clara del comprobante e indica el número de referencia. Te avisamos por correo cuando lo verifiquemos (normalmente en unas horas).',
  name = 'Pago Móvil',
  review_sla_minutes = 240,
  updated_at = now()
where code = 'pago_movil';

-- Stop creating BDV pending orders for new Pago Móvil submissions that require
-- a receipt (manual review). Still sync status on existing orders if reviewed.
create or replace function public.sync_bdv_checkout_order_from_submission()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rate numeric;
  v_expected numeric;
  v_phone text;
  v_requires_receipt boolean := false;
begin
  if tg_op = 'INSERT' then
    if new.method_code is distinct from 'pago_movil' or new.status is distinct from 'pending' then
      return new;
    end if;

    select coalesce(requires_receipt, false)
    into v_requires_receipt
    from public.payment_methods
    where code = 'pago_movil';

    -- Manual receipt flow: do not open a BDV auto-match order.
    if v_requires_receipt then
      return new;
    end if;
  elsif tg_op = 'UPDATE' then
    if new.status is distinct from 'pending' then
      update public.bdv_checkout_orders
      set
        status = case new.status
          when 'approved' then 'PAID'
          when 'cancelled' then 'CANCELLED'
          when 'rejected' then 'CANCELLED'
          else status
        end,
        paid_at = case when new.status = 'approved' then coalesce(paid_at, now()) else paid_at end,
        updated_at = now()
      where submission_id = new.id
        and status = 'PENDING_PAYMENT';
      return new;
    end if;
    if new.method_code is distinct from 'pago_movil' then
      return new;
    end if;

    select coalesce(requires_receipt, false)
    into v_requires_receipt
    from public.payment_methods
    where code = 'pago_movil';

    if v_requires_receipt then
      return new;
    end if;
  end if;

  select bcv_rate into v_rate
  from public.global_market_rates
  order by updated_at desc
  limit 1;

  if v_rate is not null then
    v_expected := round(new.amount_usd * v_rate, 2);
  end if;

  select coalesce(nullif(btrim(whatsapp), ''), nullif(btrim(telefonos), ''))
  into v_phone
  from public.comercios
  where id = new.business_id;

  insert into public.bdv_checkout_orders (
    business_id, submission_id, plan_code, months, amount_usd,
    expected_amount_ves, expected_phone, reference, status
  )
  values (
    new.business_id, new.id, new.plan_code, new.months, new.amount_usd,
    v_expected, v_phone, new.reference, 'PENDING_PAYMENT'
  )
  on conflict (business_id) where status = 'PENDING_PAYMENT'
  do update set
    submission_id = excluded.submission_id,
    plan_code = excluded.plan_code,
    months = excluded.months,
    amount_usd = excluded.amount_usd,
    expected_amount_ves = excluded.expected_amount_ves,
    expected_phone = coalesce(excluded.expected_phone, public.bdv_checkout_orders.expected_phone),
    reference = coalesce(nullif(btrim(excluded.reference), ''), public.bdv_checkout_orders.reference),
    updated_at = now();

  return new;
end;
$$;

-- Cancel orphan BDV pending orders so Bridge cannot auto-activate while we
-- migrate to manual review. Pending payment_submissions stay for admin review.
update public.bdv_checkout_orders
set
  status = 'CANCELLED',
  updated_at = now()
where status = 'PENDING_PAYMENT';

comment on function public.sync_bdv_checkout_order_from_submission() is
  'Creates BDV checkout orders only when pago_movil does not require a receipt (auto mode). Manual receipt mode skips order creation.';
