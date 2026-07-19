-- PREVIEW BOOTSTRAP ONLY
-- DO NOT APPLY TO PRODUCTION
-- Allowed project ref: gsfxqzvmyzjjgpigrste
-- Forbidden project ref: qqhberaayhohxlbbhdyi
--
-- Security structures applied at birth (no vulnerable interim state).

-- Tracking hash already in 01-base-schema; ensure comment/index
comment on column public.pedidos.public_tracking_token_hash is
  'SHA-256 hash of public tracking token. Raw token never stored.';

create table if not exists public.order_idempotency_keys (
  idempotency_key text primary key,
  request_hash text not null,
  order_id text not null,
  response_json jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists order_idempotency_keys_created_at_idx
  on public.order_idempotency_keys (created_at desc);

comment on table public.order_idempotency_keys is
  'Maps X-Idempotency-Key to prior order create response. service_role only.';

-- Public menu projections (no owner_id / private fields).
-- Default view security (definer/owner) so anon can read the projection
-- without SELECT privilege on base tables (avoids leaking owner_id).
create or replace view public.comercios_menu_public as
select
  id, slug, nombre, logo_url, whatsapp, direccion, latitud, longitud,
  permite_delivery, en_linea, menu_palette, menu_palette_primary,
  menu_palette_accent, menu_palette_surface, menu_palette_text,
  menu_layout, menu_footer, moneda, tasa_cambio_pesos, exchange_rate_value
from public.comercios
where en_linea = true;

create or replace view public.metodos_pago_menu_public as
select m.id, m.comercio_id, m.nombre, m.tipo, m.descripcion, m.detalles
from public.metodos_pago m
inner join public.comercios c on c.id = m.comercio_id
where c.en_linea = true;
