-- LOCAL ONLY — additive, non-breaking.
-- Option A (least disruptive for future anon SELECT): security_invoker views
-- exposing only public menu columns. Prefer Next `/api/menu` DTO in clients (2A.3).
-- Do not grant these until restrictive RLS is applied and clients are migrated.

create or replace view public.comercios_menu_public
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
  menu_layout,
  menu_footer,
  moneda,
  tasa_cambio_pesos,
  exchange_rate_value
from public.comercios;

create or replace view public.metodos_pago_menu_public
with (security_invoker = true)
as
select
  id,
  comercio_id,
  nombre,
  tipo,
  descripcion,
  detalles
from public.metodos_pago;

revoke all on public.comercios_menu_public from anon, authenticated, public;
revoke all on public.metodos_pago_menu_public from anon, authenticated, public;
-- Grants intentionally omitted until Preview GO after clients use DTO/API.
comment on view public.comercios_menu_public is
  'Public menu projection — excludes owner_id and private comercio fields.';
comment on view public.metodos_pago_menu_public is
  'Public payment-method projection — excludes private/admin fields.';
