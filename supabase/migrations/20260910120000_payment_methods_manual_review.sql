-- Payment methods with automatic and manual verification.
--
-- Adds the catalog merchants pick from, the manual-payment review queue, gift
-- cards and sales advisors. Everything is admin-managed from admin.elmenuxfa.com.
--
-- Design notes:
--   * Amounts are ALWAYS computed server-side from `plans.price_amount`; the
--     client never sends a price.
--   * Granting a period goes through one function
--     (`grant_subscription_period`) so crypto, gift cards and approved manual
--     payments cannot drift apart.
--   * Gift card codes are stored as SHA-256 hashes only, like the delivery
--     invitation tokens.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Admin capability helpers (roles come from public.admin_users)
-- ---------------------------------------------------------------------------
create or replace function public.admin_can_manage_billing()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_admin_role() in ('super_admin', 'finance');
$$;

create or replace function public.admin_can_review_payments()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_admin_role() in ('super_admin', 'finance', 'support');
$$;

create or replace function public.admin_can_manage_advisors()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_admin_role() in ('super_admin', 'sales');
$$;

revoke all on function public.admin_can_manage_billing() from public;
revoke all on function public.admin_can_review_payments() from public;
revoke all on function public.admin_can_manage_advisors() from public;
grant execute on function public.admin_can_manage_billing() to authenticated, service_role;
grant execute on function public.admin_can_review_payments() to authenticated, service_role;
grant execute on function public.admin_can_manage_advisors() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- sales_advisors — authorize cash payments
-- ---------------------------------------------------------------------------
create table if not exists public.sales_advisors (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check (length(btrim(full_name)) > 2),
  code text not null unique check (code = upper(btrim(code)) and length(btrim(code)) >= 4),
  phone text,
  auth_user_id uuid references auth.users (id) on delete set null,
  is_active boolean not null default true,
  note text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sales_advisors_active_idx
  on public.sales_advisors (is_active, code);

-- ---------------------------------------------------------------------------
-- payment_methods — the admin-managed catalog the merchant chooses from
-- ---------------------------------------------------------------------------
create table if not exists public.payment_methods (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  -- Shown under the name in the picker.
  tagline text,
  verification text not null
    check (verification in ('automatic', 'manual')),
  -- Drives which UI flow the app opens for this method.
  kind text not null
    check (kind in ('crypto_checkout', 'gift_card', 'bank_transfer', 'wallet', 'cash')),
  is_active boolean not null default true,
  sort_order integer not null default 100,
  -- ISO-3166 alpha-2, or null when the method is not country specific.
  country_code text check (country_code is null or country_code = upper(country_code)),
  -- Currency the merchant actually transfers in (display only).
  local_currency text,
  -- Uploaded by an admin; the app falls back to a built-in brand mark.
  logo_url text,
  brand_color text check (brand_color is null or brand_color ~ '^#[0-9A-Fa-f]{6}$'),
  instructions text,
  -- [{"label": "Banco", "value": "Bancolombia", "copyable": true}, ...]
  account_fields jsonb not null default '[]'::jsonb
    check (jsonb_typeof(account_fields) = 'array'),
  requires_reference boolean not null default true,
  requires_receipt boolean not null default true,
  requires_advisor_code boolean not null default false,
  -- Used for the "we review within ~X" copy shown to the merchant.
  review_sla_minutes integer not null default 240 check (review_sla_minutes > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists payment_methods_active_order_idx
  on public.payment_methods (is_active, verification, sort_order);

-- Automatic methods are settled by the provider, so a receipt makes no sense.
alter table public.payment_methods
  drop constraint if exists payment_methods_automatic_needs_no_receipt;
alter table public.payment_methods
  add constraint payment_methods_automatic_needs_no_receipt check (
    verification = 'manual'
    or (requires_receipt = false and requires_reference = false and requires_advisor_code = false)
  );

-- ---------------------------------------------------------------------------
-- payment_submissions — manual payments waiting for admin review
-- ---------------------------------------------------------------------------
create table if not exists public.payment_submissions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.comercios (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  method_code text not null references public.payment_methods (code),
  plan_code text not null default 'menu_monthly' references public.plans (code),
  months integer not null default 1 check (months between 1 and 24),
  -- Server-computed from the plan price; never sent by the client.
  amount_usd numeric(12, 2) not null check (amount_usd >= 0),
  -- What the merchant says they transferred, in their own currency.
  declared_amount numeric(14, 2) check (declared_amount is null or declared_amount >= 0),
  declared_currency text,
  reference text,
  payer_name text,
  receipt_path text,
  advisor_id uuid references public.sales_advisors (id) on delete set null,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  review_note text,
  payment_id uuid references public.payments (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One open request per business: without this a merchant could queue dozens.
create unique index if not exists payment_submissions_one_pending_uidx
  on public.payment_submissions (business_id)
  where status = 'pending';

-- The same transfer reference must not be usable twice.
create unique index if not exists payment_submissions_reference_uidx
  on public.payment_submissions (method_code, upper(btrim(reference)))
  where reference is not null and status in ('pending', 'approved');

create index if not exists payment_submissions_status_idx
  on public.payment_submissions (status, created_at desc);
create index if not exists payment_submissions_business_idx
  on public.payment_submissions (business_id, created_at desc);

-- ---------------------------------------------------------------------------
-- gift_cards — automatic verification, months decided when issued
-- ---------------------------------------------------------------------------
create table if not exists public.gift_cards (
  id uuid primary key default gen_random_uuid(),
  -- SHA-256 of the normalized code. The plaintext is returned once, at issue
  -- time, and never stored: a database dump must not yield usable codes.
  code_hash text not null unique,
  -- Enough to identify a card in the admin list without revealing it.
  code_hint text not null,
  months integer not null check (months between 1 and 24),
  plan_code text not null default 'menu_monthly' references public.plans (code),
  status text not null default 'active'
    check (status in ('active', 'redeemed', 'void')),
  batch_label text,
  note text,
  expires_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  redeemed_by_business uuid references public.comercios (id) on delete set null,
  redeemed_by_user uuid references auth.users (id) on delete set null,
  redeemed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists gift_cards_status_idx
  on public.gift_cards (status, created_at desc);
create index if not exists gift_cards_batch_idx
  on public.gift_cards (batch_label);

-- Throttles code guessing. Successful redemptions are cleared.
create table if not exists public.gift_card_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  succeeded boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists gift_card_attempts_user_idx
  on public.gift_card_attempts (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- updated_at triggers (public.set_updated_at already exists)
-- ---------------------------------------------------------------------------
drop trigger if exists sales_advisors_set_updated_at on public.sales_advisors;
create trigger sales_advisors_set_updated_at
  before update on public.sales_advisors
  for each row execute function public.set_updated_at();

drop trigger if exists payment_methods_set_updated_at on public.payment_methods;
create trigger payment_methods_set_updated_at
  before update on public.payment_methods
  for each row execute function public.set_updated_at();

drop trigger if exists payment_submissions_set_updated_at on public.payment_submissions;
create trigger payment_submissions_set_updated_at
  before update on public.payment_submissions
  for each row execute function public.set_updated_at();

drop trigger if exists gift_cards_set_updated_at on public.gift_cards;
create trigger gift_cards_set_updated_at
  before update on public.gift_cards
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Seed the catalog
-- ---------------------------------------------------------------------------
insert into public.payment_methods (
  code, name, tagline, verification, kind, sort_order, country_code,
  local_currency, brand_color, instructions, requires_reference,
  requires_receipt, requires_advisor_code, review_sla_minutes
)
values
  (
    'crypto_usdt', 'Binance Pay', 'Pago con cripto · se activa al confirmar la red',
    'automatic', 'crypto_checkout', 10, null, 'USDT', '#F3BA2F',
    'Te llevamos al checkout seguro de Binance Pay. La activacion es automatica en cuanto la red confirma la transaccion.',
    false, false, false, 5
  ),
  (
    'gift_card', 'Tarjeta de regalo', 'Canjea tu codigo y se activa al instante',
    'automatic', 'gift_card', 20, null, null, '#7C3AED',
    'Escribe el codigo de tu tarjeta de regalo. Se activa al instante y no necesitas enviar comprobante.',
    false, false, false, 5
  ),
  (
    'pago_movil', 'Pago movil', 'Transferencia interbancaria en Venezuela',
    'manual', 'bank_transfer', 30, 'VE', 'VES', '#1E4E9C',
    'Haz el pago movil con los datos de abajo y sube la captura del comprobante junto al numero de referencia.',
    true, true, false, 240
  ),
  (
    'bancolombia', 'Bancolombia', 'Transferencia o consignacion',
    'manual', 'bank_transfer', 40, 'CO', 'COP', '#FDDA24',
    'Transfiere a la cuenta Bancolombia de abajo y sube el comprobante con el numero de aprobacion.',
    true, true, false, 240
  ),
  (
    'nequi', 'Nequi', 'Envio desde la app Nequi',
    'manual', 'wallet', 50, 'CO', 'COP', '#200020',
    'Envia el dinero al numero Nequi de abajo y sube el comprobante que genera la app.',
    true, true, false, 240
  ),
  (
    'bre_b', 'Bre-B', 'Pagos inmediatos con llave',
    'manual', 'bank_transfer', 60, 'CO', 'COP', '#0033A0',
    'Paga con Bre-B usando la llave de abajo y sube el comprobante con el numero de la operacion.',
    true, true, false, 240
  ),
  (
    'zinli', 'Zinli', 'Transferencia desde tu cuenta Zinli',
    'manual', 'wallet', 70, null, 'USD', '#00C08B',
    'Envia el saldo a la cuenta Zinli de abajo y sube el comprobante de la transferencia.',
    true, true, false, 240
  ),
  (
    'efectivo', 'Efectivo', 'Solo con un asesor de venta autorizado',
    'manual', 'cash', 80, null, null, '#15803D',
    'El pago en efectivo solo es valido si lo entregaste a un asesor de venta autorizado. Escribe el codigo que te dio el asesor para que podamos verificarlo.',
    false, false, true, 480
  )
on conflict (code) do update
set
  name = excluded.name,
  tagline = excluded.tagline,
  verification = excluded.verification,
  kind = excluded.kind,
  country_code = excluded.country_code,
  local_currency = excluded.local_currency,
  brand_color = excluded.brand_color,
  requires_reference = excluded.requires_reference,
  requires_receipt = excluded.requires_receipt,
  requires_advisor_code = excluded.requires_advisor_code,
  updated_at = now();

-- ---------------------------------------------------------------------------
-- Private bucket for subscription receipts
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'comprobantes-suscripcion',
  'comprobantes-suscripcion',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Objects live at `<business_id>/<file>`; a merchant only reaches their own
-- folder. No update/delete on purpose: an approved receipt must stay auditable.
drop policy if exists comprobantes_suscripcion_owner_insert on storage.objects;
create policy comprobantes_suscripcion_owner_insert
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'comprobantes-suscripcion'
    and exists (
      select 1
      from public.comercios c
      where c.owner_id = auth.uid()
        and c.id::text = (storage.foldername(name))[1]
    )
  );

drop policy if exists comprobantes_suscripcion_owner_select on storage.objects;
create policy comprobantes_suscripcion_owner_select
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'comprobantes-suscripcion'
    and exists (
      select 1
      from public.comercios c
      where c.owner_id = auth.uid()
        and c.id::text = (storage.foldername(name))[1]
    )
  );

drop policy if exists comprobantes_suscripcion_admin_select on storage.objects;
create policy comprobantes_suscripcion_admin_select
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'comprobantes-suscripcion'
    and public.admin_can_review_payments()
  );

-- ---------------------------------------------------------------------------
-- Gift card code helpers
-- ---------------------------------------------------------------------------
create or replace function public.gift_card_code_hash(p_code text)
returns text
language sql
immutable
as $$
  select encode(
    extensions.digest(
      upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g')),
      'sha256'
    ),
    'hex'
  );
$$;

comment on function public.gift_card_code_hash(text) is
  'Normalizes a gift card code (strips separators, uppercases) and returns its SHA-256 hex hash, so lookups work whether the merchant types the dashes or not.';

create or replace function public.generate_gift_card_code()
returns text
language plpgsql
volatile
set search_path = public, extensions
as $$
declare
  -- No 0/O/1/I/L: these codes get read out loud and retyped.
  v_alphabet text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_bytes bytea := extensions.gen_random_bytes(12);
  v_body text := '';
  v_i integer;
begin
  for v_i in 0..11 loop
    v_body := v_body || substr(
      v_alphabet,
      1 + (get_byte(v_bytes, v_i) % length(v_alphabet)),
      1
    );
  end loop;

  return 'EMX-' || substr(v_body, 1, 4)
      || '-' || substr(v_body, 5, 4)
      || '-' || substr(v_body, 9, 4);
end;
$$;

-- ---------------------------------------------------------------------------
-- The single place that grants paid time
-- ---------------------------------------------------------------------------
create or replace function public.grant_subscription_period(
  p_business_id uuid,
  p_plan_code text,
  p_months integer,
  p_provider text,
  p_order_id text,
  p_amount numeric,
  p_currency text default 'USD',
  p_paid_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan public.plans%rowtype;
  v_owner uuid;
  v_sub public.subscriptions%rowtype;
  v_payment public.payments%rowtype;
  v_period_start timestamptz;
  v_period_end timestamptz;
begin
  if p_months is null or p_months < 1 or p_months > 24 then
    raise exception 'INVALID_MONTHS' using errcode = '22023';
  end if;

  select * into v_plan
  from public.plans
  where code = p_plan_code and is_active = true;
  if not found then
    raise exception 'PLAN_NOT_FOUND' using errcode = 'P0002';
  end if;

  select owner_id into v_owner
  from public.comercios
  where id = p_business_id;
  if v_owner is null then
    raise exception 'BUSINESS_NOT_FOUND' using errcode = 'P0002';
  end if;

  -- payments.order_id is unique, so a replayed approval or a double-clicked
  -- redemption returns the original grant instead of adding a second month.
  select * into v_payment from public.payments where order_id = p_order_id;
  if found then
    return jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'payment_id', v_payment.id,
      'subscription_id', v_payment.subscription_id,
      'period_start', v_payment.period_start,
      'period_end', v_payment.period_end
    );
  end if;

  insert into public.subscriptions (user_id, business_id, plan_id, provider, status)
  values (v_owner, p_business_id, v_plan.id, p_provider, 'pending')
  on conflict (business_id, plan_id) do update set updated_at = now()
  returning * into v_sub;

  select * into v_sub
  from public.subscriptions
  where id = v_sub.id
  for update;

  -- Paying before the period ends must extend it, never restart it: otherwise
  -- an early renewal silently donates the remaining days back to us.
  if v_sub.status = 'active'
     and v_sub.current_period_end is not null
     and v_sub.current_period_end > p_paid_at then
    v_period_start := v_sub.current_period_end;
  else
    v_period_start := p_paid_at;
  end if;

  v_period_end := v_period_start + make_interval(months => p_months);

  insert into public.payments (
    subscription_id, business_id, provider, order_id, amount, currency,
    paid_amount, status, paid_at, period_start, period_end
  )
  values (
    v_sub.id, p_business_id, p_provider, p_order_id, p_amount,
    upper(coalesce(p_currency, 'USD')), p_amount, 'completed', p_paid_at,
    v_period_start, v_period_end
  )
  returning * into v_payment;

  update public.subscriptions
  set
    status = 'active',
    current_period_start = case
      when v_sub.status = 'active'
           and v_sub.current_period_end is not null
           and v_sub.current_period_end > p_paid_at
        then v_sub.current_period_start
      else v_period_start
    end,
    current_period_end = v_period_end,
    grace_period_end = null,
    cancel_at_period_end = false,
    updated_at = now()
  where id = v_sub.id;

  update public.comercios
  set en_linea = true
  where id = p_business_id;

  return jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'payment_id', v_payment.id,
    'subscription_id', v_sub.id,
    'period_start', v_period_start,
    'period_end', v_period_end
  );
end;
$$;

comment on function public.grant_subscription_period(uuid, text, integer, text, text, numeric, text, timestamptz) is
  'Single entry point that activates a subscription and publishes the menu. Idempotent on p_order_id. Extends an active period instead of restarting it.';

revoke all on function public.grant_subscription_period(uuid, text, integer, text, text, numeric, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.grant_subscription_period(uuid, text, integer, text, text, numeric, text, timestamptz)
  to service_role;

-- ---------------------------------------------------------------------------
-- Merchant: redeem a gift card (automatic verification)
-- ---------------------------------------------------------------------------
create or replace function public.redeem_gift_card(
  p_code text,
  p_business_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_owner uuid;
  v_card public.gift_cards%rowtype;
  v_failures integer;
  v_result jsonb;
begin
  if v_actor is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;

  select owner_id into v_owner
  from public.comercios
  where id = p_business_id;
  if v_owner is distinct from v_actor then
    raise exception 'NOT_BUSINESS_OWNER' using errcode = '42501';
  end if;

  -- The code space is large, but a throttle keeps anyone from grinding it.
  select count(*) into v_failures
  from public.gift_card_attempts
  where user_id = v_actor
    and succeeded = false
    and created_at > now() - interval '10 minutes';
  if v_failures >= 10 then
    raise exception 'TOO_MANY_ATTEMPTS' using errcode = '54000';
  end if;

  select * into v_card
  from public.gift_cards
  where code_hash = public.gift_card_code_hash(p_code)
  for update;

  if not found then
    insert into public.gift_card_attempts (user_id, succeeded) values (v_actor, false);
    raise exception 'GIFT_CARD_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_card.status = 'redeemed' then
    insert into public.gift_card_attempts (user_id, succeeded) values (v_actor, false);
    raise exception 'GIFT_CARD_ALREADY_REDEEMED' using errcode = '22023';
  end if;

  if v_card.status = 'void' then
    insert into public.gift_card_attempts (user_id, succeeded) values (v_actor, false);
    raise exception 'GIFT_CARD_VOID' using errcode = '22023';
  end if;

  if v_card.expires_at is not null and v_card.expires_at <= now() then
    insert into public.gift_card_attempts (user_id, succeeded) values (v_actor, false);
    raise exception 'GIFT_CARD_EXPIRED' using errcode = '22023';
  end if;

  -- A gift card moves no money, so the payment row is recorded at zero.
  v_result := public.grant_subscription_period(
    p_business_id,
    v_card.plan_code,
    v_card.months,
    'gift_card',
    'gift:' || v_card.id::text,
    0,
    'USD',
    now()
  );

  update public.gift_cards
  set
    status = 'redeemed',
    redeemed_by_business = p_business_id,
    redeemed_by_user = v_actor,
    redeemed_at = now(),
    updated_at = now()
  where id = v_card.id;

  insert into public.gift_card_attempts (user_id, succeeded) values (v_actor, true);

  return v_result || jsonb_build_object('months', v_card.months);
end;
$$;

revoke all on function public.redeem_gift_card(text, uuid) from public, anon;
grant execute on function public.redeem_gift_card(text, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Merchant: declare a manual payment for review
-- ---------------------------------------------------------------------------
create or replace function public.submit_manual_payment(
  p_business_id uuid,
  p_method_code text,
  p_months integer default 1,
  p_reference text default null,
  p_payer_name text default null,
  p_receipt_path text default null,
  p_advisor_code text default null,
  p_declared_amount numeric default null,
  p_declared_currency text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_owner uuid;
  v_method public.payment_methods%rowtype;
  v_plan public.plans%rowtype;
  v_advisor public.sales_advisors%rowtype;
  v_advisor_id uuid := null;
  v_reference text := nullif(btrim(coalesce(p_reference, '')), '');
  v_receipt text := nullif(btrim(coalesce(p_receipt_path, '')), '');
  v_submission public.payment_submissions%rowtype;
begin
  if v_actor is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;

  select owner_id into v_owner
  from public.comercios
  where id = p_business_id;
  if v_owner is distinct from v_actor then
    raise exception 'NOT_BUSINESS_OWNER' using errcode = '42501';
  end if;

  if p_months is null or p_months < 1 or p_months > 24 then
    raise exception 'INVALID_MONTHS' using errcode = '22023';
  end if;

  select * into v_method
  from public.payment_methods
  where code = p_method_code and is_active = true;
  if not found then
    raise exception 'METHOD_NOT_AVAILABLE' using errcode = 'P0002';
  end if;
  if v_method.verification <> 'manual' then
    raise exception 'METHOD_NOT_MANUAL' using errcode = '22023';
  end if;

  if v_method.requires_reference and v_reference is null then
    raise exception 'REFERENCE_REQUIRED' using errcode = '22023';
  end if;

  if v_method.requires_receipt and v_receipt is null then
    raise exception 'RECEIPT_REQUIRED' using errcode = '22023';
  end if;

  -- A receipt must be a real object inside this merchant's own folder,
  -- otherwise the path could point at somebody else's upload.
  if v_receipt is not null then
    if not exists (
      select 1
      from storage.objects o
      where o.bucket_id = 'comprobantes-suscripcion'
        and o.name = v_receipt
        and (storage.foldername(o.name))[1] = p_business_id::text
    ) then
      raise exception 'RECEIPT_NOT_FOUND' using errcode = 'P0002';
    end if;
  end if;

  if v_method.requires_advisor_code then
    select * into v_advisor
    from public.sales_advisors
    where code = upper(btrim(coalesce(p_advisor_code, '')))
      and is_active = true;
    if not found then
      raise exception 'ADVISOR_CODE_INVALID' using errcode = '22023';
    end if;
    v_advisor_id := v_advisor.id;
  end if;

  select * into v_plan
  from public.plans
  where code = 'menu_monthly' and is_active = true;
  if not found then
    raise exception 'PLAN_NOT_FOUND' using errcode = 'P0002';
  end if;

  if exists (
    select 1 from public.payment_submissions
    where business_id = p_business_id and status = 'pending'
  ) then
    raise exception 'SUBMISSION_ALREADY_PENDING' using errcode = '22023';
  end if;

  begin
    insert into public.payment_submissions (
      business_id, user_id, method_code, plan_code, months, amount_usd,
      declared_amount, declared_currency, reference, payer_name, receipt_path,
      advisor_id, status
    )
    values (
      p_business_id, v_actor, v_method.code, v_plan.code, p_months,
      -- Price is authoritative here; the client never gets to name it.
      round(v_plan.price_amount * p_months, 2),
      p_declared_amount,
      nullif(btrim(upper(coalesce(p_declared_currency, ''))), ''),
      v_reference,
      nullif(btrim(coalesce(p_payer_name, '')), ''),
      v_receipt,
      v_advisor_id,
      'pending'
    )
    returning * into v_submission;
  exception
    when unique_violation then
      raise exception 'REFERENCE_ALREADY_USED' using errcode = '22023';
  end;

  return jsonb_build_object(
    'ok', true,
    'submission_id', v_submission.id,
    'status', v_submission.status,
    'amount_usd', v_submission.amount_usd,
    'review_sla_minutes', v_method.review_sla_minutes
  );
end;
$$;

revoke all on function public.submit_manual_payment(uuid, text, integer, text, text, text, text, numeric, text)
  from public, anon;
grant execute on function public.submit_manual_payment(uuid, text, integer, text, text, text, text, numeric, text)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Merchant: withdraw a request that has not been reviewed yet
-- ---------------------------------------------------------------------------
create or replace function public.cancel_manual_payment(p_submission_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_submission public.payment_submissions%rowtype;
begin
  if v_actor is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;

  select * into v_submission
  from public.payment_submissions
  where id = p_submission_id
  for update;

  if not found or v_submission.user_id <> v_actor then
    raise exception 'SUBMISSION_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_submission.status <> 'pending' then
    return jsonb_build_object('ok', true, 'idempotent', true, 'status', v_submission.status);
  end if;

  update public.payment_submissions
  set status = 'cancelled', updated_at = now()
  where id = p_submission_id;

  return jsonb_build_object('ok', true, 'status', 'cancelled');
end;
$$;

revoke all on function public.cancel_manual_payment(uuid) from public, anon;
grant execute on function public.cancel_manual_payment(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Admin: review the queue
-- ---------------------------------------------------------------------------
create or replace function public.approve_manual_payment(
  p_submission_id uuid,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_submission public.payment_submissions%rowtype;
  v_result jsonb;
begin
  -- auth.uid() is null for service_role callers, which only reach this
  -- function through server code that already gates on admin identity.
  if v_actor is not null and not public.admin_can_review_payments() then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;

  select * into v_submission
  from public.payment_submissions
  where id = p_submission_id
  for update;
  if not found then
    raise exception 'SUBMISSION_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_submission.status <> 'pending' then
    return jsonb_build_object(
      'ok', true, 'idempotent', true, 'status', v_submission.status
    );
  end if;

  v_result := public.grant_subscription_period(
    v_submission.business_id,
    v_submission.plan_code,
    v_submission.months,
    'manual:' || v_submission.method_code,
    'manual:' || v_submission.id::text,
    v_submission.amount_usd,
    'USD',
    now()
  );

  update public.payment_submissions
  set
    status = 'approved',
    reviewed_by = v_actor,
    reviewed_at = now(),
    review_note = nullif(btrim(coalesce(p_note, '')), ''),
    payment_id = (v_result->>'payment_id')::uuid,
    updated_at = now()
  where id = p_submission_id;

  insert into public.admin_audit_logs (
    actor_user_id, action, entity_type, entity_id, new_data
  )
  values (
    v_actor, 'payment_submission.approve', 'payment_submissions',
    p_submission_id::text, v_result
  );

  return v_result || jsonb_build_object('submission_id', p_submission_id);
end;
$$;

create or replace function public.reject_manual_payment(
  p_submission_id uuid,
  p_note text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_submission public.payment_submissions%rowtype;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if v_actor is not null and not public.admin_can_review_payments() then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;

  -- The merchant is told why, so a reason is not optional.
  if v_note is null then
    raise exception 'REVIEW_NOTE_REQUIRED' using errcode = '22023';
  end if;

  select * into v_submission
  from public.payment_submissions
  where id = p_submission_id
  for update;
  if not found then
    raise exception 'SUBMISSION_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_submission.status <> 'pending' then
    return jsonb_build_object(
      'ok', true, 'idempotent', true, 'status', v_submission.status
    );
  end if;

  update public.payment_submissions
  set
    status = 'rejected',
    reviewed_by = v_actor,
    reviewed_at = now(),
    review_note = v_note,
    updated_at = now()
  where id = p_submission_id;

  insert into public.admin_audit_logs (
    actor_user_id, action, entity_type, entity_id, new_data
  )
  values (
    v_actor, 'payment_submission.reject', 'payment_submissions',
    p_submission_id::text, jsonb_build_object('note', v_note)
  );

  return jsonb_build_object('ok', true, 'status', 'rejected');
end;
$$;

revoke all on function public.approve_manual_payment(uuid, text) from public, anon;
revoke all on function public.reject_manual_payment(uuid, text) from public, anon;
grant execute on function public.approve_manual_payment(uuid, text) to authenticated, service_role;
grant execute on function public.reject_manual_payment(uuid, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Admin: issue gift cards. Plaintext codes are returned once, here only.
-- ---------------------------------------------------------------------------
create or replace function public.issue_gift_cards(
  p_count integer,
  p_months integer,
  p_batch_label text default null,
  p_expires_at timestamptz default null,
  p_note text default null,
  p_plan_code text default 'menu_monthly'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_codes jsonb := '[]'::jsonb;
  v_code text;
  v_id uuid;
  v_i integer;
begin
  if v_actor is not null and not public.admin_can_manage_billing() then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;

  if p_count is null or p_count < 1 or p_count > 200 then
    raise exception 'INVALID_COUNT' using errcode = '22023';
  end if;
  if p_months is null or p_months < 1 or p_months > 24 then
    raise exception 'INVALID_MONTHS' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.plans where code = p_plan_code and is_active = true
  ) then
    raise exception 'PLAN_NOT_FOUND' using errcode = 'P0002';
  end if;

  for v_i in 1..p_count loop
    -- Retry on the astronomically unlikely hash collision.
    loop
      v_code := public.generate_gift_card_code();
      exit when not exists (
        select 1 from public.gift_cards
        where code_hash = public.gift_card_code_hash(v_code)
      );
    end loop;

    insert into public.gift_cards (
      code_hash, code_hint, months, plan_code, batch_label, note,
      expires_at, created_by
    )
    values (
      public.gift_card_code_hash(v_code),
      'EMX-****-****-' || right(v_code, 4),
      p_months,
      p_plan_code,
      nullif(btrim(coalesce(p_batch_label, '')), ''),
      nullif(btrim(coalesce(p_note, '')), ''),
      p_expires_at,
      v_actor
    )
    returning id into v_id;

    v_codes := v_codes || jsonb_build_object('id', v_id, 'code', v_code);
  end loop;

  insert into public.admin_audit_logs (
    actor_user_id, action, entity_type, new_data
  )
  values (
    v_actor, 'gift_cards.issue', 'gift_cards',
    jsonb_build_object('count', p_count, 'months', p_months, 'batch', p_batch_label)
  );

  return jsonb_build_object('ok', true, 'cards', v_codes);
end;
$$;

create or replace function public.void_gift_card(p_gift_card_id uuid, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_card public.gift_cards%rowtype;
begin
  if v_actor is not null and not public.admin_can_manage_billing() then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;

  select * into v_card from public.gift_cards where id = p_gift_card_id for update;
  if not found then
    raise exception 'GIFT_CARD_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_card.status = 'redeemed' then
    raise exception 'GIFT_CARD_ALREADY_REDEEMED' using errcode = '22023';
  end if;

  update public.gift_cards
  set status = 'void', note = coalesce(nullif(btrim(coalesce(p_note, '')), ''), note), updated_at = now()
  where id = p_gift_card_id;

  insert into public.admin_audit_logs (actor_user_id, action, entity_type, entity_id)
  values (v_actor, 'gift_cards.void', 'gift_cards', p_gift_card_id::text);

  return jsonb_build_object('ok', true, 'status', 'void');
end;
$$;

revoke all on function public.issue_gift_cards(integer, integer, text, timestamptz, text, text) from public, anon;
revoke all on function public.void_gift_card(uuid, text) from public, anon;
grant execute on function public.issue_gift_cards(integer, integer, text, timestamptz, text, text) to authenticated, service_role;
grant execute on function public.void_gift_card(uuid, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.payment_methods enable row level security;
alter table public.payment_submissions enable row level security;
alter table public.gift_cards enable row level security;
alter table public.gift_card_attempts enable row level security;
alter table public.sales_advisors enable row level security;

-- payment_methods: merchants read the active catalog, billing admins edit it.
drop policy if exists payment_methods_read_active on public.payment_methods;
create policy payment_methods_read_active
  on public.payment_methods
  for select
  to authenticated
  using (is_active = true or public.admin_can_manage_billing());

drop policy if exists payment_methods_admin_insert on public.payment_methods;
create policy payment_methods_admin_insert
  on public.payment_methods
  for insert
  to authenticated
  with check (public.admin_can_manage_billing());

drop policy if exists payment_methods_admin_update on public.payment_methods;
create policy payment_methods_admin_update
  on public.payment_methods
  for update
  to authenticated
  using (public.admin_can_manage_billing())
  with check (public.admin_can_manage_billing());

-- payment_submissions: the merchant sees their own history, reviewers see all.
-- Writes only happen through the functions above.
drop policy if exists payment_submissions_owner_select on public.payment_submissions;
create policy payment_submissions_owner_select
  on public.payment_submissions
  for select
  to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.comercios c
      where c.id = payment_submissions.business_id and c.owner_id = auth.uid()
    )
    or public.admin_can_review_payments()
  );

-- gift_cards: never readable by merchants, not even hashes.
drop policy if exists gift_cards_admin_select on public.gift_cards;
create policy gift_cards_admin_select
  on public.gift_cards
  for select
  to authenticated
  using (public.admin_can_manage_billing());

-- gift_card_attempts: throttle bookkeeping, no client reads.
-- (no policies on purpose → deny by default)

-- sales_advisors: codes must not be browsable, or cash payments self-authorize.
drop policy if exists sales_advisors_admin_select on public.sales_advisors;
create policy sales_advisors_admin_select
  on public.sales_advisors
  for select
  to authenticated
  using (public.admin_can_manage_advisors() or public.admin_can_review_payments());

drop policy if exists sales_advisors_admin_insert on public.sales_advisors;
create policy sales_advisors_admin_insert
  on public.sales_advisors
  for insert
  to authenticated
  with check (public.admin_can_manage_advisors());

drop policy if exists sales_advisors_admin_update on public.sales_advisors;
create policy sales_advisors_admin_update
  on public.sales_advisors
  for update
  to authenticated
  using (public.admin_can_manage_advisors())
  with check (public.admin_can_manage_advisors());

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
revoke all on public.payment_methods from anon, authenticated, public;
revoke all on public.payment_submissions from anon, authenticated, public;
revoke all on public.gift_cards from anon, authenticated, public;
revoke all on public.gift_card_attempts from anon, authenticated, public;
revoke all on public.sales_advisors from anon, authenticated, public;

grant select on public.payment_methods to authenticated;
grant insert, update on public.payment_methods to authenticated;
grant select on public.payment_submissions to authenticated;
grant select on public.gift_cards to authenticated;
grant select, insert, update on public.sales_advisors to authenticated;

grant all on public.payment_methods to service_role;
grant all on public.payment_submissions to service_role;
grant all on public.gift_cards to service_role;
grant all on public.gift_card_attempts to service_role;
grant all on public.sales_advisors to service_role;

-- ---------------------------------------------------------------------------
-- Comments
-- ---------------------------------------------------------------------------
comment on table public.payment_methods is
  'Catalog of payment methods shown to merchants, managed from admin.elmenuxfa.com. verification=automatic settles itself; verification=manual goes to the review queue.';
comment on table public.payment_submissions is
  'Manual payment declarations awaiting admin review. Amounts are server-computed; one pending row per business.';
comment on table public.gift_cards is
  'Prepaid subscription codes. Only the SHA-256 hash is stored; plaintext is returned once by issue_gift_cards().';
comment on table public.sales_advisors is
  'Authorized sales advisors. Their code is what makes a cash payment claim reviewable, so merchants cannot read this table.';
comment on table public.gift_card_attempts is
  'Redemption attempts, used only to throttle code guessing.';
