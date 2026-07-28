-- Zeno billing onboarding paywall
-- - New commerces: billing_exempt=false (already default), en_linea default=false
-- - Clients cannot change billing_exempt
-- - Clients cannot set en_linea=true without active subscription (unless exempt)
-- - Does NOT alter existing en_linea / billing_exempt values
-- - Does NOT enable suspension cron

-- ---------------------------------------------------------------------------
-- Defaults for NEW rows only (existing rows unchanged)
-- ---------------------------------------------------------------------------
alter table public.comercios
  alter column billing_exempt set default false;

alter table public.comercios
  alter column en_linea set default false;

comment on column public.comercios.en_linea is
  'Public visibility. New commercios default false until paid (or billing_exempt legacy).';

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.commerce_has_active_subscription(p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.subscriptions s
    where s.business_id = p_business_id
      and s.status = 'active'
  );
$$;

revoke all on function public.commerce_has_active_subscription(uuid) from public;
grant execute on function public.commerce_has_active_subscription(uuid) to authenticated, service_role;

create or replace function public.commerce_can_publish(p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.comercios c
    where c.id = p_business_id
      and (
        c.billing_exempt = true
        or public.commerce_has_active_subscription(c.id)
      )
  );
$$;

revoke all on function public.commerce_can_publish(uuid) from public;
grant execute on function public.commerce_can_publish(uuid) to authenticated, service_role;

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

-- ---------------------------------------------------------------------------
-- BEFORE INSERT/UPDATE guard on comercios
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
      -- Clients cannot self-exempt or self-publish.
      new.billing_exempt := false;
      new.en_linea := false;
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if not v_service then
      -- billing_exempt is immutable from the client.
      if new.billing_exempt is distinct from old.billing_exempt then
        raise exception 'BILLING_EXEMPT_IMMUTABLE: billing_exempt cannot be changed by the client'
          using errcode = '42501';
      end if;
      new.billing_exempt := old.billing_exempt;

      if new.en_linea is distinct from old.en_linea and new.en_linea = true then
        if old.billing_exempt then
          return new;
        end if;

        select public.commerce_has_active_subscription(new.id) into v_can_publish;
        if not coalesce(v_can_publish, false) then
          raise exception 'PAYMENT_REQUIRED: Active subscription required to publish menu'
            using errcode = '42501';
        end if;
      end if;
    end if;
    return new;
  end if;

  return new;
end;
$$;

drop trigger if exists comercios_billing_guards on public.comercios;
create trigger comercios_billing_guards
  before insert or update on public.comercios
  for each row
  execute function public.enforce_comercios_billing_guards();

-- ---------------------------------------------------------------------------
-- Safety: never flip legacy exemption or online state in this migration
-- ---------------------------------------------------------------------------
-- Explicit no-op assertions for operators reading the migration:
-- update public.comercios set billing_exempt = ...  -- NOT DONE
-- update public.comercios set en_linea = ...        -- NOT DONE
