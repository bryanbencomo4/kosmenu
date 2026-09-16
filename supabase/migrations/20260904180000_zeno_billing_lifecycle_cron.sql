-- Enable hourly SaaS billing lifecycle in production.
-- Marks past_due subscriptions, suspends after 3-day grace, unpublishes
-- non-exempt menus, and triggers Edge Function reconcile for missed Zeno webhooks.

insert into public.internal_worker_secrets (worker_name, secret)
values (
  'billing_lifecycle_worker',
  md5(random()::text || clock_timestamp()::text || 'billing_lifecycle_worker') ||
  md5(clock_timestamp()::text || random()::text || 'qqhberaayhohxlbbhdyi')
)
on conflict (worker_name) do nothing;

create or replace function public.trigger_billing_lifecycle()
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_secret text;
  v_request_id bigint;
begin
  select secret into v_secret
  from public.internal_worker_secrets
  where worker_name = 'billing_lifecycle_worker';

  if coalesce(trim(v_secret), '') = '' then
    raise exception 'Missing internal worker secret for billing_lifecycle_worker';
  end if;

  -- Keep the RPCs local even if the HTTP worker is down.
  perform public.mark_subscriptions_past_due();
  perform public.suspend_subscriptions_after_grace();

  select net.http_post(
    'https://qqhberaayhohxlbbhdyi.supabase.co/functions/v1/billing-lifecycle',
    '{}'::jsonb,
    '{}'::jsonb,
    jsonb_build_object(
      'Content-Type', 'application/json',
      'x-billing-worker-secret', v_secret
    ),
    4000
  )
  into v_request_id;

  return v_request_id;
end;
$$;

revoke all on function public.trigger_billing_lifecycle() from public, anon, authenticated;
grant execute on function public.trigger_billing_lifecycle() to service_role;

create extension if not exists pg_cron;

do $$
declare
  v_job_id bigint;
begin
  select jobid into v_job_id
  from cron.job
  where jobname = 'zeno-billing-lifecycle-hourly';

  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;
exception
  when undefined_table then
    null;
end;
$$;

select cron.schedule(
  'zeno-billing-lifecycle-hourly',
  '20 * * * *',
  $$select public.trigger_billing_lifecycle();$$
)
where not exists (
  select 1
  from cron.job
  where jobname = 'zeno-billing-lifecycle-hourly'
);

comment on function public.trigger_billing_lifecycle() is
  'Hourly: past_due + grace suspend + HTTP reconcile of open Zeno checkouts.';
