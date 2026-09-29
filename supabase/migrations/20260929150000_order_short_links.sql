create table if not exists public.order_short_links (
  code text primary key,
  pedido_id uuid not null references public.pedidos(id) on delete cascade,
  order_id text not null,
  comercio_id uuid not null references public.comercios(id) on delete cascade,
  tracking_token_hash text not null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint order_short_links_code_format check (code ~ '^[A-Za-z0-9_-]{10}$'),
  constraint order_short_links_tracking_hash_format check (tracking_token_hash ~ '^[a-f0-9]{64}$'),
  constraint order_short_links_pedido_uidx unique (pedido_id)
);

create index if not exists order_short_links_comercio_created_idx
  on public.order_short_links (comercio_id, created_at desc);

alter table public.order_short_links enable row level security;

comment on table public.order_short_links is
  'Opaque, high-entropy short codes for secure order tracking links. Service role only.';
