create extension if not exists pgcrypto;

create table if not exists public.wasender_message_queue (
  id uuid primary key default gen_random_uuid(),
  queue_order bigint generated always as identity unique,
  created_at timestamptz not null default clock_timestamp(),
  available_at timestamptz not null default clock_timestamp(),
  status text not null default 'queued'
    check (status in ('queued', 'processing', 'sent', 'failed')),
  source text not null,
  recipient text not null,
  message text not null,
  dedupe_key text,
  comercio_id uuid,
  pedido_id uuid,
  order_id text,
  dedup_event_type text,
  dedup_status_key text,
  delivery_invitation_id uuid,
  delivery_actor text,
  attempts integer not null default 0,
  worker_id uuid,
  last_error text,
  sent_at timestamptz
);

create unique index if not exists wasender_message_queue_dedupe_idx
  on public.wasender_message_queue (dedupe_key)
  where dedupe_key is not null;

create index if not exists wasender_message_queue_pending_idx
  on public.wasender_message_queue (queue_order)
  where status = 'queued';

create index if not exists wasender_message_queue_retention_idx
  on public.wasender_message_queue (created_at)
  where status in ('sent', 'failed');

alter table public.wasender_message_queue enable row level security;
revoke all on public.wasender_message_queue from public, anon, authenticated;
grant all on public.wasender_message_queue to service_role;
grant usage, select on sequence public.wasender_message_queue_queue_order_seq to service_role;

create table if not exists public.wasender_queue_control (
  singleton boolean primary key default true check (singleton),
  worker_id uuid,
  lease_until timestamptz,
  next_send_at timestamptz not null default clock_timestamp()
);

insert into public.wasender_queue_control (singleton)
values (true)
on conflict (singleton) do nothing;

alter table public.wasender_queue_control enable row level security;
revoke all on public.wasender_queue_control from public, anon, authenticated;
grant all on public.wasender_queue_control to service_role;

insert into public.internal_worker_secrets (worker_name, secret)
values (
  'wasender_queue_worker',
  md5(random()::text || clock_timestamp()::text || 'wasender_queue_worker') ||
  md5(clock_timestamp()::text || random()::text || 'qqhberaayhohxlbbhdyi')
)
on conflict (worker_name) do nothing;

create or replace function public.kick_wasender_message_worker()
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
  where worker_name = 'wasender_queue_worker';

  if coalesce(trim(v_secret), '') = '' then
    raise exception 'Missing internal secret for WASender queue worker';
  end if;

  select net.http_post(
    'https://qqhberaayhohxlbbhdyi.supabase.co/functions/v1/process-wasender-queue',
    '{}'::jsonb,
    '{}'::jsonb,
    jsonb_build_object(
      'Content-Type', 'application/json',
      'x-wasender-worker-secret', v_secret
    ),
    30000
  ) into v_request_id;

  return v_request_id;
end;
$$;

create or replace function public.enqueue_wasender_message(
  p_source text,
  p_recipient text,
  p_message text,
  p_dedupe_key text default null,
  p_comercio_id uuid default null,
  p_pedido_id uuid default null,
  p_order_id text default null,
  p_dedup_event_type text default null,
  p_dedup_status_key text default null,
  p_delivery_invitation_id uuid default null,
  p_delivery_actor text default null
)
returns table(queue_id uuid, queued boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_inserted boolean;
begin
  if coalesce(trim(p_recipient), '') = '' or coalesce(trim(p_message), '') = '' then
    raise exception 'WASender recipient and message are required';
  end if;

  if length(p_message) > 12000 then
    raise exception 'WASender message exceeds the supported length';
  end if;

  if nullif(trim(p_dedupe_key), '') is null then
    insert into public.wasender_message_queue (
      source, recipient, message, comercio_id, pedido_id, order_id,
      dedup_event_type, dedup_status_key, delivery_invitation_id, delivery_actor
    ) values (
      left(trim(p_source), 64), trim(p_recipient), p_message, p_comercio_id,
      p_pedido_id, nullif(trim(p_order_id), ''), p_dedup_event_type,
      p_dedup_status_key, p_delivery_invitation_id, nullif(trim(p_delivery_actor), '')
    ) returning id into v_id;
    v_inserted := true;
  else
    insert into public.wasender_message_queue (
      source, recipient, message, dedupe_key, comercio_id, pedido_id, order_id,
      dedup_event_type, dedup_status_key, delivery_invitation_id, delivery_actor
    ) values (
      left(trim(p_source), 64), trim(p_recipient), p_message,
      left(trim(p_dedupe_key), 200), p_comercio_id, p_pedido_id,
      nullif(trim(p_order_id), ''), p_dedup_event_type, p_dedup_status_key,
      p_delivery_invitation_id, nullif(trim(p_delivery_actor), '')
    )
    on conflict (dedupe_key) where dedupe_key is not null
    do update set
      status = case when wasender_message_queue.status = 'failed' then 'queued' else wasender_message_queue.status end,
      available_at = case when wasender_message_queue.status = 'failed' then clock_timestamp() else wasender_message_queue.available_at end,
      last_error = case when wasender_message_queue.status = 'failed' then null else wasender_message_queue.last_error end
    returning id, (xmax = 0) into v_id, v_inserted;
  end if;

  if v_inserted or exists (
    select 1 from public.wasender_message_queue q
    where q.id = v_id and q.status = 'queued'
  ) then
    perform public.kick_wasender_message_worker();
  end if;

  return query
  select v_id, exists (
    select 1
    from public.wasender_message_queue q
    where q.id = v_id and q.status in ('queued', 'processing')
  );
end;
$$;

create or replace function public.claim_wasender_message(p_worker_id uuid)
returns table(
  queue_id uuid,
  recipient text,
  message text,
  wait_ms integer,
  source text,
  comercio_id uuid,
  pedido_id uuid,
  order_id text,
  dedup_event_type text,
  dedup_status_key text,
  delivery_invitation_id uuid,
  delivery_actor text,
  attempts integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_control public.wasender_queue_control%rowtype;
  v_job public.wasender_message_queue%rowtype;
  v_now timestamptz := clock_timestamp();
  v_send_at timestamptz;
  v_wait_ms integer;
begin
  if p_worker_id is null then
    raise exception 'Worker id is required';
  end if;

  select * into v_control
  from public.wasender_queue_control
  where singleton = true
  for update;

  if v_control.worker_id is not null and v_control.lease_until > v_now then
    return;
  end if;

  if v_control.worker_id is not null then
    update public.wasender_message_queue
    set status = 'queued', worker_id = null, available_at = v_now
    where status = 'processing' and worker_id = v_control.worker_id;
  end if;

  select * into v_job
  from public.wasender_message_queue
  where status = 'queued' and available_at <= v_now
  order by queue_order
  limit 1
  for update skip locked;

  if not found then
    update public.wasender_queue_control
    set worker_id = null, lease_until = null
    where singleton = true;
    return;
  end if;

  v_send_at := greatest(v_now, v_control.next_send_at);
  v_wait_ms := greatest(0, ceil(extract(epoch from (v_send_at - v_now)) * 1000)::integer);

  update public.wasender_queue_control
  set worker_id = p_worker_id,
      lease_until = v_now + interval '90 seconds',
      next_send_at = v_send_at + interval '5.2 seconds'
  where singleton = true;

  update public.wasender_message_queue
  set status = 'processing', worker_id = p_worker_id, attempts = attempts + 1
  where id = v_job.id
  returning * into v_job;

  return query select
    v_job.id, v_job.recipient, v_job.message, v_wait_ms, v_job.source,
    v_job.comercio_id, v_job.pedido_id, v_job.order_id,
    v_job.dedup_event_type, v_job.dedup_status_key,
    v_job.delivery_invitation_id, v_job.delivery_actor, v_job.attempts;
end;
$$;

create or replace function public.complete_wasender_message(
  p_queue_id uuid,
  p_worker_id uuid,
  p_sent boolean,
  p_error text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.wasender_message_queue%rowtype;
  v_has_more boolean;
begin
  update public.wasender_message_queue
  set status = case when p_sent then 'sent' else 'failed' end,
      sent_at = case when p_sent then clock_timestamp() else null end,
      last_error = case when p_sent then null else left(coalesce(p_error, 'Unknown WASender error'), 240) end,
      worker_id = null
  where id = p_queue_id and status = 'processing' and worker_id = p_worker_id
  returning * into v_job;

  if not found then
    return false;
  end if;

  update public.wasender_queue_control
  set worker_id = null, lease_until = null
  where singleton = true and worker_id = p_worker_id;

  if not p_sent and v_job.pedido_id is not null and v_job.dedup_event_type is not null then
    delete from public.order_notification_dedup
    where pedido_id = v_job.pedido_id
      and channel = 'whatsapp'
      and event_type = v_job.dedup_event_type
      and status_key = v_job.dedup_status_key;
  end if;

  if v_job.delivery_invitation_id is not null then
    begin
      insert into public.delivery_invitation_events (
        invitation_id, pedido_id, order_id, event_type, actor, payload
      ) values (
        v_job.delivery_invitation_id,
        v_job.pedido_id,
        coalesce(v_job.order_id, ''),
        case when p_sent then 'notification_sent' else 'notification_failed' end,
        v_job.delivery_actor,
        jsonb_build_object(
          'channel', 'whatsapp',
          'provider', 'wasender',
          'queue_id', v_job.id,
          'error', case when p_sent then null else left(coalesce(p_error, 'unknown'), 160) end
        )
      );
    exception when foreign_key_violation then
      null;
    end;
  end if;

  select exists (
    select 1 from public.wasender_message_queue where status = 'queued'
  ) into v_has_more;

  if v_has_more then
    perform public.kick_wasender_message_worker();
  end if;

  return true;
end;
$$;

create or replace function public.retry_wasender_message(
  p_queue_id uuid,
  p_worker_id uuid,
  p_delay_ms integer,
  p_error text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_available_at timestamptz := clock_timestamp() +
    least(greatest(coalesce(p_delay_ms, 5200), 1000), 60000) * interval '1 millisecond';
begin
  update public.wasender_message_queue
  set status = 'queued',
      available_at = v_available_at,
      last_error = left(coalesce(p_error, 'Retryable WASender response'), 240),
      worker_id = null
  where id = p_queue_id
    and status = 'processing'
    and worker_id = p_worker_id;

  if not found then
    return false;
  end if;

  update public.wasender_queue_control
  set worker_id = null, lease_until = null
  where singleton = true and worker_id = p_worker_id;

  return true;
end;
$$;

create or replace function public.watchdog_wasender_message_queue()
returns bigint
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.wasender_message_queue
  where id in (
    select id
    from public.wasender_message_queue
    where status in ('sent', 'failed')
      and created_at < clock_timestamp() - interval '30 days'
    order by created_at
    limit 500
  );

  if exists (
    select 1 from public.wasender_message_queue where status in ('queued', 'processing')
  ) then
    return public.kick_wasender_message_worker();
  end if;
  return null;
end;
$$;

revoke all on function public.kick_wasender_message_worker() from public, anon, authenticated;
revoke all on function public.enqueue_wasender_message(text, text, text, text, uuid, uuid, text, text, text, uuid, text) from public, anon, authenticated;
revoke all on function public.claim_wasender_message(uuid) from public, anon, authenticated;
revoke all on function public.complete_wasender_message(uuid, uuid, boolean, text) from public, anon, authenticated;
revoke all on function public.retry_wasender_message(uuid, uuid, integer, text) from public, anon, authenticated;
revoke all on function public.watchdog_wasender_message_queue() from public, anon, authenticated;
grant execute on function public.enqueue_wasender_message(text, text, text, text, uuid, uuid, text, text, text, uuid, text) to service_role;
grant execute on function public.claim_wasender_message(uuid) to service_role;
grant execute on function public.complete_wasender_message(uuid, uuid, boolean, text) to service_role;
grant execute on function public.retry_wasender_message(uuid, uuid, integer, text) to service_role;

create extension if not exists pg_cron;

do $$
declare
  v_job_id bigint;
begin
  select jobid into v_job_id from cron.job where jobname = 'wasender-message-queue-watchdog';
  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;
exception when undefined_table then
  null;
end;
$$;

select cron.schedule(
  'wasender-message-queue-watchdog',
  '* * * * *',
  $$select public.watchdog_wasender_message_queue();$$
)
where not exists (
  select 1 from cron.job where jobname = 'wasender-message-queue-watchdog'
);