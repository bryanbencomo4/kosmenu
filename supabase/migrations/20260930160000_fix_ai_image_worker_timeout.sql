-- Image generation takes well over 1s. The previous pg_net timeout aborted
-- the worker after the job was locked as processing, so the first click
-- charged a credit and never produced an image.

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
  update public.ai_image_jobs
  set
    status = 'pending',
    error_message = 'Requeued after stuck processing',
    started_at = null
  where status = 'processing'
    and coalesce(started_at, updated_at, created_at) < now() - interval '90 seconds';

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
    120000
  )
  into v_request_id;

  return v_request_id;
end;
$$;
