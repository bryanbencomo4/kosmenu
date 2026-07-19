-- PREVIEW BOOTSTRAP ONLY
-- DO NOT APPLY TO PRODUCTION
-- Allowed project ref: gsfxqzvmyzjjgpigrste
-- Forbidden project ref: qqhberaayhohxlbbhdyi

create extension if not exists pgcrypto with schema extensions;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'pedido_estado') then
    create type public.pedido_estado as enum (
      'pendiente', 'confirmado', 'preparando', 'en_camino', 'entregado', 'cancelado'
    );
  end if;
  if not exists (select 1 from pg_type where typname = 'exchange_rate_mode') then
    create type public.exchange_rate_mode as enum ('manual', 'auto');
  end if;
  if not exists (select 1 from pg_type where typname = 'exchange_rate_source') then
    create type public.exchange_rate_source as enum ('bcv', 'p2p_binance');
  end if;
end $$;

create table if not exists public.comercios (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  logo_url text,
  color_principal text default '#FFFF6B00',
  config_qr jsonb,
  created_at timestamptz default now(),
  moneda_principal text default 'USD',
  tasa_cambio_pesos numeric default 0,
  whatsapp text,
  owner_id uuid references auth.users(id) on delete set null,
  slug text unique,
  en_linea boolean default true,
  branding_ia jsonb,
  categoria text,
  telefonos text,
  direccion text,
  latitud double precision,
  longitud double precision,
  permite_delivery boolean not null default false,
  recibe_pedidos_whatsapp boolean not null default true,
  moneda text,
  metodo_pago_predeterminado text,
  metodos_pago jsonb,
  menu_layout text,
  menu_palette text,
  menu_font text,
  menu_footer text,
  creado_por_ia boolean,
  confianza_ia double precision,
  updated_at timestamptz not null default now(),
  exchange_rate_mode public.exchange_rate_mode not null default 'auto',
  exchange_rate_source public.exchange_rate_source not null default 'bcv',
  exchange_rate_value numeric(12,4),
  last_rate_update timestamptz,
  exchange_rate_quote_currency text,
  ai_enabled boolean not null default true,
  onboarding_completed boolean not null default false,
  ai_image_generation_used boolean not null default false,
  ai_images_generated_count integer not null default 0,
  ai_images_generation_completed_at timestamp without time zone,
  negocio_virtual boolean not null default false,
  mostrar_en_directorio_publico boolean not null default true,
  menu_palette_primary integer,
  menu_palette_accent integer,
  menu_palette_surface integer,
  menu_palette_text integer
);

create index if not exists comercios_owner_id_idx on public.comercios (owner_id);
create index if not exists comercios_slug_idx on public.comercios (slug);

create table if not exists public.catalogos (
  id uuid primary key default gen_random_uuid(),
  comercio_id uuid references public.comercios(id) on delete cascade,
  nombre text not null,
  activo boolean default true,
  created_at timestamptz default now(),
  orden integer default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.categorias (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  orden integer default 0,
  created_at timestamptz default now(),
  comercio_id uuid references public.comercios(id) on delete cascade,
  creado_por_ia boolean default false,
  confianza_ia numeric default 1.0,
  activo boolean default true,
  catalogo_id uuid references public.catalogos(id) on delete set null,
  icono text,
  updated_at timestamptz not null default now()
);

create index if not exists categorias_comercio_id_idx on public.categorias (comercio_id);

create table if not exists public.productos (
  id uuid primary key default gen_random_uuid(),
  categoria_id uuid references public.categorias(id) on delete set null,
  nombre text not null,
  descripcion text,
  precio numeric not null,
  imagen_url text,
  disponible boolean default true,
  orden integer default 0,
  created_at timestamptz default now(),
  creado_por_ia boolean default false,
  confianza_ia numeric default 1.0,
  comercio_id uuid references public.comercios(id) on delete cascade,
  updated_at timestamptz not null default now(),
  imagen_source_type text not null default 'manual',
  ai_image_status text not null default 'none',
  ai_image_error_message text
);

create index if not exists productos_comercio_id_idx on public.productos (comercio_id);
create index if not exists productos_categoria_id_idx on public.productos (categoria_id);

create table if not exists public.metodos_pago (
  id uuid primary key default gen_random_uuid(),
  comercio_id uuid references public.comercios(id) on delete cascade,
  tipo text not null,
  banco text,
  titular text,
  documento text,
  telefono text,
  correo text,
  instrucciones text,
  created_at timestamptz default now(),
  nombre text,
  descripcion text,
  detalles text,
  cedula text,
  numero text,
  alias text,
  updated_at timestamptz not null default now()
);

create index if not exists metodos_pago_comercio_id_idx on public.metodos_pago (comercio_id);

create table if not exists public.pedidos (
  id uuid primary key default gen_random_uuid(),
  comercio_id uuid references public.comercios(id) on delete cascade,
  mesa text,
  detalles jsonb not null default '{}'::jsonb,
  total numeric not null default 0,
  metodo_pago text,
  cliente_nombre text,
  created_at timestamptz default now(),
  cliente_email text,
  creado_por_ia boolean,
  confianza_ia double precision,
  updated_at timestamptz not null default now(),
  nombre_cliente text,
  telefono_cliente text,
  costo_delivery numeric(10,2) not null default 0,
  estado public.pedido_estado not null default 'pendiente',
  delivery_latitude double precision,
  delivery_longitude double precision,
  public_tracking_token_hash text
);

create index if not exists pedidos_comercio_id_idx on public.pedidos (comercio_id);
create index if not exists pedidos_created_at_idx on public.pedidos (created_at desc);
create index if not exists pedidos_estado_idx on public.pedidos (estado);
create index if not exists pedidos_public_tracking_token_hash_idx
  on public.pedidos (public_tracking_token_hash)
  where public_tracking_token_hash is not null;

create table if not exists public.delivery_invitations (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references public.pedidos(id) on delete cascade,
  order_id text not null,
  comercio_id uuid not null references public.comercios(id) on delete cascade,
  token_hash text not null unique,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'arrived', 'completed', 'expired', 'revoked')),
  invited_phone text,
  invited_note text,
  invited_by uuid,
  accepted_by_name text,
  accepted_at timestamptz,
  arrived_at timestamptz,
  completed_at timestamptz,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  last_seen_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.delivery_invitation_events (
  id bigserial primary key,
  invitation_id uuid not null references public.delivery_invitations(id) on delete cascade,
  pedido_id uuid not null references public.pedidos(id) on delete cascade,
  order_id text not null,
  event_type text not null,
  actor text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_delivery_invitations_order_id on public.delivery_invitations(order_id);
create index if not exists idx_delivery_invitations_pedido_id on public.delivery_invitations(pedido_id);
create unique index if not exists ux_delivery_invites_active_order
  on public.delivery_invitations(pedido_id)
  where status in ('accepted', 'arrived');

create table if not exists public.delivery_couriers (
  id uuid primary key default gen_random_uuid(),
  comercio_id uuid not null references public.comercios(id) on delete cascade,
  alias text not null,
  phone_e164 text not null,
  normalized_phone text not null,
  created_by uuid,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists delivery_couriers_comercio_id_idx on public.delivery_couriers (comercio_id);

create table if not exists public.global_market_rates (
  id bigserial primary key,
  bcv_rate numeric(12,4) not null,
  p2p_binance_rate numeric(12,4) not null,
  provider text,
  payload jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.user_tokens (
  user_id uuid primary key references auth.users(id) on delete cascade,
  fcm_token text not null,
  device_type text not null default 'unknown',
  updated_at timestamptz not null default now()
);

create table if not exists public.admin_users (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete set null,
  email text not null unique,
  role text not null,
  is_active boolean not null default true,
  invited_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid,
  actor_email text,
  action text not null,
  entity_type text,
  entity_id text,
  old_data jsonb,
  new_data jsonb,
  ip_address text,
  user_agent text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.consumer_newsletter_subscribers (
  email text primary key,
  status text not null default 'active',
  source text not null default 'consumer-home-footer',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_subscribed_at timestamptz not null default now()
);
