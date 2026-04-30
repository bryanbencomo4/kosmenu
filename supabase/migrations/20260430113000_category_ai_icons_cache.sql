create table if not exists public.category_ai_icons (
  id uuid primary key default gen_random_uuid(),
  comercio_id uuid references public.comercios(id) on delete cascade,
  icon_key text not null,
  image_url text not null,
  prompt_used text not null,
  model text not null,
  style_version text not null,
  created_at timestamp not null default now()
);

create unique index if not exists category_ai_icons_commerce_unique_idx
on public.category_ai_icons (comercio_id, icon_key, style_version)
where comercio_id is not null;

create unique index if not exists category_ai_icons_global_unique_idx
on public.category_ai_icons (icon_key, style_version)
where comercio_id is null;

create index if not exists category_ai_icons_commerce_lookup_idx
on public.category_ai_icons (comercio_id, icon_key, style_version, created_at desc);

create index if not exists category_ai_icons_global_lookup_idx
on public.category_ai_icons (icon_key, style_version, created_at desc)
where comercio_id is null;

alter table public.category_ai_icons enable row level security;

drop policy if exists category_ai_icons_service_role_all on public.category_ai_icons;

create policy category_ai_icons_service_role_all
on public.category_ai_icons
for all
to service_role
using (true)
with check (true);

insert into storage.buckets (id, name, public)
select 'category-icons', 'category-icons', true
where not exists (
  select 1 from storage.buckets where id = 'category-icons'
);
