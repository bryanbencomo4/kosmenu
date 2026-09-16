-- Restore the /v/demo showcase menu.
--
-- 20260728230000_end_legacy_billing_exempt cleared billing_exempt and set
-- en_linea = false on every commerce without an active subscription. The
-- ElMenuXFA Demo commerce is a first-party marketing asset (linked from the
-- landing page) with no owner and no Zeno subscription, so it was unpublished
-- along with the real unpaid commerces and has been serving MENU_DRAFT_MODE.
--
-- Marketing demos need a publish exemption that is independent of billing_exempt
-- (which is now deprecated and force-cleared on every write).

alter table public.comercios
  add column if not exists is_platform_demo boolean not null default false;

comment on column public.comercios.is_platform_demo is
  'First-party showcase menu (e.g. /v/demo). May publish without a subscription. Service-role only; never billable.';

-- ---------------------------------------------------------------------------
-- Publish helpers
-- ---------------------------------------------------------------------------
create or replace function public.commerce_can_publish(p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.commerce_has_active_subscription(p_business_id)
    or exists (
      select 1
      from public.comercios c
      where c.id = p_business_id
        and c.is_platform_demo = true
    );
$$;

revoke all on function public.commerce_can_publish(uuid) from public, anon;
grant execute on function public.commerce_can_publish(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Guard: clients still cannot self-publish, self-exempt, or self-flag as demo
-- ---------------------------------------------------------------------------
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
      new.is_platform_demo := false;
      new.en_linea := false;
    else
      new.billing_exempt := coalesce(new.billing_exempt, false);
      new.is_platform_demo := coalesce(new.is_platform_demo, false);
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

      if new.is_platform_demo is distinct from old.is_platform_demo then
        raise exception 'PLATFORM_DEMO_IMMUTABLE: is_platform_demo cannot be changed by the client'
          using errcode = '42501';
      end if;

      if new.en_linea is distinct from old.en_linea and new.en_linea = true then
        -- Read new.is_platform_demo rather than commerce_can_publish() so the
        -- decision does not depend on the not-yet-written row.
        if not coalesce(new.is_platform_demo, false) then
          select public.commerce_has_active_subscription(new.id) into v_can_publish;
          if not coalesce(v_can_publish, false) then
            raise exception 'PAYMENT_REQUIRED: Active subscription required to publish menu'
              using errcode = '42501';
          end if;
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

-- ---------------------------------------------------------------------------
-- Suspension sweep must never unpublish a platform demo
-- ---------------------------------------------------------------------------
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
    and c.is_platform_demo = false
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
  'Suspend after grace and unpublish; skips platform demos, no billing_exempt bypass.';

-- ---------------------------------------------------------------------------
-- Republish the demo (service_role so the guard allows the write)
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claim.role', 'service_role', true);

update public.comercios
set
  is_platform_demo = true,
  en_linea = true
where slug = 'demo';
