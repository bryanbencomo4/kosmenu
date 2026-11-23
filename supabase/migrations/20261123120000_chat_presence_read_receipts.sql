-- =============================================================================
-- Chat presence + read receipts (WhatsApp-like typing / blue ticks).
-- ADDITIVE ONLY — no drops, no data rewrites, no RLS changes.
-- Idempotent: safe to re-run (IF NOT EXISTS).
-- Existing rows get last_read_seq = 0 via DEFAULT (no table rewrite risk on PG 11+).
-- =============================================================================

alter table public.chat_conversations
  add column if not exists consumer_typing_until timestamptz;

alter table public.chat_conversations
  add column if not exists staff_typing_until timestamptz;

alter table public.chat_conversations
  add column if not exists consumer_last_read_seq bigint not null default 0;

alter table public.chat_conversations
  add column if not exists staff_last_read_seq bigint not null default 0;

comment on column public.chat_conversations.consumer_typing_until is
  'Consumer composer typing heartbeat; null/past = not typing.';
comment on column public.chat_conversations.staff_typing_until is
  'Staff composer typing heartbeat; null/past = not typing.';
comment on column public.chat_conversations.consumer_last_read_seq is
  'Highest chat_messages.seq the consumer has seen (staff ticks → blue).';
comment on column public.chat_conversations.staff_last_read_seq is
  'Highest chat_messages.seq staff has seen (consumer ticks → blue).';
