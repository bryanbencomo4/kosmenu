-- PREVIEW BOOTSTRAP ONLY — kosmenu-preview (gsfxqzvmyzjjgpigrste)
-- Upsell / promo engine tables matching production migration 20260810180000.
-- Service-role grants for the business assistant. No production apply.

-- Category role (cold-start templates)
alter table public.categorias
  add column if not exists rol text null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'categorias_rol_check' and conrelid = 'public.categorias'::regclass
  ) then
    alter table public.categorias
      add constraint categorias_rol_check
      check (rol is null or rol in ('main', 'drink', 'side', 'dessert', 'extra', 'combo', 'other'));
  end if;
end
$$;

alter table public.productos
  add column if not exists upsell_enabled boolean not null default true;

create or replace function public.tg_set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.upsell_settings (
  id uuid primary key default gen_random_uuid(),
  comercio_id uuid not null unique references public.comercios(id) on delete cascade,
  enabled boolean not null default true,
  show_add_to_cart boolean not null default true,
  show_cart boolean not null default true,
  show_checkout boolean not null default true,
  max_add_suggestions integer not null default 2,
  max_cart_suggestions integer not null default 3,
  max_checkout_suggestions integer not null default 2,
  free_delivery_threshold numeric null,
  free_delivery_order_types text[] not null default array['delivery'],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_upsell_settings_updated_at on public.upsell_settings;
create trigger trg_upsell_settings_updated_at
before update on public.upsell_settings
for each row execute function public.tg_set_updated_at();

create table if not exists public.upsell_rules (
  id uuid primary key default gen_random_uuid(),
  comercio_id uuid not null references public.comercios(id) on delete cascade,
  name text not null,
  enabled boolean not null default true,
  trigger_type text not null check (trigger_type in ('product', 'category', 'cart')),
  trigger_product_id uuid null references public.productos(id) on delete cascade,
  trigger_category_id uuid null references public.categorias(id) on delete cascade,
  trigger_min_qty integer not null default 1,
  surface text not null check (surface in ('add_to_cart', 'cart', 'checkout')),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high')),
  min_cart_amount numeric null,
  max_cart_amount numeric null,
  order_type text null check (order_type in ('delivery', 'pickup')),
  max_suggestions integer not null default 2,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint upsell_rules_trigger_shape check (
    (trigger_type = 'product' and trigger_product_id is not null and trigger_category_id is null)
    or (trigger_type = 'category' and trigger_category_id is not null and trigger_product_id is null)
    or (trigger_type = 'cart' and trigger_product_id is null and trigger_category_id is null)
  )
);

create index if not exists upsell_rules_comercio_id_idx on public.upsell_rules (comercio_id);

drop trigger if exists trg_upsell_rules_updated_at on public.upsell_rules;
create trigger trg_upsell_rules_updated_at
before update on public.upsell_rules
for each row execute function public.tg_set_updated_at();

create table if not exists public.upsell_rule_targets (
  id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references public.upsell_rules(id) on delete cascade,
  target_type text not null check (target_type in ('product', 'category')),
  product_id uuid null references public.productos(id) on delete cascade,
  category_id uuid null references public.categorias(id) on delete cascade,
  position integer not null default 0,
  enabled boolean not null default true,
  constraint upsell_rule_targets_shape check (
    (target_type = 'product' and product_id is not null and category_id is null)
    or (target_type = 'category' and category_id is not null and product_id is null)
  )
);

create index if not exists upsell_rule_targets_rule_id_idx on public.upsell_rule_targets (rule_id);

create table if not exists public.bundles (
  id uuid primary key default gen_random_uuid(),
  comercio_id uuid not null references public.comercios(id) on delete cascade,
  name text not null,
  description text null,
  pricing_type text not null default 'fixed' check (pricing_type in ('fixed')),
  bundle_price numeric not null check (bundle_price >= 0),
  enabled boolean not null default true,
  start_at timestamptz null,
  end_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists bundles_comercio_id_idx on public.bundles (comercio_id);

drop trigger if exists trg_bundles_updated_at on public.bundles;
create trigger trg_bundles_updated_at
before update on public.bundles
for each row execute function public.tg_set_updated_at();

create table if not exists public.bundle_items (
  id uuid primary key default gen_random_uuid(),
  bundle_id uuid not null references public.bundles(id) on delete cascade,
  product_id uuid not null references public.productos(id) on delete cascade,
  quantity integer not null default 1 check (quantity > 0),
  required boolean not null default true
);

create index if not exists bundle_items_bundle_id_idx on public.bundle_items (bundle_id);

create table if not exists public.upsell_events (
  id uuid primary key default gen_random_uuid(),
  comercio_id uuid not null references public.comercios(id) on delete cascade,
  session_id text not null,
  order_id uuid null references public.pedidos(id) on delete set null,
  rule_id uuid null references public.upsell_rules(id) on delete set null,
  bundle_id uuid null references public.bundles(id) on delete set null,
  product_id uuid null references public.productos(id) on delete set null,
  surface text not null check (surface in ('add_to_cart', 'cart', 'checkout')),
  event_type text not null check (event_type in ('impression', 'click', 'add', 'dismiss', 'purchase')),
  unit_price numeric null,
  cart_amount_before numeric null,
  cart_amount_after numeric null,
  created_at timestamptz not null default now()
);

create index if not exists upsell_events_comercio_id_created_idx
  on public.upsell_events (comercio_id, created_at desc);

alter table public.upsell_settings enable row level security;
alter table public.upsell_settings force row level security;
alter table public.upsell_rules enable row level security;
alter table public.upsell_rules force row level security;
alter table public.upsell_rule_targets enable row level security;
alter table public.upsell_rule_targets force row level security;
alter table public.bundles enable row level security;
alter table public.bundles force row level security;
alter table public.bundle_items enable row level security;
alter table public.bundle_items force row level security;
alter table public.upsell_events enable row level security;
alter table public.upsell_events force row level security;

revoke all on table public.upsell_settings from public, anon;
revoke all on table public.upsell_rules from public, anon;
revoke all on table public.upsell_rule_targets from public, anon;
revoke all on table public.bundles from public, anon;
revoke all on table public.bundle_items from public, anon;
revoke all on table public.upsell_events from public, anon;

grant select, insert, update, delete on table public.upsell_settings to authenticated, service_role;
grant select, insert, update, delete on table public.upsell_rules to authenticated, service_role;
grant select, insert, update, delete on table public.upsell_rule_targets to authenticated, service_role;
grant select, insert, update, delete on table public.bundles to authenticated, service_role;
grant select, insert, update, delete on table public.bundle_items to authenticated, service_role;
grant select, insert on table public.upsell_events to authenticated, service_role;
