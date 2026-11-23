-- =============================================================================
-- Chat supervision (merchant inbox) — REVERSIBLE, not applied without auth.
-- Source of truth for supervised conversations; Realtime is delivery only.
-- =============================================================================

create table if not exists public.chat_conversations (
  id uuid primary key default gen_random_uuid(),
  comercio_id uuid not null references public.comercios(id) on delete cascade,
  consumer_session_id text not null,
  consumer_session_hash text not null,
  status text not null default 'ai_handling'
    check (status in ('ai_handling', 'human_handling', 'needs_attention', 'closed')),
  attention_version integer not null default 1,
  assigned_user_id uuid references auth.users(id) on delete set null,
  assigned_at timestamptz,
  consumer_label text,
  last_message_at timestamptz,
  last_message_preview text,
  unread_merchant_count integer not null default 0,
  first_consumer_message_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (comercio_id, consumer_session_hash)
);

create index if not exists chat_conversations_comercio_last_idx
  on public.chat_conversations (comercio_id, last_message_at desc nulls last);

create index if not exists chat_conversations_comercio_status_idx
  on public.chat_conversations (comercio_id, status, last_message_at desc nulls last);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.chat_conversations(id) on delete cascade,
  comercio_id uuid not null references public.comercios(id) on delete cascade,
  seq bigserial,
  role text not null check (role in ('consumer', 'assistant', 'staff', 'system')),
  sender_user_id uuid references auth.users(id) on delete set null,
  body text not null default '',
  client_message_id text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (conversation_id, client_message_id)
);

create index if not exists chat_messages_conversation_seq_idx
  on public.chat_messages (conversation_id, seq);

create index if not exists chat_messages_comercio_created_idx
  on public.chat_messages (comercio_id, created_at desc);

create table if not exists public.chat_supervision_events (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.chat_conversations(id) on delete cascade,
  comercio_id uuid not null references public.comercios(id) on delete cascade,
  event_type text not null,
  dedupe_key text not null,
  channel text not null default 'whatsapp',
  status text not null default 'queued'
    check (status in ('queued', 'sent', 'failed', 'skipped')),
  last_error text,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (dedupe_key)
);

create index if not exists chat_supervision_events_conversation_idx
  on public.chat_supervision_events (conversation_id, created_at desc);

-- Consumer cannot read by guessing UUID: access via service role APIs that
-- verify session hash, or merchant membership RLS below.
alter table public.chat_conversations enable row level security;
alter table public.chat_conversations force row level security;
alter table public.chat_messages enable row level security;
alter table public.chat_messages force row level security;
alter table public.chat_supervision_events enable row level security;
alter table public.chat_supervision_events force row level security;

revoke all on table public.chat_conversations from public, anon;
revoke all on table public.chat_messages from public, anon;
revoke all on table public.chat_supervision_events from public, anon;

grant select on table public.chat_conversations to authenticated;
grant select on table public.chat_messages to authenticated;
-- Events are operational; merchants may see delivery status of their commerce.
grant select on table public.chat_supervision_events to authenticated;
grant all on table public.chat_conversations to service_role;
grant all on table public.chat_messages to service_role;
grant all on table public.chat_supervision_events to service_role;
grant usage, select on sequence public.chat_messages_seq_seq to service_role;

drop policy if exists chat_conversations_member_select on public.chat_conversations;
create policy chat_conversations_member_select
  on public.chat_conversations
  for select
  to authenticated
  using (public.is_comercio_member(comercio_id));

drop policy if exists chat_messages_member_select on public.chat_messages;
create policy chat_messages_member_select
  on public.chat_messages
  for select
  to authenticated
  using (public.is_comercio_member(comercio_id));

drop policy if exists chat_supervision_events_member_select on public.chat_supervision_events;
create policy chat_supervision_events_member_select
  on public.chat_supervision_events
  for select
  to authenticated
  using (public.is_comercio_member(comercio_id));

-- Membership check by explicit user id (panel APIs call RPCs with service_role,
-- so auth.uid() is null — never gate takeover solely on auth.uid()).
create or replace function public.chat_user_can_supervise(
  p_comercio_id uuid,
  p_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    p_user_id is not null
    and (
      exists (
        select 1
        from public.comercios c
        where c.id = p_comercio_id
          and c.owner_id = p_user_id
      )
      or exists (
        select 1
        from public.comercio_members m
        where m.comercio_id = p_comercio_id
          and m.user_id = p_user_id
          and m.status = 'active'
          and m.role = any (array['administrador', 'caja', 'marketing']::text[])
      )
    );
$$;

revoke all on function public.chat_user_can_supervise(uuid, uuid) from public, anon;
grant execute on function public.chat_user_can_supervise(uuid, uuid) to authenticated, service_role;

-- Atomic takeover: only succeeds if still ai_handling / needs_attention
-- or already assigned to the same user.
create or replace function public.chat_take_conversation(
  p_conversation_id uuid,
  p_user_id uuid
)
returns public.chat_conversations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.chat_conversations;
begin
  if p_user_id is null then
    raise exception 'unauthorized';
  end if;
  -- If called with a user JWT, forbid impersonation.
  if auth.uid() is not null and auth.uid() <> p_user_id then
    raise exception 'unauthorized';
  end if;

  update public.chat_conversations c
  set
    status = 'human_handling',
    assigned_user_id = p_user_id,
    assigned_at = clock_timestamp(),
    attention_version = c.attention_version + 1,
    updated_at = clock_timestamp()
  where c.id = p_conversation_id
    and public.chat_user_can_supervise(c.comercio_id, p_user_id)
    and (
      c.status in ('ai_handling', 'needs_attention')
      or (c.status = 'human_handling' and c.assigned_user_id = p_user_id)
    )
  returning * into v_row;

  if v_row.id is null then
    raise exception 'takeover_conflict';
  end if;

  return v_row;
end;
$$;

revoke all on function public.chat_take_conversation(uuid, uuid) from public, anon;
grant execute on function public.chat_take_conversation(uuid, uuid) to authenticated, service_role;

create or replace function public.chat_return_to_assistant(
  p_conversation_id uuid,
  p_user_id uuid
)
returns public.chat_conversations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.chat_conversations;
begin
  if p_user_id is null then
    raise exception 'unauthorized';
  end if;
  if auth.uid() is not null and auth.uid() <> p_user_id then
    raise exception 'unauthorized';
  end if;

  update public.chat_conversations c
  set
    status = 'ai_handling',
    assigned_user_id = null,
    assigned_at = null,
    attention_version = c.attention_version + 1,
    updated_at = clock_timestamp()
  where c.id = p_conversation_id
    and public.chat_user_can_supervise(c.comercio_id, p_user_id)
    and c.status = 'human_handling'
  returning * into v_row;

  if v_row.id is null then
    raise exception 'return_conflict';
  end if;

  return v_row;
end;
$$;

revoke all on function public.chat_return_to_assistant(uuid, uuid) from public, anon;
grant execute on function public.chat_return_to_assistant(uuid, uuid) to authenticated, service_role;

comment on table public.chat_conversations is
  'Supervised chatbot conversations. consumer_session_hash binds anonymous sessions; merchants access via membership RLS.';

-- Realtime publication for merchant postgres_changes (idempotent).
-- apply-chat-supervision-migration.mjs also runs this block after the file.
do $$
begin
  begin
    alter publication supabase_realtime add table public.chat_conversations;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.chat_messages;
  exception when duplicate_object then null;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- DOWN (manual rollback — do not auto-run)
-- alter publication supabase_realtime drop table if exists public.chat_messages;
-- alter publication supabase_realtime drop table if exists public.chat_conversations;
-- drop function if exists public.chat_return_to_assistant(uuid, uuid);
-- drop function if exists public.chat_take_conversation(uuid, uuid);
-- drop function if exists public.chat_user_can_supervise(uuid, uuid);
-- drop table if exists public.chat_supervision_events;
-- drop table if exists public.chat_messages;
-- drop table if exists public.chat_conversations;
-- ---------------------------------------------------------------------------
