-- LOCAL ONLY — do NOT apply remotely until Preview window.
-- Idempotency store for POST /api/orders (service_role only).

create table if not exists public.order_idempotency_keys (
  idempotency_key text primary key,
  request_hash text not null,
  order_id text not null,
  response_json jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists order_idempotency_keys_created_at_idx
  on public.order_idempotency_keys (created_at desc);

alter table public.order_idempotency_keys enable row level security;
alter table public.order_idempotency_keys force row level security;

revoke all on table public.order_idempotency_keys from anon, authenticated, public;
grant all on table public.order_idempotency_keys to service_role;

comment on table public.order_idempotency_keys is
  'Maps X-Idempotency-Key to a prior order create response. No PII required in the key.';
