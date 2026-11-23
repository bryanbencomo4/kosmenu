-- PREVIEW BOOTSTRAP ONLY — DO NOT APPLY TO PRODUCTION
-- Allowed project ref: gsfxqzvmyzjjgpigrste (kosmenu-preview)
-- Forbidden: qqhberaayhohxlbbhdyi (production)
--
-- Wa-entry conversational state, atomic dedupe, bot-echo registry, send locks.
-- Independent of pedidos / wasender_message_queue / chat_supervision tables.

create table if not exists public.wa_entry_threads (
  from_digits text primary key,
  state text not null,
  updated_at_ms bigint not null,
  expires_at_ms bigint not null,
  human_paused_until_ms bigint null,
  replies_last_hour bigint[] not null default '{}'::bigint[],
  last_outbound_dedupe_key text null
);

create table if not exists public.wa_entry_seen_messages (
  message_id text primary key,
  session_id text not null default 'unknown',
  claimed_at_ms bigint not null,
  created_at timestamptz not null default now()
);

create index if not exists wa_entry_seen_messages_created_at_idx
  on public.wa_entry_seen_messages (created_at);

create table if not exists public.wa_entry_outbound (
  id text primary key,
  to_digits text not null,
  text text not null default '',
  text_hash text not null,
  event_id text not null default '',
  dedupe_key text not null,
  result text not null,
  at_ms bigint not null,
  attempt int not null default 1,
  origin text not null default 'wa_entry_bot',
  created_at timestamptz not null default now()
);

create index if not exists wa_entry_outbound_echo_idx
  on public.wa_entry_outbound (to_digits, text_hash, at_ms desc);

create unique index if not exists wa_entry_outbound_dedupe_key_uidx
  on public.wa_entry_outbound (dedupe_key);

create table if not exists public.wa_entry_send_locks (
  chat_digits text primary key,
  locked_until_ms bigint not null
);

alter table public.wa_entry_threads enable row level security;
alter table public.wa_entry_seen_messages enable row level security;
alter table public.wa_entry_outbound enable row level security;
alter table public.wa_entry_send_locks enable row level security;

-- No anon/authenticated policies — service_role only (Preview key).

create or replace function public.wa_entry_try_claim_message(
  p_message_id text,
  p_session_id text default 'unknown'
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_message_id is null or length(trim(p_message_id)) = 0 then
    return false;
  end if;
  begin
    insert into public.wa_entry_seen_messages (message_id, session_id, claimed_at_ms)
    values (trim(p_message_id), coalesce(nullif(trim(p_session_id), ''), 'unknown'), (extract(epoch from now()) * 1000)::bigint);
    return true;
  exception when unique_violation then
    return false;
  end;
end;
$$;

create or replace function public.wa_entry_match_bot_echo(
  p_to_digits text,
  p_text_hash text,
  p_now_ms bigint,
  p_window_ms bigint
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.wa_entry_outbound o
    where o.to_digits = p_to_digits
      and o.text_hash = p_text_hash
      and o.origin = 'wa_entry_bot'
      and o.at_ms >= (p_now_ms - p_window_ms)
  );
$$;

create or replace function public.wa_entry_try_acquire_send_lock(
  p_chat_digits text,
  p_now_ms bigint,
  p_ttl_ms bigint
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  updated int;
begin
  insert into public.wa_entry_send_locks (chat_digits, locked_until_ms)
  values (p_chat_digits, p_now_ms + p_ttl_ms)
  on conflict (chat_digits) do update
    set locked_until_ms = excluded.locked_until_ms
    where public.wa_entry_send_locks.locked_until_ms <= p_now_ms;

  get diagnostics updated = row_count;
  return updated > 0;
end;
$$;

create or replace function public.wa_entry_release_send_lock(p_chat_digits text)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.wa_entry_send_locks where chat_digits = p_chat_digits;
$$;

revoke all on table public.wa_entry_threads from anon, authenticated;
revoke all on table public.wa_entry_seen_messages from anon, authenticated;
revoke all on table public.wa_entry_outbound from anon, authenticated;
revoke all on table public.wa_entry_send_locks from anon, authenticated;

grant execute on function public.wa_entry_try_claim_message(text, text) to service_role;
grant execute on function public.wa_entry_match_bot_echo(text, text, bigint, bigint) to service_role;
grant execute on function public.wa_entry_try_acquire_send_lock(text, bigint, bigint) to service_role;
grant execute on function public.wa_entry_release_send_lock(text) to service_role;
