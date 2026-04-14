create table if not exists public.market_rate_fetch_logs (
  id bigserial primary key,
  run_id uuid not null,
  provider text not null,
  ok boolean not null default false,
  fetched_rate numeric(12,4),
  applied_rate numeric(12,4),
  response_status integer,
  response_time_ms integer,
  source_url text,
  payload jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  constraint market_rate_fetch_logs_provider_check
    check (provider in ('bcv', 'p2p_binance'))
);

create index if not exists market_rate_fetch_logs_created_at_idx
  on public.market_rate_fetch_logs (created_at desc);

create index if not exists market_rate_fetch_logs_run_id_idx
  on public.market_rate_fetch_logs (run_id);

create index if not exists market_rate_fetch_logs_provider_created_at_idx
  on public.market_rate_fetch_logs (provider, created_at desc);

comment on table public.market_rate_fetch_logs is
  'Bitacora tecnica de recoleccion automatica de tasas desde proveedores externos.';

comment on column public.market_rate_fetch_logs.run_id is
  'Identificador comun de una corrida de actualizacion.';

comment on column public.market_rate_fetch_logs.fetched_rate is
  'Tasa obtenida originalmente del proveedor antes de validaciones y fallbacks.';

comment on column public.market_rate_fetch_logs.applied_rate is
  'Tasa finalmente aplicada a global_market_rates para ese proveedor.';