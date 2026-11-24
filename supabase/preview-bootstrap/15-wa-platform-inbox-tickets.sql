-- PREVIEW BOOTSTRAP ONLY — DO NOT APPLY TO PRODUCTION
-- Allowed project ref: gsfxqzvmyzjjgpigrste (kosmenu-preview)
-- Forbidden: qqhberaayhohxlbbhdyi (production)
--
-- Twin of supabase/migrations/20261124130000_wa_platform_inbox_tickets.sql
-- Own objects only. Independent of pedidos / wasender_message_queue / chat_supervision.

create table if not exists public.wa_platform_inbox_conversations (
  from_digits text primary key,
  display_name text null,
  status text not null default 'pending',
  assigned_operator_id text null,
  assigned_operator_label text null,
  last_message_text text not null default '',
  last_message_at_ms bigint not null default 0,
  unread_count int not null default 0,
  attention_version bigint not null default 0,
  context_role text null,
  context_note text null,
  updated_at_ms bigint not null,
  closed_at_ms bigint null
);

create table if not exists public.wa_platform_inbox_messages (
  id text primary key,
  from_digits text not null references public.wa_platform_inbox_conversations(from_digits) on delete cascade,
  role text not null,
  text text not null,
  at_ms bigint not null,
  client_message_id text null,
  operator_id text null,
  outbound_id text null
);

create index if not exists wa_platform_inbox_messages_chat_at_idx
  on public.wa_platform_inbox_messages (from_digits, at_ms);

create unique index if not exists wa_platform_inbox_messages_client_uidx
  on public.wa_platform_inbox_messages (from_digits, client_message_id)
  where client_message_id is not null;

create table if not exists public.wa_platform_support_tickets (
  id text primary key,
  from_digits text not null,
  text text not null default '',
  context text null,
  status text not null default 'pending',
  created_at_ms bigint not null,
  notified boolean not null default false,
  notify_error text null,
  updated_at_ms bigint not null
);

create index if not exists wa_platform_support_tickets_pending_idx
  on public.wa_platform_support_tickets (status, created_at_ms desc);

create index if not exists wa_platform_support_tickets_contact_idx
  on public.wa_platform_support_tickets (from_digits, created_at_ms desc);

create unique index if not exists wa_platform_support_tickets_pending_text_uidx
  on public.wa_platform_support_tickets (from_digits, md5(text))
  where status = 'pending';

alter table public.wa_platform_inbox_conversations enable row level security;
alter table public.wa_platform_inbox_messages enable row level security;
alter table public.wa_platform_support_tickets enable row level security;

revoke all on table public.wa_platform_inbox_conversations from anon, authenticated;
revoke all on table public.wa_platform_inbox_messages from anon, authenticated;
revoke all on table public.wa_platform_support_tickets from anon, authenticated;

grant select, insert, update, delete on table public.wa_platform_inbox_conversations to service_role;
grant select, insert, update, delete on table public.wa_platform_inbox_messages to service_role;
grant select, insert, update, delete on table public.wa_platform_support_tickets to service_role;
