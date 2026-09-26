-- PREVIEW BOOTSTRAP ONLY
-- Allowed project ref: gsfxqzvmyzjjgpigrste
-- Forbidden project ref: qqhberaayhohxlbbhdyi
-- Enables authenticated Preview owners to read their own subscription state.
-- The test plan is free and Preview-only; this creates no payment rows.

alter table public.plans enable row level security;
alter table public.plans force row level security;
alter table public.subscriptions enable row level security;
alter table public.subscriptions force row level security;

revoke all on public.plans from public, anon;
revoke all on public.subscriptions from public, anon;
grant select on public.plans to authenticated, service_role;
grant select on public.subscriptions to authenticated, service_role;

drop policy if exists preview_active_plans_select on public.plans;
create policy preview_active_plans_select
  on public.plans
  for select
  to authenticated
  using (is_active = true);

drop policy if exists preview_owner_subscriptions_select on public.subscriptions;
create policy preview_owner_subscriptions_select
  on public.subscriptions
  for select
  to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1
      from public.comercios c
      where c.id = subscriptions.business_id
        and c.owner_id = auth.uid()
    )
  );

insert into public.plans (
  code,
  name,
  description,
  price_amount,
  price_currency,
  billing_interval,
  is_active,
  features
)
values (
  'preview-access',
  'Acceso de pruebas Preview',
  'Plan gratuito solo para el entorno aislado de pruebas.',
  0,
  'USD',
  'month',
  true,
  '["Preview", "Sin cobros", "Solo datos de prueba"]'::jsonb
)
on conflict (code) do update
set
  name = excluded.name,
  description = excluded.description,
  price_amount = excluded.price_amount,
  price_currency = excluded.price_currency,
  billing_interval = excluded.billing_interval,
  is_active = true,
  features = excluded.features,
  updated_at = now();