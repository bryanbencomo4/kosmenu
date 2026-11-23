-- Remove Binance Pay credentials feature (no longer used).

drop trigger if exists trg_touch_comercio_binance_pay_credentials_updated_at
  on public.comercio_binance_pay_credentials;

drop function if exists public.trg_touch_comercio_binance_pay_credentials_updated_at();

drop table if exists public.comercio_binance_pay_credentials;
