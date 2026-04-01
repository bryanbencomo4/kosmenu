create or replace function public.notify_order_webhook_trigger()
returns trigger
language plpgsql
security definer
as $$
begin
  perform net.http_post(
    'https://qqhberaayhohxlbbhdyi.supabase.co/functions/v1/notify-order',
    jsonb_build_object(
      'type', 'INSERT',
      'table', 'pedidos',
      'schema', 'public',
      'record', to_jsonb(NEW)
    ),
    '{}'::jsonb,
    '{"Content-Type":"application/json"}'::jsonb,
    10000
  );

  return NEW;
end;
$$;