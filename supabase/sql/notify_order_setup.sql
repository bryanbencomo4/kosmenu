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
