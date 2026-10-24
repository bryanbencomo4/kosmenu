-- Operating states for virtual (no public address) businesses.
-- Physical businesses keep direccion + lat/lng; this column is additive.

alter table public.comercios
  add column if not exists estados_operacion text[] not null default '{}'::text[];

comment on column public.comercios.estados_operacion is
  'Canonical Venezuela state slugs where a (usually virtual) business operates. Used for elmenuxfa directory region filters and delivery service area.';

create index if not exists idx_comercios_estados_operacion
  on public.comercios using gin (estados_operacion);

-- Guard: only allow known Venezuela state slugs (empty array always OK).
create or replace function public.comercios_estados_operacion_valid(estados text[])
returns boolean
language sql
immutable
as $$
  select estados is null
    or cardinality(estados) = 0
    or estados <@ array[
      'distrito-capital',
      'amazonas',
      'anzoategui',
      'apure',
      'aragua',
      'barinas',
      'bolivar',
      'carabobo',
      'cojedes',
      'delta-amacuro',
      'falcon',
      'guarico',
      'la-guaira',
      'lara',
      'merida',
      'miranda',
      'monagas',
      'nueva-esparta',
      'portuguesa',
      'sucre',
      'tachira',
      'trujillo',
      'yaracuy',
      'zulia'
    ]::text[];
$$;

alter table public.comercios
  drop constraint if exists comercios_estados_operacion_valid_chk;

alter table public.comercios
  add constraint comercios_estados_operacion_valid_chk
  check (public.comercios_estados_operacion_valid(estados_operacion));

-- Keep the public menu view in sync for surfaces that still read it.
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
  recibe_pedidos_whatsapp,
  negocio_virtual,
  estados_operacion,
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
  upsell_config,
  horarios
from public.comercios;

revoke all on public.comercios_menu_public from anon, authenticated, public;
grant select on public.comercios_menu_public to anon, authenticated;
