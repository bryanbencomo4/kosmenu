alter table public.comercios
  add column if not exists menu_palette_primary integer,
  add column if not exists menu_palette_accent integer,
  add column if not exists menu_palette_surface integer,
  add column if not exists menu_palette_text integer;

comment on column public.comercios.menu_palette_primary is
  'Color principal del menu en formato ARGB32.';

comment on column public.comercios.menu_palette_accent is
  'Color secundario del menu en formato ARGB32.';

comment on column public.comercios.menu_palette_surface is
  'Color de fondo/superficie del menu en formato ARGB32.';

comment on column public.comercios.menu_palette_text is
  'Color de texto del menu en formato ARGB32.';
