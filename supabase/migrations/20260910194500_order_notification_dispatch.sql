-- Idempotency for order notifications (WhatsApp + push) when both pg_net trigger
-- and explicit API dispatch fire for the same pedido event.

create table if not exists public.order_notification_dedup (
  pedido_id uuid not null,
  channel text not null check (channel in ('whatsapp', 'push')),
  event_type text not null check (event_type in ('INSERT', 'UPDATE')),
  status_key text not null,
  created_at timestamptz not null default now(),
  primary key (pedido_id, channel, event_type, status_key)
);

create index if not exists order_notification_dedup_created_at_idx
  on public.order_notification_dedup (created_at desc);

alter table public.order_notification_dedup enable row level security;

revoke all on public.order_notification_dedup from public;
revoke all on public.order_notification_dedup from anon;
revoke all on public.order_notification_dedup from authenticated;
grant all on public.order_notification_dedup to service_role;

insert into public.internal_worker_secrets (worker_name, secret)
values (
  'notify_order_worker',
  md5(random()::text || clock_timestamp()::text || 'notify_order_worker') ||
  md5(clock_timestamp()::text || random()::text || 'qqhberaayhohxlbbhdyi')
)
on conflict (worker_name) do nothing;

create or replace function public.notify_order_webhook_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_secret text;
begin
  if TG_OP = 'UPDATE' and NEW.estado is not distinct from OLD.estado then
    return NEW;
  end if;

  select secret into v_secret
  from public.internal_worker_secrets
  where worker_name = 'notify_order_worker';

  perform net.http_post(
    'https://qqhberaayhohxlbbhdyi.supabase.co/functions/v1/notify-order',
    jsonb_build_object(
      'type', TG_OP,
      'table', 'pedidos',
      'schema', 'public',
      'record', to_jsonb(NEW),
      'old_record', case when TG_OP = 'UPDATE' then to_jsonb(OLD) else null end
    ),
    '{}'::jsonb,
    jsonb_build_object(
      'Content-Type', 'application/json',
      'x-notify-order-secret', coalesce(v_secret, '')
    ),
    15000
  );

  return NEW;
end;
$$;

drop trigger if exists enviar_notificacion_pedido on public.pedidos;

create trigger enviar_notificacion_pedido
after insert or update of estado on public.pedidos
for each row execute function public.notify_order_webhook_trigger();
