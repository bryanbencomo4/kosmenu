-- Local migration only — do NOT apply remotely until reviewed.
-- Adds hashed public tracking tokens for customer order pages.

alter table public.pedidos
  add column if not exists public_tracking_token_hash text;

comment on column public.pedidos.public_tracking_token_hash is
  'SHA-256 hex digest of the unguessable public tracking token. Plaintext token is never stored.';

-- Unique when present (legacy rows may remain null until backfill).
create unique index if not exists pedidos_public_tracking_token_hash_uidx
  on public.pedidos (public_tracking_token_hash)
  where public_tracking_token_hash is not null;

-- Optional integrity: hash must look like sha256 hex when set.
alter table public.pedidos
  drop constraint if exists pedidos_public_tracking_token_hash_format;

alter table public.pedidos
  add constraint pedidos_public_tracking_token_hash_format
  check (
    public_tracking_token_hash is null
    or public_tracking_token_hash ~ '^[a-f0-9]{64}$'
  );

-- Backfill strategy (manual, after deploy of app that mints tokens):
-- New orders always set the hash.
-- Existing orders without hash cannot be opened via public tracking until
-- an operator regenerates a token (recommended one-off script using service role).
-- Do NOT derive tokens from order_id or timestamps.
