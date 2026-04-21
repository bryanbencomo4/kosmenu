create or replace function public.notify_order_webhook_trigger()
returns trigger
language plpgsql
security definer
as $$
begin
  if TG_OP = 'UPDATE' and NEW.estado is not distinct from OLD.estado then
    return NEW;
  end if;

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
    '{"Content-Type":"application/json"}'::jsonb,
    10000
  );

  return NEW;
end;
$$;

drop trigger if exists enviar_notificacion_pedido on public.pedidos;

create trigger enviar_notificacion_pedido
after insert or update of estado on public.pedidos
for each row execute function public.notify_order_webhook_trigger();