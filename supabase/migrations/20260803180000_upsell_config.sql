-- Configurable public-menu upselling (merchant panel).
alter table public.comercios
  add column if not exists upsell_config jsonb null;

comment on column public.comercios.upsell_config is
  'Public menu upsell settings: {schema_version, mode: auto|custom|off, combo_product_ids, cross_sell_product_ids, free_delivery_threshold, show_product_nudges}. Null = auto heuristics.';

alter table public.productos
  add column if not exists upsell_badge text null;

alter table public.productos
  add column if not exists precio_comparacion numeric null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'productos_upsell_badge_check'
      and conrelid = 'public.productos'::regclass
  ) then
    alter table public.productos
      add constraint productos_upsell_badge_check
      check (upsell_badge is null or upsell_badge in ('mas_pedido', 'mejor_valor', 'ahorra'));
  end if;
end
$$;

comment on column public.productos.upsell_badge is
  'Optional combo-rail badge: mas_pedido | mejor_valor | ahorra.';

comment on column public.productos.precio_comparacion is
  'Optional compare-at / strikethrough price for upsell rails.';

-- Recreate public projection (CREATE OR REPLACE cannot change column set safely).
drop view if exists public.comercios_menu_public;

create view public.comercios_menu_public
with (security_invoker = true)
as
select
  id,
  slug,
  nombre,
  logo_url,
  whatsapp,
  direccion,
  latitud,
  longitud,
  permite_delivery,
  en_linea,
  menu_palette,
  menu_palette_primary,
  menu_palette_accent,
  menu_palette_surface,
  menu_palette_text,
  menu_theme_mode,
  color_principal,
  menu_layout,
  menu_footer,
  moneda,
  tasa_cambio_pesos,
  exchange_rate_value,
  upsell_config
from public.comercios;

revoke all on public.comercios_menu_public from anon, authenticated, public;
grant select on public.comercios_menu_public to anon, authenticated;
