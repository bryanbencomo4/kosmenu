-- Renewal / grace scaffolding (cron-ready; not scheduled in this phase).
-- Does NOT touch billing_exempt comercios' en_linea.

create or replace function public.mark_subscriptions_past_due(p_now timestamptz default now())
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
    status = 'past_due',
    grace_period_end = coalesce(
      s.grace_period_end,
      s.current_period_end + interval '3 days'
    ),
    updated_at = p_now
  where s.status = 'active'
    and s.current_period_end is not null
    and s.current_period_end < p_now
    and coalesce(s.cancel_at_period_end, false) = false;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.suspend_subscriptions_after_grace(p_now timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  -- Suspend subscription only; do not flip en_linea for billing_exempt (legacy).
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
  where c.billing_exempt = false
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

revoke all on function public.mark_subscriptions_past_due(timestamptz) from public, anon, authenticated;
revoke all on function public.suspend_subscriptions_after_grace(timestamptz) from public, anon, authenticated;
grant execute on function public.mark_subscriptions_past_due(timestamptz) to service_role;
grant execute on function public.suspend_subscriptions_after_grace(timestamptz) to service_role;

comment on function public.mark_subscriptions_past_due(timestamptz) is
  'Phase 2 scaffolding: mark active subscriptions past_due after current_period_end. Wire to cron later.';
comment on function public.suspend_subscriptions_after_grace(timestamptz) is
  'Phase 2 scaffolding: suspend after grace; unpublish only non-billing_exempt comercios.';
