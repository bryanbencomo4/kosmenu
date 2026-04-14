alter table public.market_rate_fetch_logs
  drop constraint if exists market_rate_fetch_logs_provider_check;

alter table public.market_rate_fetch_logs
  add constraint market_rate_fetch_logs_provider_check
  check (provider in ('bcv', 'p2p_binance', 'google'));

create table if not exists public.market_rate_provider_status (
  provider text primary key,
  last_check_at timestamptz,
  last_success_at timestamptz,
  last_run_id uuid,
  last_source_url text,
  last_error_message text,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint market_rate_provider_status_provider_check
    check (provider in ('bcv', 'p2p_binance', 'google'))
);

create index if not exists market_rate_provider_status_last_check_idx
  on public.market_rate_provider_status (last_check_at desc);

comment on table public.market_rate_provider_status is
  'Estado operativo por proveedor para auditoria de ultima verificacion y ultimo exito.';

comment on column public.market_rate_provider_status.last_check_at is
  'Ultima vez que el backend intento consultar el proveedor, incluso si no hubo cambios.';

comment on column public.market_rate_provider_status.last_success_at is
  'Ultima vez que el backend obtuvo datos frescos del proveedor sin depender de fallback.';

comment on column public.market_rate_provider_status.payload is
  'Detalle tecnico del ultimo intento de verificacion del proveedor.';