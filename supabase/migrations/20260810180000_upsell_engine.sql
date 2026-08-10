-- Real upsell engine: settings, rules, bundles, events.
-- Replaces the heuristic/JSON-config upsell system (comercios.upsell_config).
-- That legacy column is left in place untouched (unused going forward) to avoid
-- a risky view rewrite; new code paths never read or write it again.

-- ---------------------------------------------------------------------------
-- Category role (cold-start templates: main -> drink, main -> side, etc.)
-- ---------------------------------------------------------------------------
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

comment on column public.categorias.rol is
  'Category role used for cold-start cross-sell templates (main, drink, side, dessert, extra, combo, other).';

-- ---------------------------------------------------------------------------
-- Product-level upsell opt-out (independent from disponible)
-- ---------------------------------------------------------------------------
alter table public.productos
  add column if not exists upsell_enabled boolean not null default true;

comment on column public.productos.upsell_enabled is
  'When false, this product is never used as an upsell/cross-sell target even if a rule would match it.';

-- ---------------------------------------------------------------------------
-- Shared updated_at trigger helper
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- upsell_settings: one row per comercio
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- upsell_rules: the actual rule engine
-- ---------------------------------------------------------------------------
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
create index if not exists upsell_rules_trigger_product_idx on public.upsell_rules (trigger_product_id);
create index if not exists upsell_rules_trigger_category_idx on public.upsell_rules (trigger_category_id);

drop trigger if exists trg_upsell_rules_updated_at on public.upsell_rules;
create trigger trg_upsell_rules_updated_at
before update on public.upsell_rules
for each row execute function public.tg_set_updated_at();

-- ---------------------------------------------------------------------------
-- upsell_rule_targets: what a rule suggests (product or whole category)
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- bundles: real commercial offers (fixed price, fixed items)
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- upsell_events: impressions/clicks/adds/dismissals/purchases for analytics
-- ---------------------------------------------------------------------------
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
create index if not exists upsell_events_rule_id_idx on public.upsell_events (rule_id);
create index if not exists upsell_events_session_id_idx on public.upsell_events (session_id);

-- ---------------------------------------------------------------------------
-- RLS: owner-only CRUD on config tables, owner-only SELECT on events.
-- All public/anon reads and all event inserts go through the service-role
-- server client (Next.js API routes), never through anon/authenticated RLS.
-- ---------------------------------------------------------------------------
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

do $$
declare
  t text;
begin
  foreach t in array array['upsell_settings', 'upsell_rules', 'bundles']
  loop
    execute format('drop policy if exists %I on public.%I', t || '_owner_select', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (public.is_comercio_owner(comercio_id))',
      t || '_owner_select', t
    );
    execute format('drop policy if exists %I on public.%I', t || '_owner_insert', t);
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (public.is_comercio_owner(comercio_id))',
      t || '_owner_insert', t
    );
    execute format('drop policy if exists %I on public.%I', t || '_owner_update', t);
    execute format(
      'create policy %I on public.%I for update to authenticated using (public.is_comercio_owner(comercio_id)) with check (public.is_comercio_owner(comercio_id))',
      t || '_owner_update', t
    );
    execute format('drop policy if exists %I on public.%I', t || '_owner_delete', t);
    execute format(
      'create policy %I on public.%I for delete to authenticated using (public.is_comercio_owner(comercio_id))',
      t || '_owner_delete', t
    );
  end loop;
end
$$;

drop policy if exists upsell_rule_targets_owner_select on public.upsell_rule_targets;
create policy upsell_rule_targets_owner_select
  on public.upsell_rule_targets for select to authenticated
  using (
    exists (
      select 1 from public.upsell_rules r
      where r.id = upsell_rule_targets.rule_id and public.is_comercio_owner(r.comercio_id)
    )
  );

drop policy if exists upsell_rule_targets_owner_insert on public.upsell_rule_targets;
create policy upsell_rule_targets_owner_insert
  on public.upsell_rule_targets for insert to authenticated
  with check (
    exists (
      select 1 from public.upsell_rules r
      where r.id = upsell_rule_targets.rule_id and public.is_comercio_owner(r.comercio_id)
    )
  );

drop policy if exists upsell_rule_targets_owner_update on public.upsell_rule_targets;
create policy upsell_rule_targets_owner_update
  on public.upsell_rule_targets for update to authenticated
  using (
    exists (
      select 1 from public.upsell_rules r
      where r.id = upsell_rule_targets.rule_id and public.is_comercio_owner(r.comercio_id)
    )
  )
  with check (
    exists (
      select 1 from public.upsell_rules r
      where r.id = upsell_rule_targets.rule_id and public.is_comercio_owner(r.comercio_id)
    )
  );

drop policy if exists upsell_rule_targets_owner_delete on public.upsell_rule_targets;
create policy upsell_rule_targets_owner_delete
  on public.upsell_rule_targets for delete to authenticated
  using (
    exists (
      select 1 from public.upsell_rules r
      where r.id = upsell_rule_targets.rule_id and public.is_comercio_owner(r.comercio_id)
    )
  );

drop policy if exists bundle_items_owner_select on public.bundle_items;
create policy bundle_items_owner_select
  on public.bundle_items for select to authenticated
  using (
    exists (
      select 1 from public.bundles b
      where b.id = bundle_items.bundle_id and public.is_comercio_owner(b.comercio_id)
    )
  );

drop policy if exists bundle_items_owner_insert on public.bundle_items;
create policy bundle_items_owner_insert
  on public.bundle_items for insert to authenticated
  with check (
    exists (
      select 1 from public.bundles b
      where b.id = bundle_items.bundle_id and public.is_comercio_owner(b.comercio_id)
    )
  );

drop policy if exists bundle_items_owner_update on public.bundle_items;
create policy bundle_items_owner_update
  on public.bundle_items for update to authenticated
  using (
    exists (
      select 1 from public.bundles b
      where b.id = bundle_items.bundle_id and public.is_comercio_owner(b.comercio_id)
    )
  )
  with check (
    exists (
      select 1 from public.bundles b
      where b.id = bundle_items.bundle_id and public.is_comercio_owner(b.comercio_id)
    )
  );

drop policy if exists bundle_items_owner_delete on public.bundle_items;
create policy bundle_items_owner_delete
  on public.bundle_items for delete to authenticated
  using (
    exists (
      select 1 from public.bundles b
      where b.id = bundle_items.bundle_id and public.is_comercio_owner(b.comercio_id)
    )
  );

-- Events: owner can read their own analytics; nobody (anon/authenticated) can
-- write directly. Writes happen exclusively via the service-role API route.
drop policy if exists upsell_events_owner_select on public.upsell_events;
create policy upsell_events_owner_select
  on public.upsell_events for select to authenticated
  using (public.is_comercio_owner(comercio_id));

grant select, insert, update, delete on public.upsell_settings to authenticated;
grant select, insert, update, delete on public.upsell_rules to authenticated;
grant select, insert, update, delete on public.upsell_rule_targets to authenticated;
grant select, insert, update, delete on public.bundles to authenticated;
grant select, insert, update, delete on public.bundle_items to authenticated;
grant select on public.upsell_events to authenticated;

-- ---------------------------------------------------------------------------
-- Owner-facing summary RPC for the "Resumen" panel screen.
-- ---------------------------------------------------------------------------
create or replace function public.get_upsell_summary(p_comercio_id uuid, p_since timestamptz)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  if not public.is_comercio_owner(p_comercio_id) then
    raise exception 'not authorized';
  end if;

  select jsonb_build_object(
    'revenue_from_upsell', coalesce(sum(e.unit_price) filter (where e.event_type = 'add'), 0),
    'items_added', count(*) filter (where e.event_type = 'add'),
    'impressions', count(*) filter (where e.event_type = 'impression'),
    'accepted', count(*) filter (where e.event_type = 'add'),
    'attach_rate', case
      when count(*) filter (where e.event_type = 'impression') = 0 then 0
      else round(
        (count(*) filter (where e.event_type = 'add'))::numeric
        / (count(*) filter (where e.event_type = 'impression'))::numeric,
        4
      )
    end,
    'avg_ticket_increase', coalesce(
      avg(e.cart_amount_after - e.cart_amount_before)
        filter (where e.event_type = 'add' and e.cart_amount_after is not null and e.cart_amount_before is not null),
      0
    )
  )
  into result
  from public.upsell_events e
  where e.comercio_id = p_comercio_id
    and e.created_at >= p_since;

  return coalesce(result, jsonb_build_object(
    'revenue_from_upsell', 0, 'items_added', 0, 'impressions', 0,
    'accepted', 0, 'attach_rate', 0, 'avg_ticket_increase', 0
  ));
end;
$$;

revoke all on function public.get_upsell_summary(uuid, timestamptz) from public;
grant execute on function public.get_upsell_summary(uuid, timestamptz) to authenticated;
