-- PREVIEW BOOTSTRAP ONLY
-- Allowed project ref: gsfxqzvmyzjjgpigrste
-- Forbidden project ref: qqhberaayhohxlbbhdyi
-- Exposes only the columns required by the public menu browser fallback.
-- Row access remains governed by the existing public-menu RLS policies.

grant usage on schema public to anon, authenticated;

drop policy if exists comercios_preview_anon_select_online on public.comercios;
create policy comercios_preview_anon_select_online
  on public.comercios
  for select
  to anon
  using (en_linea = true);

grant select (
  id, slug, nombre, logo_url, whatsapp, direccion, latitud, longitud,
  permite_delivery, recibe_pedidos_whatsapp, en_linea,
  menu_palette, menu_palette_primary, menu_palette_accent,
  menu_palette_surface, menu_palette_text, menu_theme_mode,
  color_principal, menu_layout, menu_footer, moneda,
  tasa_cambio_pesos, exchange_rate_value, exchange_rate_mode,
  exchange_rate_source, exchange_rate_quote_currency, horarios
) on public.comercios to anon;

grant select (
  id, comercio_id, nombre, activo, created_at, orden, updated_at
) on public.catalogos to anon;

grant select (
  id, comercio_id, nombre, orden, icono, opciones_menu, activo, catalogo_id
) on public.categorias to anon;

grant select (
  id, comercio_id, categoria_id, nombre, descripcion, precio, imagen_url,
  disponible, upsell_badge, precio_comparacion, upsell_enabled, orden,
  opciones_menu
) on public.productos to anon;

grant select (
  id, comercio_id, nombre, tipo, descripcion, detalles
) on public.metodos_pago to anon;

grant select (
  bcv_rate, p2p_binance_rate, updated_at, payload
) on public.global_market_rates to anon;

grant select on public.comercios_menu_public to anon;
grant select on public.metodos_pago_menu_public to anon;

revoke all on public.preview_menu_sync_manifest from anon, authenticated;
grant all on public.preview_menu_sync_manifest to service_role;