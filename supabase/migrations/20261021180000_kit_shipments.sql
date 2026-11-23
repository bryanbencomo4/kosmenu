-- Kit Portamenú shipments (gift + extras) with Zoom delivery address.
-- Product payment for extras is manual (Pago Móvil); freight is COD at Zoom.

create table if not exists public.kit_shipments (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  gift_qty integer not null default 4 check (gift_qty >= 0 and gift_qty <= 20),
  extras_qty integer not null default 0 check (extras_qty >= 0 and extras_qty <= 100),
  extras_unit_price_usd numeric(10, 2) not null default 2.50
    check (extras_unit_price_usd >= 0),
  product_total_usd numeric(12, 2) not null default 0
    check (product_total_usd >= 0),

  recipient_name text not null,
  phone text not null,
  email text not null,
  ci text not null,

  estado text not null,
  ciudad text not null,
  zoom_office text not null,

  business_id uuid references public.comercios (id) on delete set null,
  business_slug text,

  payment_reference text,
  receipt_path text,
  declared_amount numeric(14, 2)
    check (declared_amount is null or declared_amount >= 0),
  declared_currency text,

  status text not null default 'pending_ship'
    check (status in (
      'pending_payment',
      'pending_ship',
      'shipped',
      'cancelled'
    )),

  admin_note text,
  zoom_tracking text,
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz
);

create index if not exists kit_shipments_status_idx
  on public.kit_shipments (status, created_at desc);

create index if not exists kit_shipments_email_idx
  on public.kit_shipments (lower(email), created_at desc);

create index if not exists kit_shipments_business_idx
  on public.kit_shipments (business_id, created_at desc)
  where business_id is not null;

comment on table public.kit_shipments is
  'Public Kit Portamenú orders: gift units + paid extras, Zoom destination. Freight paid by customer at Zoom.';

alter table public.kit_shipments enable row level security;

-- No anon/authenticated client access; Next.js APIs use the service role.

drop trigger if exists kit_shipments_set_updated_at on public.kit_shipments;
create trigger kit_shipments_set_updated_at
  before update on public.kit_shipments
  for each row
  execute function public.set_updated_at();

-- Private bucket for kit payment receipts (service-role uploads only).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'comprobantes-kit',
  'comprobantes-kit',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists comprobantes_kit_admin_select on storage.objects;
create policy comprobantes_kit_admin_select
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'comprobantes-kit'
    and public.admin_can_review_payments()
  );
