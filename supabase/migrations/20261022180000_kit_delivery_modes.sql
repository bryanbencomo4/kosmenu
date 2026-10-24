-- Flexible kit delivery: Zoom, support WhatsApp, or manual details.

alter table public.kit_shipments
  add column if not exists delivery_mode text not null default 'zoom'
    check (delivery_mode in ('zoom', 'support', 'manual'));

alter table public.kit_shipments
  add column if not exists delivery_notes text;

comment on column public.kit_shipments.delivery_mode is
  'zoom = Zoom Venezuela office; support = arrange via elmenuxfa WhatsApp; manual = free-form address';
