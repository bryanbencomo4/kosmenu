create or replace view public.view_provider_health as
with latest_global as (
  select
    updated_at,
    bcv_rate,
    p2p_binance_rate,
    payload
  from public.global_market_rates
  order by updated_at desc
  limit 1
)
select
  status.provider,
  status.last_check_at,
  status.last_success_at,
  status.last_run_id,
  status.last_source_url,
  status.last_error_message,
  status.payload as provider_payload,
  global.updated_at as latest_market_rate_updated_at,
  case status.provider
    when 'bcv' then jsonb_build_object('rate', global.bcv_rate)
    when 'p2p_binance' then jsonb_build_object('rate', global.p2p_binance_rate)
    when 'google' then global.payload -> 'google_provider'
    else null
  end as latest_provider_snapshot,
  global.payload as latest_global_payload
from public.market_rate_provider_status status
left join latest_global global on true;

comment on view public.view_provider_health is
  'Vista operativa para consultar en una sola lectura la salud del proveedor y la ultima referencia global disponible.';