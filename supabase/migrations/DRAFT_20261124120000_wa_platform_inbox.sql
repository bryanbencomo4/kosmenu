-- DRAFT — DO NOT APPLY TO PRODUCTION WITHOUT EXPLICIT AUTHORIZATION.
-- Platform WhatsApp inbox (operators of elmenuxfa.com). Own objects only.
-- Does not touch chat_* merchant supervision, pedidos, or wasender order queue.

-- create table if not exists public.wa_platform_inbox_conversations (
--   from_digits text primary key,
--   display_name text null,
--   status text not null default 'pending',
--   assigned_operator_id text null,
--   assigned_operator_label text null,
--   last_message_text text not null default '',
--   last_message_at_ms bigint not null default 0,
--   unread_count int not null default 0,
--   attention_version bigint not null default 0,
--   context_role text null,
--   context_note text null,
--   updated_at_ms bigint not null,
--   closed_at_ms bigint null
-- );

-- create table if not exists public.wa_platform_inbox_messages (
--   id text primary key,
--   from_digits text not null references public.wa_platform_inbox_conversations(from_digits) on delete cascade,
--   role text not null,
--   text text not null,
--   at_ms bigint not null,
--   client_message_id text null,
--   operator_id text null,
--   outbound_id text null
-- );

-- create index if not exists wa_platform_inbox_messages_chat_at_idx
--   on public.wa_platform_inbox_messages (from_digits, at_ms);

-- alter table public.wa_platform_inbox_conversations enable row level security;
-- alter table public.wa_platform_inbox_messages enable row level security;
-- grant select, insert, update, delete on public.wa_platform_inbox_conversations to service_role;
-- grant select, insert, update, delete on public.wa_platform_inbox_messages to service_role;
