drop index if exists public.pedidos_comercio_archived_created_at_idx;
drop index if exists public.pedidos_comercio_active_created_at_idx;

alter table public.pedidos
  drop column if exists archived_at;
