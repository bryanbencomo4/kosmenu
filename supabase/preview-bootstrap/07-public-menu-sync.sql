-- PREVIEW BOOTSTRAP ONLY
-- Allowed project ref: gsfxqzvmyzjjgpigrste
-- Forbidden project ref: qqhberaayhohxlbbhdyi
-- Adds public-menu fields missing from the synthetic Preview bootstrap and a
-- service-role-only manifest for scheduled public-menu synchronization.

alter table public.comercios
  add column if not exists horarios jsonb not null default '{}'::jsonb,
  add column if not exists is_platform_demo boolean not null default false,
  add column if not exists menu_theme_mode text not null default 'light',
  add column if not exists upsell_config jsonb;

alter table public.categorias
  add column if not exists opciones_menu jsonb,
  add column if not exists rol text;

alter table public.productos
  add column if not exists opciones_menu jsonb,
  add column if not exists precio_comparacion numeric,
  add column if not exists upsell_badge text,
  add column if not exists upsell_enabled boolean not null default true;

create table if not exists public.preview_menu_sync_manifest (
  comercio_id uuid primary key references public.comercios(id) on delete cascade,
  last_synced_at timestamptz not null default now()
);

alter table public.preview_menu_sync_manifest enable row level security;
alter table public.preview_menu_sync_manifest force row level security;
revoke all on table public.preview_menu_sync_manifest from public, anon, authenticated;
grant all on table public.preview_menu_sync_manifest to service_role;