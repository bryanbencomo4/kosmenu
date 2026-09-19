-- BDV Payment Bridge receiver: store HMAC-authenticated Pago Móvil
-- notifications, pending checkout orders, and nonce replay protection.
-- Activation still goes through public.grant_subscription_period.

create table if not exists public.bdv_nonces (
  nonce text primary key,
  created_at timestamptz not null default now()
);

create index if not exists bdv_nonces_created_idx on public.bdv_nonces (created_at);

create table if not exists public.bdv_checkout_orders (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.comercios (id) on delete cascade,
  submission_id uuid references public.payment_submissions (id) on delete set null,
  plan_code text not null default 'menu_monthly' references public.plans (code),
  months integer not null default 1 check (months between 1 and 24),
  amount_usd numeric(12, 2) not null check (amount_usd >= 0),
  expected_amount_ves numeric(14, 2),
  expected_phone text,
  reference text,
  status text not null default 'PENDING_PAYMENT'
    check (status in ('PENDING_PAYMENT', 'PAID', 'EXPIRED', 'CANCELLED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  paid_at timestamptz
);

create unique index if not exists bdv_checkout_orders_one_pending_uidx
  on public.bdv_checkout_orders (business_id)
  where status = 'PENDING_PAYMENT';

create index if not exists bdv_checkout_orders_status_idx
  on public.bdv_checkout_orders (status, created_at desc);

create index if not exists bdv_checkout_orders_reference_idx
  on public.bdv_checkout_orders (upper(btrim(reference)))
  where reference is not null and status = 'PENDING_PAYMENT';

create table if not exists public.bdv_payments (
  id uuid primary key default gen_random_uuid(),
  payment_id text not null unique,
  amount numeric(14, 2),
  currency text not null default 'VES',
  reference text,
  operation_number text,
  sender_name text,
  sender_phone text,
  bank_date text,
  bank_time text,
  raw_text text,
  status text not null default 'RECEIVED'
    check (status in ('RECEIVED', 'CONFIRMED', 'REJECTED')),
  event text,
  source_package text,
  device_id text,
  match_reason text,
  matched_business_id uuid references public.comercios (id) on delete set null,
  matched_order_id uuid references public.bdv_checkout_orders (id) on delete set null,
  matched_submission_id uuid references public.payment_submissions (id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists bdv_payments_status_idx
  on public.bdv_payments (status, created_at desc);
create index if not exists bdv_payments_reference_idx
  on public.bdv_payments (upper(btrim(reference)))
  where reference is not null;
create index if not exists bdv_payments_created_idx
  on public.bdv_payments (created_at desc);

alter table public.bdv_nonces enable row level security;
alter table public.bdv_checkout_orders enable row level security;
alter table public.bdv_payments enable row level security;

revoke all on table public.bdv_nonces from public, anon, authenticated;
revoke all on table public.bdv_checkout_orders from public, anon, authenticated;
revoke all on table public.bdv_payments from public, anon, authenticated;

grant all on table public.bdv_nonces to service_role;
grant all on table public.bdv_checkout_orders to service_role;
grant all on table public.bdv_payments to service_role;

-- When a merchant opens a Pago Móvil submission, keep a pending BDV order
-- with the expected VES amount so the bridge can auto-confirm it.
create or replace function public.sync_bdv_checkout_order_from_submission()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rate numeric;
  v_expected numeric;
  v_phone text;
begin
  if tg_op = 'INSERT' then
    if new.method_code is distinct from 'pago_movil' or new.status is distinct from 'pending' then
      return new;
    end if;
  elsif tg_op = 'UPDATE' then
    if new.status is distinct from 'pending' then
      update public.bdv_checkout_orders
      set
        status = case new.status
          when 'approved' then 'PAID'
          when 'cancelled' then 'CANCELLED'
          when 'rejected' then 'CANCELLED'
          else status
        end,
        paid_at = case when new.status = 'approved' then coalesce(paid_at, now()) else paid_at end,
        updated_at = now()
      where submission_id = new.id
        and status = 'PENDING_PAYMENT';
      return new;
    end if;
    if new.method_code is distinct from 'pago_movil' then
      return new;
    end if;
  end if;

  select bcv_rate into v_rate
  from public.global_market_rates
  order by updated_at desc
  limit 1;

  if v_rate is not null then
    v_expected := round(new.amount_usd * v_rate, 2);
  end if;

  select coalesce(nullif(btrim(whatsapp), ''), nullif(btrim(telefonos), ''))
  into v_phone
  from public.comercios
  where id = new.business_id;

  insert into public.bdv_checkout_orders (
    business_id, submission_id, plan_code, months, amount_usd,
    expected_amount_ves, expected_phone, reference, status
  )
  values (
    new.business_id, new.id, new.plan_code, new.months, new.amount_usd,
    v_expected, v_phone, new.reference, 'PENDING_PAYMENT'
  )
  on conflict (business_id) where status = 'PENDING_PAYMENT'
  do update set
    submission_id = excluded.submission_id,
    plan_code = excluded.plan_code,
    months = excluded.months,
    amount_usd = excluded.amount_usd,
    expected_amount_ves = excluded.expected_amount_ves,
    expected_phone = coalesce(excluded.expected_phone, public.bdv_checkout_orders.expected_phone),
    reference = coalesce(nullif(btrim(excluded.reference), ''), public.bdv_checkout_orders.reference),
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists trg_sync_bdv_checkout_order_from_submission on public.payment_submissions;
create trigger trg_sync_bdv_checkout_order_from_submission
after insert or update of status, reference, declared_amount, method_code
on public.payment_submissions
for each row
execute function public.sync_bdv_checkout_order_from_submission();

comment on table public.bdv_payments is
  'Inbound Banco de Venezuela Pago Móvil notifications forwarded by BDV Payment Bridge.';
comment on table public.bdv_checkout_orders is
  'Pending ElMenúXFA subscription purchases waiting for a matching BDV transfer.';
