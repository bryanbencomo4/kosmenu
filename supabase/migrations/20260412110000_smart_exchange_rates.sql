do $$
begin
  if not exists (
    select 1
    from pg_type
    where typname = 'exchange_rate_mode'
  ) then
    create type public.exchange_rate_mode as enum ('manual', 'auto');
  end if;

  if not exists (
    select 1
    from pg_type
    where typname = 'exchange_rate_source'
  ) then
    create type public.exchange_rate_source as enum ('bcv', 'p2p_binance');
  end if;
end
$$;

alter table public.comercios
  add column if not exists exchange_rate_mode public.exchange_rate_mode not null default 'auto',
  add column if not exists exchange_rate_source public.exchange_rate_source not null default 'bcv',
  add column if not exists exchange_rate_value numeric(12,4),
  add column if not exists last_rate_update timestamptz;

update public.comercios
set
  exchange_rate_value = coalesce(exchange_rate_value, tasa_cambio_pesos),
  last_rate_update = coalesce(last_rate_update, now())
where coalesce(exchange_rate_value, 0) <= 0
  and coalesce(tasa_cambio_pesos, 0) > 0;

comment on column public.comercios.exchange_rate_mode is
  'Modo de tasa del comercio: manual o auto.';

comment on column public.comercios.exchange_rate_source is
  'Fuente de tasa automatica: BCV o mercado P2P.';

comment on column public.comercios.exchange_rate_value is
  'Tasa actual efectiva (manual o sincronizada automaticamente).';

comment on column public.comercios.last_rate_update is
  'Fecha/hora de la ultima actualizacion de tasa aplicada al comercio.';

create table if not exists public.global_market_rates (
  id bigserial primary key,
  bcv_rate numeric(12,4) not null,
  p2p_binance_rate numeric(12,4) not null,
  provider text,
  payload jsonb,
  updated_at timestamptz not null default now()
);

comment on table public.global_market_rates is
  'Tabla maestra con tasas de mercado centralizadas.';

create index if not exists global_market_rates_updated_at_idx
  on public.global_market_rates (updated_at desc);

create table if not exists public.comercio_exchange_rate_history (
  id bigserial primary key,
  comercio_id uuid not null references public.comercios(id) on delete cascade,
  exchange_rate_mode public.exchange_rate_mode not null,
  exchange_rate_source public.exchange_rate_source not null,
  exchange_rate_value numeric(12,4) not null,
  reason text not null,
  created_at timestamptz not null default now()
);

create index if not exists comercio_exchange_rate_history_comercio_created_idx
  on public.comercio_exchange_rate_history (comercio_id, created_at desc);

comment on table public.comercio_exchange_rate_history is
  'Bitacora de cambios de tasa por comercio para auditoria y UX.';

create or replace function public.sync_comercio_rates_from_global()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  with updated_rows as (
    update public.comercios c
    set
      exchange_rate_value = case c.exchange_rate_source
        when 'bcv' then new.bcv_rate
        when 'p2p_binance' then new.p2p_binance_rate
        else c.exchange_rate_value
      end,
      tasa_cambio_pesos = case
        when c.moneda = 'COP' then case c.exchange_rate_source
          when 'bcv' then new.bcv_rate
          when 'p2p_binance' then new.p2p_binance_rate
          else c.exchange_rate_value
        end
        else c.tasa_cambio_pesos
      end,
      last_rate_update = now()
    where c.exchange_rate_mode = 'auto'
      and (
        (c.exchange_rate_source = 'bcv' and c.exchange_rate_value is distinct from new.bcv_rate)
        or
        (c.exchange_rate_source = 'p2p_binance' and c.exchange_rate_value is distinct from new.p2p_binance_rate)
      )
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
after insert or update of bcv_rate, p2p_binance_rate on public.global_market_rates
for each row
execute function public.sync_comercio_rates_from_global();

create or replace function public.log_manual_comercio_rate_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (new.exchange_rate_value is distinct from old.exchange_rate_value)
     or (new.exchange_rate_mode is distinct from old.exchange_rate_mode)
     or (new.exchange_rate_source is distinct from old.exchange_rate_source) then
    insert into public.comercio_exchange_rate_history (
      comercio_id,
      exchange_rate_mode,
      exchange_rate_source,
      exchange_rate_value,
      reason
    ) values (
      new.id,
      new.exchange_rate_mode,
      new.exchange_rate_source,
      coalesce(new.exchange_rate_value, 0),
      'manual_update'
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_log_manual_comercio_rate_change on public.comercios;

create trigger trg_log_manual_comercio_rate_change
after update of exchange_rate_mode, exchange_rate_source, exchange_rate_value on public.comercios
for each row
execute function public.log_manual_comercio_rate_change();
