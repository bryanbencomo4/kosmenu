do $$
begin
  if exists (
    select 1
    from pg_type
    where typname = 'exchange_rate_source'
  ) and not exists (
    select 1
    from pg_enum
    where enumtypid = 'public.exchange_rate_source'::regtype
      and enumlabel = 'google'
  ) then
    alter type public.exchange_rate_source add value 'google';
  end if;
end
$$;

alter table public.comercios
  add column if not exists exchange_rate_quote_currency text;

update public.comercios
set exchange_rate_quote_currency = 'VES'
where exchange_rate_quote_currency is null
  and exchange_rate_source in ('bcv', 'p2p_binance');

comment on column public.comercios.exchange_rate_quote_currency is
  'Moneda cotizada del par configurado para la tasa automatica o manual del comercio.';

create or replace function public.google_pair_rate(
  payload jsonb,
  base_currency text,
  quote_currency text
)
returns numeric
language plpgsql
immutable
as $$
declare
  usd_cop numeric;
  usd_eur numeric;
  ves_usd numeric;
begin
  if payload is null then
    return null;
  end if;

  usd_cop := nullif(payload #>> '{google_rates,USD/COP}', '')::numeric;
  usd_eur := nullif(payload #>> '{google_rates,USD/EUR}', '')::numeric;
  ves_usd := nullif(payload #>> '{google_rates,VES/USD}', '')::numeric;

  if base_currency is null or quote_currency is null or base_currency = quote_currency then
    return null;
  end if;

  case
    when base_currency = 'USD' and quote_currency = 'COP' then
      return usd_cop;
    when base_currency = 'USD' and quote_currency = 'EUR' then
      return usd_eur;
    when base_currency = 'VES' and quote_currency = 'USD' then
      return ves_usd;
    when base_currency = 'COP' and quote_currency = 'USD' and usd_cop > 0 then
      return 1 / usd_cop;
    when base_currency = 'EUR' and quote_currency = 'USD' and usd_eur > 0 then
      return 1 / usd_eur;
    when base_currency = 'VES' and quote_currency = 'COP' and ves_usd > 0 and usd_cop > 0 then
      return ves_usd * usd_cop;
    when base_currency = 'VES' and quote_currency = 'EUR' and ves_usd > 0 and usd_eur > 0 then
      return ves_usd * usd_eur;
    when base_currency = 'COP' and quote_currency = 'VES' and ves_usd > 0 and usd_cop > 0 then
      return 1 / (ves_usd * usd_cop);
    when base_currency = 'EUR' and quote_currency = 'VES' and ves_usd > 0 and usd_eur > 0 then
      return 1 / (ves_usd * usd_eur);
    when base_currency = 'COP' and quote_currency = 'EUR' and usd_cop > 0 and usd_eur > 0 then
      return usd_eur / usd_cop;
    when base_currency = 'EUR' and quote_currency = 'COP' and usd_cop > 0 and usd_eur > 0 then
      return usd_cop / usd_eur;
    else
      return null;
  end case;
end;
$$;

create or replace function public.sync_comercio_rates_from_global()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  with candidate_rates as (
    select
      c.id,
      c.moneda,
      c.exchange_rate_mode,
      c.exchange_rate_source,
      case c.exchange_rate_source
        when 'bcv' then new.bcv_rate
        when 'p2p_binance' then new.p2p_binance_rate
        when 'google' then public.google_pair_rate(
          new.payload,
          c.moneda,
          c.exchange_rate_quote_currency
        )
        else c.exchange_rate_value
      end as next_rate
    from public.comercios c
    where c.exchange_rate_mode = 'auto'
  ),
  updated_rows as (
    update public.comercios c
    set
      exchange_rate_value = candidates.next_rate,
      tasa_cambio_pesos = case
        when c.moneda = 'COP' then candidates.next_rate
        else c.tasa_cambio_pesos
      end,
      last_rate_update = now()
    from candidate_rates candidates
    where c.id = candidates.id
      and candidates.next_rate is not null
      and candidates.next_rate > 0
      and c.exchange_rate_value is distinct from candidates.next_rate
    returning
      c.id,
      c.exchange_rate_mode,
      c.exchange_rate_source,
      c.exchange_rate_value
  )
  insert into public.comercio_exchange_rate_history (
    comercio_id,
    exchange_rate_mode,
    exchange_rate_source,
    exchange_rate_value,
    reason
  )
  select
    id,
    exchange_rate_mode,
    exchange_rate_source,
    exchange_rate_value,
    'global_sync'
  from updated_rows;

  return new;
end;
$$;

drop trigger if exists trg_sync_comercio_rates_from_global on public.global_market_rates;

create trigger trg_sync_comercio_rates_from_global
after insert or update of bcv_rate, p2p_binance_rate, payload on public.global_market_rates
for each row
execute function public.sync_comercio_rates_from_global();
