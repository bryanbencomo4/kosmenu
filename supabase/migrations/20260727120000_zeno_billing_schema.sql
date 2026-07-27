-- Phase 2: Zeno Bank billing schema (additive, local — do not apply to production in this phase).
-- Legacy comercios remain published; billing does not auto-suspend existing menus.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- plans
-- ---------------------------------------------------------------------------
create table if not exists public.plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  price_amount numeric(12, 2) not null check (price_amount >= 0),
  price_currency text not null default 'USD',
  billing_interval text not null default 'month'
    check (billing_interval in ('month', 'year', 'one_time')),
  is_active boolean not null default true,
  features jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- subscriptions (business_id = comercios.id)
-- ---------------------------------------------------------------------------
create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  business_id uuid not null references public.comercios (id) on delete cascade,
  plan_id uuid not null references public.plans (id),
  provider text not null default 'zeno',
  status text not null default 'pending'
    check (status in ('pending', 'active', 'past_due', 'suspended', 'cancelled')),
  current_period_start timestamptz,
  current_period_end timestamptz,
  grace_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, plan_id)
);

create index if not exists subscriptions_user_id_idx on public.subscriptions (user_id);
create index if not exists subscriptions_business_id_idx on public.subscriptions (business_id);
create index if not exists subscriptions_status_idx on public.subscriptions (status);

-- ---------------------------------------------------------------------------
-- payments
-- ---------------------------------------------------------------------------
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.subscriptions (id) on delete cascade,
  business_id uuid not null references public.comercios (id) on delete cascade,
  provider text not null default 'zeno',
  provider_checkout_id text,
  order_id text not null,
  amount numeric(12, 2) not null check (amount >= 0),
  currency text not null default 'USD',
  paid_amount numeric(12, 2),
  status text not null default 'open'
    check (status in ('open', 'completed', 'expired', 'partially_paid', 'failed')),
  checkout_url text,
  expires_at timestamptz,
  paid_at timestamptz,
  period_start timestamptz,
  period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (order_id)
);

create unique index if not exists payments_provider_checkout_id_uidx
  on public.payments (provider, provider_checkout_id)
  where provider_checkout_id is not null;

create index if not exists payments_subscription_id_idx on public.payments (subscription_id);
create index if not exists payments_business_id_idx on public.payments (business_id);
create index if not exists payments_status_idx on public.payments (status);
create index if not exists payments_open_reuse_idx
  on public.payments (subscription_id, status, expires_at)
  where status = 'open';

-- ---------------------------------------------------------------------------
-- payment_events (webhook idempotency via svix-id)
-- ---------------------------------------------------------------------------
create table if not exists public.payment_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'zeno',
  provider_event_id text not null,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  processed boolean not null default false,
  processed_at timestamptz,
  processing_error text,
  created_at timestamptz not null default now(),
  unique (provider, provider_event_id)
);

create index if not exists payment_events_processed_idx on public.payment_events (processed, created_at desc);

-- ---------------------------------------------------------------------------
-- Seed plan
-- ---------------------------------------------------------------------------
insert into public.plans (code, name, description, price_amount, price_currency, billing_interval, is_active, features)
values (
  'menu_monthly',
  'Menú Digital',
  'Menú digital con QR, pedidos y panel de administración. USD 10 / mes.',
  10.00,
  'USD',
  'month',
  true,
  '["Menú online", "QR descargable", "Panel de administración", "Pedidos"]'::jsonb
)
on conflict (code) do update
set
  name = excluded.name,
  description = excluded.description,
  price_amount = excluded.price_amount,
  price_currency = excluded.price_currency,
  billing_interval = excluded.billing_interval,
  is_active = excluded.is_active,
  features = excluded.features,
  updated_at = now();

-- ---------------------------------------------------------------------------
-- Legacy / grandfathering marker (do not change en_linea of existing rows)
-- ---------------------------------------------------------------------------
alter table public.comercios
  add column if not exists billing_exempt boolean not null default false;

comment on column public.comercios.billing_exempt is
  'When true, commerce may stay published without a paid subscription (legacy grandfathering). Phase 2 sets true for existing rows and never flips en_linea for them.';

update public.comercios
set billing_exempt = true
where billing_exempt = false
  and created_at < now(); -- all current rows at migration time

-- ---------------------------------------------------------------------------
-- updated_at helper
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists plans_set_updated_at on public.plans;
create trigger plans_set_updated_at
  before update on public.plans
  for each row execute function public.set_updated_at();

drop trigger if exists subscriptions_set_updated_at on public.subscriptions;
create trigger subscriptions_set_updated_at
  before update on public.subscriptions
  for each row execute function public.set_updated_at();

drop trigger if exists payments_set_updated_at on public.payments;
create trigger payments_set_updated_at
  before update on public.payments
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Atomic webhook apply (service_role only)
-- ---------------------------------------------------------------------------
create or replace function public.apply_zeno_checkout_completed(
  p_order_id text,
  p_provider_checkout_id text,
  p_paid_amount numeric,
  p_currency text,
  p_paid_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment public.payments%rowtype;
  v_sub public.subscriptions%rowtype;
  v_period_start timestamptz;
  v_period_end timestamptz;
begin
  select * into v_payment
  from public.payments
  where order_id = p_order_id
    and (provider_checkout_id is null or provider_checkout_id = p_provider_checkout_id)
  for update;

  if not found then
    raise exception 'PAYMENT_NOT_FOUND' using errcode = 'P0002';
  end if;

  if upper(coalesce(p_currency, '')) <> upper(v_payment.currency) then
    raise exception 'CURRENCY_MISMATCH' using errcode = '22023';
  end if;

  if coalesce(p_paid_amount, 0) < v_payment.amount then
    raise exception 'AMOUNT_INSUFFICIENT' using errcode = '22023';
  end if;

  if v_payment.status = 'completed' then
    return jsonb_build_object('ok', true, 'idempotent', true, 'payment_id', v_payment.id);
  end if;

  v_period_start := coalesce(v_payment.period_start, p_paid_at);
  v_period_end := coalesce(v_payment.period_end, v_period_start + interval '1 month');

  update public.payments
  set
    status = 'completed',
    paid_amount = p_paid_amount,
    paid_at = p_paid_at,
    provider_checkout_id = coalesce(provider_checkout_id, p_provider_checkout_id),
    period_start = v_period_start,
    period_end = v_period_end,
    updated_at = now()
  where id = v_payment.id;

  update public.subscriptions
  set
    status = 'active',
    current_period_start = v_period_start,
    current_period_end = v_period_end,
    grace_period_end = null,
    cancel_at_period_end = false,
    updated_at = now()
  where id = v_payment.subscription_id
  returning * into v_sub;

  -- Publish menu for this business (new paid activations).
  -- Never clears billing_exempt; never suspends other businesses here.
  update public.comercios
  set en_linea = true
  where id = v_payment.business_id;

  return jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'payment_id', v_payment.id,
    'subscription_id', v_sub.id,
    'business_id', v_payment.business_id,
    'period_end', v_period_end
  );
end;
$$;

create or replace function public.apply_zeno_checkout_expired(
  p_order_id text,
  p_provider_checkout_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment public.payments%rowtype;
begin
  select * into v_payment
  from public.payments
  where order_id = p_order_id
    and (provider_checkout_id is null or provider_checkout_id = p_provider_checkout_id)
  for update;

  if not found then
    raise exception 'PAYMENT_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_payment.status = 'completed' then
    return jsonb_build_object('ok', true, 'skipped', true, 'reason', 'already_completed');
  end if;

  update public.payments
  set status = 'expired', updated_at = now()
  where id = v_payment.id
    and status = 'open';

  return jsonb_build_object('ok', true, 'payment_id', v_payment.id, 'status', 'expired');
end;
$$;

create or replace function public.apply_zeno_checkout_partially_paid(
  p_order_id text,
  p_provider_checkout_id text,
  p_paid_amount numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment public.payments%rowtype;
begin
  select * into v_payment
  from public.payments
  where order_id = p_order_id
    and (provider_checkout_id is null or provider_checkout_id = p_provider_checkout_id)
  for update;

  if not found then
    raise exception 'PAYMENT_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_payment.status = 'completed' then
    return jsonb_build_object('ok', true, 'skipped', true, 'reason', 'already_completed');
  end if;

  update public.payments
  set
    status = 'partially_paid',
    paid_amount = p_paid_amount,
    updated_at = now()
  where id = v_payment.id;

  -- Do NOT activate subscription / publish menu on partial payment.
  return jsonb_build_object('ok', true, 'payment_id', v_payment.id, 'status', 'partially_paid');
end;
$$;

revoke all on function public.apply_zeno_checkout_completed(text, text, numeric, text, timestamptz) from public, anon, authenticated;
revoke all on function public.apply_zeno_checkout_expired(text, text) from public, anon, authenticated;
revoke all on function public.apply_zeno_checkout_partially_paid(text, text, numeric) from public, anon, authenticated;
grant execute on function public.apply_zeno_checkout_completed(text, text, numeric, text, timestamptz) to service_role;
grant execute on function public.apply_zeno_checkout_expired(text, text) to service_role;
grant execute on function public.apply_zeno_checkout_partially_paid(text, text, numeric) to service_role;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.plans enable row level security;
alter table public.subscriptions enable row level security;
alter table public.payments enable row level security;
alter table public.payment_events enable row level security;

-- plans: authenticated can read active plans; no client writes
drop policy if exists plans_authenticated_select_active on public.plans;
create policy plans_authenticated_select_active
  on public.plans
  for select
  to authenticated
  using (is_active = true);

-- subscriptions: owner read only
drop policy if exists subscriptions_owner_select on public.subscriptions;
create policy subscriptions_owner_select
  on public.subscriptions
  for select
  to authenticated
  using (user_id = auth.uid());

-- payments: owner read via subscription ownership
drop policy if exists payments_owner_select on public.payments;
create policy payments_owner_select
  on public.payments
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.subscriptions s
      where s.id = payments.subscription_id
        and s.user_id = auth.uid()
    )
  );

-- payment_events: no client access (service_role bypasses RLS)
drop policy if exists payment_events_no_client on public.payment_events;
-- intentionally no policies for authenticated/anon → deny by default

-- Clients must not insert/update payments or subscriptions (no policies for write).
-- service_role bypasses RLS for edge functions.

grant select on public.plans to authenticated;
grant select on public.subscriptions to authenticated;
grant select on public.payments to authenticated;
revoke all on public.payment_events from anon, authenticated, public;
grant all on public.plans to service_role;
grant all on public.subscriptions to service_role;
grant all on public.payments to service_role;
grant all on public.payment_events to service_role;

comment on table public.plans is 'SaaS plans; prices are server-authoritative (never trust client amounts).';
comment on table public.subscriptions is 'One subscription row per business+plan; activated by Zeno webhook.';
comment on table public.payments is 'Checkout attempts for Zeno hosted pay.zenobank.io pages.';
comment on table public.payment_events is 'Webhook inbox; provider_event_id = svix-id for at-least-once idempotency.';
