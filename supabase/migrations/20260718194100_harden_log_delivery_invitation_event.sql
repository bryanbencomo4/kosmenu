-- LOCAL ONLY — do NOT apply remotely until Preview review.
-- Harden log_delivery_invitation_event:
-- 1) Validate invitation/pedido/comercio/event type inside the function.
-- 2) Revoke direct EXECUTE from anon/authenticated (service_role + definer callers only).

create or replace function public.log_delivery_invitation_event(
  p_invitation_id uuid,
  p_pedido_id uuid,
  p_order_id text,
  p_event_type text,
  p_actor text,
  p_payload jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event text;
  v_inv_pedido_id uuid;
  v_inv_order_id text;
  v_inv_comercio_id uuid;
  v_pedido_comercio_id uuid;
  v_allowed boolean := false;
begin
  v_event := lower(trim(coalesce(p_event_type, '')));
  if v_event not in (
    'created',
    'accepted',
    'declined',
    'revoked',
    'expired',
    'arrived',
    'completed',
    'viewed',
    'status_changed'
  ) then
    raise exception 'EVENT_TYPE_NOT_ALLOWED' using errcode = '22023';
  end if;

  if p_invitation_id is null or p_pedido_id is null then
    raise exception 'INVITATION_OR_PEDIDO_REQUIRED' using errcode = '22023';
  end if;

  select
    i.pedido_id,
    i.order_id,
    p.comercio_id
  into
    v_inv_pedido_id,
    v_inv_order_id,
    v_inv_comercio_id
  from public.delivery_invitations i
  inner join public.pedidos p on p.id = i.pedido_id
  where i.id = p_invitation_id
  limit 1;

  if v_inv_pedido_id is null then
    raise exception 'INVITATION_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_inv_pedido_id <> p_pedido_id then
    raise exception 'INVITATION_PEDIDO_MISMATCH' using errcode = '22023';
  end if;

  if trim(coalesce(p_order_id, '')) <> ''
     and trim(coalesce(v_inv_order_id, '')) <> ''
     and trim(p_order_id) <> trim(v_inv_order_id) then
    raise exception 'INVITATION_ORDER_MISMATCH' using errcode = '22023';
  end if;

  select p.comercio_id
  into v_pedido_comercio_id
  from public.pedidos p
  where p.id = p_pedido_id
  limit 1;

  if v_pedido_comercio_id is null then
    raise exception 'PEDIDO_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_inv_comercio_id is distinct from v_pedido_comercio_id then
    raise exception 'COMERCIO_MISMATCH' using errcode = '22023';
  end if;

  -- Authorization:
  -- - service_role / definer nested calls (auth.uid() null) allowed after structural checks
  -- - authenticated callers must own the comercio
  if auth.uid() is not null then
    select exists (
      select 1
      from public.comercios c
      where c.id = v_pedido_comercio_id
        and c.owner_id = auth.uid()
    ) into v_allowed;

    if not coalesce(v_allowed, false) then
      raise exception 'EVENT_FORBIDDEN' using errcode = '42501';
    end if;
  end if;

  insert into public.delivery_invitation_events (
    invitation_id,
    pedido_id,
    order_id,
    event_type,
    actor,
    payload
  )
  values (
    p_invitation_id,
    p_pedido_id,
    nullif(trim(coalesce(p_order_id, '')), ''),
    v_event,
    nullif(trim(coalesce(p_actor, '')), ''),
    coalesce(p_payload, '{}'::jsonb)
  );
end;
$$;

revoke execute on function public.log_delivery_invitation_event(uuid, uuid, text, text, text, jsonb)
  from anon, authenticated, public;

grant execute on function public.log_delivery_invitation_event(uuid, uuid, text, text, text, jsonb)
  to service_role;

comment on function public.log_delivery_invitation_event(uuid, uuid, text, text, text, jsonb) is
  'SECURITY DEFINER event logger with invitation/pedido/comercio checks. Direct client EXECUTE revoked; use service_role or nested definer calls.';
