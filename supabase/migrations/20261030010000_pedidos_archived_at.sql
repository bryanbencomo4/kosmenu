-- Soft-archive orders so merchants can hide them from finance without deleting history.
alter table public.pedidos
  add column if not exists archived_at timestamptz null;

comment on column public.pedidos.archived_at is
  'When set, the order is archived: hidden from default lists and excluded from finance totals.';

create index if not exists pedidos_comercio_active_created_at_idx
  on public.pedidos (comercio_id, created_at desc)
  where archived_at is null;

create index if not exists pedidos_comercio_archived_created_at_idx
  on public.pedidos (comercio_id, created_at desc)
  where archived_at is not null;
