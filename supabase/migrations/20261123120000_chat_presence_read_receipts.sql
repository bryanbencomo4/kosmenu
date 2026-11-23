-- WhatsApp-like typing + read receipts on supervised conversations.
-- Safe additive columns; APIs degrade if not yet applied.

alter table public.chat_conversations
  add column if not exists consumer_typing_until timestamptz,
  add column if not exists staff_typing_until timestamptz,
  add column if not exists consumer_last_read_seq bigint not null default 0,
  add column if not exists staff_last_read_seq bigint not null default 0;

comment on column public.chat_conversations.consumer_typing_until is
  'Consumer composer typing heartbeat; null/past = not typing.';
comment on column public.chat_conversations.staff_typing_until is
  'Staff composer typing heartbeat; null/past = not typing.';
comment on column public.chat_conversations.consumer_last_read_seq is
  'Highest chat_messages.seq the consumer has seen (staff ticks → blue).';
comment on column public.chat_conversations.staff_last_read_seq is
  'Highest chat_messages.seq staff has seen (consumer ticks → blue).';
