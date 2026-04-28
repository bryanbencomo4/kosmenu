create table if not exists public.internal_worker_secrets (
  worker_name text primary key,
  secret text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.trg_touch_internal_worker_secrets_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_touch_internal_worker_secrets_updated_at on public.internal_worker_secrets;

create trigger trg_touch_internal_worker_secrets_updated_at
before update on public.internal_worker_secrets
for each row execute function public.trg_touch_internal_worker_secrets_updated_at();

insert into public.internal_worker_secrets (worker_name, secret)
values (
  'ai_image_jobs_worker',
  md5(random()::text || clock_timestamp()::text || 'ai_image_jobs_worker') ||
  md5(clock_timestamp()::text || random()::text || 'qqhberaayhohxlbbhdyi')
)
on conflict (worker_name) do nothing;

alter table public.internal_worker_secrets enable row level security;

drop policy if exists internal_worker_secrets_service_role_all on public.internal_worker_secrets;

create policy internal_worker_secrets_service_role_all
on public.internal_worker_secrets
for all
to service_role
using (true)
with check (true);

create or replace function public.trigger_ai_image_job_processing(
  p_commerce_id uuid default null,
  p_limit integer default 2
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_secret text;
  v_request_id bigint;
  v_limit integer := least(greatest(coalesce(p_limit, 2), 1), 5);
begin
  select secret into v_secret
  from public.internal_worker_secrets
  where worker_name = 'ai_image_jobs_worker';

  if coalesce(trim(v_secret), '') = '' then
    raise exception 'Missing internal worker secret for ai_image_jobs_worker';
  end if;

  select net.http_post(
    'https://qqhberaayhohxlbbhdyi.supabase.co/functions/v1/process-ai-image-jobs',
    jsonb_strip_nulls(
      jsonb_build_object(
        'comercio_id', p_commerce_id,
        'limit', v_limit,
        'source', case when p_commerce_id is null then 'cron' else 'enqueue' end
      )
    ),
    '{}'::jsonb,
    jsonb_build_object(
      'Content-Type', 'application/json',
      'x-ai-image-worker-secret', v_secret
    ),
    1000
  )
  into v_request_id;

  return v_request_id;
end;
$$;

revoke all on function public.trigger_ai_image_job_processing(uuid, integer) from public;
revoke all on function public.trigger_ai_image_job_processing(uuid, integer) from anon;
revoke all on function public.trigger_ai_image_job_processing(uuid, integer) from authenticated;
grant execute on function public.trigger_ai_image_job_processing(uuid, integer) to service_role;

create extension if not exists pg_cron;

do $$
declare
  v_job_id bigint;
begin
  select jobid into v_job_id
  from cron.job
  where jobname = 'process-ai-image-jobs-every-minute';

  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;
exception
  when undefined_table then
    null;
end;
$$;

select cron.schedule(
  'process-ai-image-jobs-every-minute',
  '* * * * *',
  $$select public.trigger_ai_image_job_processing(null, 2);$$
)
where not exists (
  select 1
  from cron.job
  where jobname = 'process-ai-image-jobs-every-minute'
);