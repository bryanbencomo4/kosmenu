-- Persist public menu light/dark appearance independently from brand accent colors.
alter table public.comercios
  add column if not exists menu_theme_mode text not null default 'light';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'comercios_menu_theme_mode_check'
      and conrelid = 'public.comercios'::regclass
  ) then
    alter table public.comercios
      add constraint comercios_menu_theme_mode_check
      check (menu_theme_mode in ('light', 'dark'));
  end if;
end
$$;

comment on column public.comercios.menu_theme_mode is
  'Public menu appearance mode: light or dark. Brand accents come from menu_palette_*.';

-- Recreate optional public projection (column order changed; CREATE OR REPLACE cannot rename).
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
  exchange_rate_value
from public.comercios;

revoke all on public.comercios_menu_public from anon, authenticated, public;
