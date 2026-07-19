-- PREVIEW BOOTSTRAP ONLY
-- DO NOT APPLY TO PRODUCTION
-- Allowed project ref: gsfxqzvmyzjjgpigrste
-- Forbidden project ref: qqhberaayhohxlbbhdyi
--
-- SYNTHETIC DATA ONLY. No real names, phones, emails, or production rows.
--
-- BEFORE / AFTER:
-- 1) Create Auth users in Preview Dashboard:
--    - preview.owner.a@example.com  (comercio A)
--    - preview.owner.b@example.com  (comercio B / isolation)
-- 2) Bind owners (service role / SQL editor on Preview only):
--      update public.comercios set owner_id = '<auth-uuid-a>' where slug = 'preview-demo';
--      update public.comercios set owner_id = '<auth-uuid-b>' where slug = 'preview-rival';
-- Seed inserts owner_id = null so FK to auth.users is not violated.

insert into public.comercios (
  id, nombre, slug, logo_url, whatsapp, direccion, latitud, longitud,
  permite_delivery, en_linea, moneda, tasa_cambio_pesos, exchange_rate_value,
  menu_palette, owner_id, onboarding_completed
) values
(
  '11111111-1111-4111-8111-111111111111',
  'Preview Cafe Demo',
  'preview-demo',
  null,
  '5800000000001',
  'Calle Falsa 123, Ciudad Demo',
  10.4806,
  -66.9036,
  true,
  true,
  'USD',
  40,
  40,
  'bosque',
  null,
  true
),
(
  '22222222-2222-4222-8222-222222222222',
  'Preview Rival Shop',
  'preview-rival',
  null,
  '5800000000002',
  'Avenida Sintetica 45',
  10.49,
  -66.91,
  false,
  true,
  'USD',
  40,
  40,
  'oceano',
  null,
  true
)
on conflict (id) do nothing;

insert into public.catalogos (id, comercio_id, nombre, activo, orden) values
('31111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 'Menu principal', true, 0)
on conflict (id) do nothing;

insert into public.categorias (id, comercio_id, catalogo_id, nombre, orden, activo) values
('41111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', '31111111-1111-4111-8111-111111111111', 'Bebidas', 0, true),
('41111111-1111-4111-8111-111111111112', '11111111-1111-4111-8111-111111111111', '31111111-1111-4111-8111-111111111111', 'Comidas', 1, true)
on conflict (id) do nothing;

insert into public.productos (
  id, comercio_id, categoria_id, nombre, descripcion, precio, disponible, orden
) values
('51111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', '41111111-1111-4111-8111-111111111111', 'Cafe Demo', 'Bebida sintetica de prueba', 2.50, true, 0),
('51111111-1111-4111-8111-111111111112', '11111111-1111-4111-8111-111111111111', '41111111-1111-4111-8111-111111111111', 'Te Demo', 'Infusión sintetica', 2.00, true, 1),
('51111111-1111-4111-8111-111111111113', '11111111-1111-4111-8111-111111111111', '41111111-1111-4111-8111-111111111112', 'Arepa Demo', 'Plato sintetico', 4.50, true, 0),
('51111111-1111-4111-8111-111111111114', '11111111-1111-4111-8111-111111111111', '41111111-1111-4111-8111-111111111112', 'Empanada Demo', 'Snack sintetico', 1.75, true, 1)
on conflict (id) do nothing;

insert into public.metodos_pago (id, comercio_id, nombre, tipo, descripcion, detalles) values
(
  '61111111-1111-4111-8111-111111111111',
  '11111111-1111-4111-8111-111111111111',
  'Pago Movil Demo',
  'pago_movil__usd',
  'Metodo sintetico',
  '{"banco":"Banco Demo","telefono":"04000000000"}'
),
(
  '61111111-1111-4111-8111-111111111112',
  '11111111-1111-4111-8111-111111111111',
  'Efectivo Demo',
  'efectivo__usd',
  'Pago en efectivo sintetico',
  null
)
on conflict (id) do nothing;

insert into public.global_market_rates (bcv_rate, p2p_binance_rate, provider, payload)
values (36.5000, 38.0000, 'preview-seed', '{"note":"synthetic"}'::jsonb);

-- Optional courier for delivery tests (owner A comercio)
insert into public.delivery_couriers (
  id, comercio_id, alias, phone_e164, normalized_phone, is_active
) values (
  '71111111-1111-4111-8111-111111111111',
  '11111111-1111-4111-8111-111111111111',
  'Rider Demo',
  '+580000000099',
  '580000000099',
  true
)
on conflict (id) do nothing;
