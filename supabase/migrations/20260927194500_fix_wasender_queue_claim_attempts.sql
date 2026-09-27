create or replace function public.claim_wasender_message(
  p_worker_id uuid,
  p_has_secondary boolean
)
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
  attempts integer,
  session_key text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_control public.wasender_queue_control%rowtype;
  v_job public.wasender_message_queue%rowtype;
  v_now timestamptz := clock_timestamp();
  v_primary_send_at timestamptz;
  v_secondary_send_at timestamptz;
  v_send_at timestamptz;
  v_wait_ms integer;
  v_session_key text;
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
    set status = 'queued', worker_id = null, session_key = null, available_at = v_now
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

  v_primary_send_at := greatest(v_now, v_control.primary_next_send_at);
  if p_has_secondary then
    v_secondary_send_at := greatest(v_now, v_control.secondary_next_send_at);
  else
    v_secondary_send_at := 'infinity'::timestamptz;
  end if;

  if v_secondary_send_at < v_primary_send_at then
    v_session_key := 'secondary';
    v_send_at := v_secondary_send_at;
  else
    v_session_key := 'primary';
    v_send_at := v_primary_send_at;
  end if;

  v_wait_ms := greatest(0, ceil(extract(epoch from (v_send_at - v_now)) * 1000)::integer);

  update public.wasender_queue_control
  set worker_id = p_worker_id,
      lease_until = v_now + interval '90 seconds',
      next_send_at = v_send_at + interval '5.2 seconds',
      primary_next_send_at = case
        when v_session_key = 'primary' then v_send_at + interval '5.2 seconds'
        else primary_next_send_at
      end,
      secondary_next_send_at = case
        when v_session_key = 'secondary' then v_send_at + interval '5.2 seconds'
        else secondary_next_send_at
      end
  where singleton = true;

  update public.wasender_message_queue as queue_row
  set status = 'processing',
      worker_id = p_worker_id,
      session_key = v_session_key,
      attempts = queue_row.attempts + 1
  where queue_row.id = v_job.id
  returning queue_row.* into v_job;

  return query select
    v_job.id, v_job.recipient, v_job.message, v_wait_ms, v_job.source,
    v_job.comercio_id, v_job.pedido_id, v_job.order_id,
    v_job.dedup_event_type, v_job.dedup_status_key,
    v_job.delivery_invitation_id, v_job.delivery_actor, v_job.attempts,
    v_job.session_key;
end;
$$;

revoke all on function public.claim_wasender_message(uuid, boolean) from public, anon, authenticated;
grant execute on function public.claim_wasender_message(uuid, boolean) to service_role;