-- Per-commerce Binance Pay API credentials (never exposed on public menu).
-- Access is service-role only via Next.js merchant APIs; no anon/authenticated grants.

create table if not exists public.comercio_binance_pay_credentials (
  comercio_id uuid primary key references public.comercios (id) on delete cascade,
  api_key text not null,
  api_secret text not null,
  updated_at timestamptz not null default now(),
  updated_by uuid null references auth.users (id) on delete set null,
  constraint comercio_binance_pay_credentials_api_key_nonempty
    check (char_length(trim(api_key)) > 0),
  constraint comercio_binance_pay_credentials_api_secret_nonempty
    check (char_length(trim(api_secret)) > 0)
);

create or replace function public.trg_touch_comercio_binance_pay_credentials_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_touch_comercio_binance_pay_credentials_updated_at
  on public.comercio_binance_pay_credentials;

create trigger trg_touch_comercio_binance_pay_credentials_updated_at
before update on public.comercio_binance_pay_credentials
for each row execute function public.trg_touch_comercio_binance_pay_credentials_updated_at();

alter table public.comercio_binance_pay_credentials enable row level security;

revoke all on table public.comercio_binance_pay_credentials from anon, authenticated, public;
-- service_role keeps default full access for server-side APIs

comment on table public.comercio_binance_pay_credentials is
  'Private Binance Pay API key/secret per commerce. Readable only via service role (Next.js).';
