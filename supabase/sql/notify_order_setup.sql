-- Push notification token registry for each signed-in owner device.
create table if not exists public.user_tokens (
  user_id uuid not null references auth.users(id) on delete cascade,
  fcm_token text not null,
  device_type text not null default 'unknown',
  updated_at timestamptz not null default now(),
  primary key (user_id, fcm_token)
);

create index if not exists user_tokens_user_id_idx on public.user_tokens(user_id);

alter table public.user_tokens enable row level security;

-- Allow each authenticated user to manage only their own FCM tokens.
do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'user_tokens'
      and policyname = 'Users manage own tokens'
  ) then
    create policy "Users manage own tokens"
      on public.user_tokens
      for all
      to authenticated
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end $$;

-- Webhook trigger: send real inserted row payload to notify-order.
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
    1000
  );

  return NEW;
end;
$$;

drop trigger if exists enviar_notificacion_pedido on public.pedidos;

create trigger enviar_notificacion_pedido
after insert on public.pedidos
for each row execute function public.notify_order_webhook_trigger();
