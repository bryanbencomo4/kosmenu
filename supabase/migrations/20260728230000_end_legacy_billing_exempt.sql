-- End legacy grandfathering: unpaid menus stay offline until Zeno payment.
-- Keeps billing_exempt column (always false) for backwards-compatible clients.
-- Does NOT enable suspension cron.

-- 0) Ensure JWT helper exists (from prior paywall migration)
create or replace function public.is_service_role_request()
returns boolean
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    ''
  ) = 'service_role';
$$;

-- 1) Replace guards FIRST so admin/service can clear exemptions
create or replace function public.enforce_comercios_billing_guards()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_service boolean;
  v_can_publish boolean;
begin
  v_service := public.is_service_role_request();

  if tg_op = 'INSERT' then
    if not v_service then
      new.billing_exempt := false;
      new.en_linea := false;
    else
      new.billing_exempt := coalesce(new.billing_exempt, false);
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if not v_service then
      if new.billing_exempt is distinct from old.billing_exempt then
        raise exception 'BILLING_EXEMPT_IMMUTABLE: billing_exempt cannot be changed by the client'
          using errcode = '42501';
      end if;
      new.billing_exempt := false;

      if new.en_linea is distinct from old.en_linea and new.en_linea = true then
        select public.commerce_has_active_subscription(new.id) into v_can_publish;
        if not coalesce(v_can_publish, false) then
          raise exception 'PAYMENT_REQUIRED: Active subscription required to publish menu'
            using errcode = '42501';
        end if;
      end if;
    else
      -- Service / migration path: always clear exemption; may publish after pay.
      new.billing_exempt := false;
    end if;
    return new;
  end if;

  return new;
end;
$$;

-- 2) Run clearance as service_role so the guard allows it
select set_config('request.jwt.claim.role', 'service_role', true);

update public.comercios
set billing_exempt = false
where billing_exempt = true;

update public.comercios c
set en_linea = false
where c.en_linea = true
  and not exists (
    select 1
    from public.subscriptions s
    where s.business_id = c.id
      and s.status = 'active'
  );

comment on column public.comercios.billing_exempt is
  'Deprecated. Always false. Publish requires an active Zeno subscription.';

comment on column public.comercios.en_linea is
  'Public visibility. Requires active subscription; unpaid commerces stay false.';

-- 3) Publish helper: active subscription only
create or replace function public.commerce_can_publish(p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.commerce_has_active_subscription(p_business_id);
$$;

-- 4) Suspend helper: unpublish any suspended commerce (no exemption)
create or replace function public.suspend_subscriptions_after_grace(p_now timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  update public.subscriptions s
  set
    status = 'suspended',
    updated_at = p_now
  where s.status = 'past_due'
    and s.grace_period_end is not null
    and s.grace_period_end < p_now;

  get diagnostics v_count = row_count;

  update public.comercios c
  set en_linea = false
  where c.en_linea = true
    and exists (
      select 1
      from public.subscriptions s
      where s.business_id = c.id
        and s.status = 'suspended'
        and s.grace_period_end is not null
        and s.grace_period_end < p_now
    );

  return v_count;
end;
$$;

comment on function public.suspend_subscriptions_after_grace(timestamptz) is
  'Suspend after grace and unpublish; no billing_exempt bypass.';
