-- Rollback for 20261123120000_chat_presence_read_receipts.sql
-- Only drops the four additive columns. Does not touch messages or other schema.

alter table public.chat_conversations
  drop column if exists consumer_typing_until;

alter table public.chat_conversations
  drop column if exists staff_typing_until;

alter table public.chat_conversations
  drop column if exists consumer_last_read_seq;

alter table public.chat_conversations
  drop column if exists staff_last_read_seq;
