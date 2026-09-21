-- Allow merchants to select the official BCV quote currency explicitly.
do $$
begin
  if exists (
    select 1
    from pg_type
    where typname = 'exchange_rate_source'
  ) then
    if not exists (
      select 1
      from pg_enum
      where enumtypid = 'public.exchange_rate_source'::regtype
        and enumlabel = 'bcv_eur'
    ) then
      alter type public.exchange_rate_source add value 'bcv_eur';
    end if;

    if not exists (
      select 1
      from pg_enum
      where enumtypid = 'public.exchange_rate_source'::regtype
        and enumlabel = 'bcv_usd'
    ) then
      alter type public.exchange_rate_source add value 'bcv_usd';
    end if;
  end if;
end
$$;

comment on type public.exchange_rate_source is
  'Automatic exchange-rate source: BCV EUR, BCV USD, legacy BCV, market P2P, or Google.';

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
        when 'bcv_usd' then new.bcv_rate
        when 'bcv_eur' then nullif(new.payload #>> '{bcv_rates,EUR}', '')::numeric
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
