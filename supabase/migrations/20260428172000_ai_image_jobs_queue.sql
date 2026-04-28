alter table public.productos
add column if not exists imagen_source_type text not null default 'manual',
add column if not exists ai_image_status text not null default 'none',
add column if not exists ai_image_error_message text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'productos_imagen_source_type_check'
  ) then
    alter table public.productos
    add constraint productos_imagen_source_type_check
    check (imagen_source_type in ('manual', 'ai_generated'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'productos_ai_image_status_check'
  ) then
    alter table public.productos
    add constraint productos_ai_image_status_check
    check (ai_image_status in ('none', 'pending', 'processing', 'completed', 'failed'));
  end if;
end;
$$;

create table if not exists public.ai_image_jobs (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null,
  commerce_id uuid not null references public.comercios(id) on delete cascade,
  catalog_id uuid references public.catalogos(id) on delete set null,
  product_id uuid not null references public.productos(id) on delete cascade,
  prompt text not null,
  status text not null default 'pending' check (status in ('pending', 'processing', 'completed', 'failed')),
  provider text not null default 'google',
  model text,
  credits_charged numeric not null default 1,
  image_url text,
  error_message text,
  started_at timestamp,
  completed_at timestamp,
  created_at timestamp not null default now(),
  updated_at timestamp not null default now()
);

create index if not exists ai_image_jobs_commerce_status_idx
on public.ai_image_jobs (commerce_id, status, created_at);

create index if not exists ai_image_jobs_product_idx
on public.ai_image_jobs (product_id, created_at desc);

create unique index if not exists ai_image_jobs_active_product_idx
on public.ai_image_jobs (product_id)
where status in ('pending', 'processing');

create or replace function public.trg_touch_ai_image_jobs_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_touch_ai_image_jobs_updated_at on public.ai_image_jobs;

create trigger trg_touch_ai_image_jobs_updated_at
before update on public.ai_image_jobs
for each row execute function public.trg_touch_ai_image_jobs_updated_at();

alter table public.ai_image_jobs enable row level security;

drop policy if exists ai_image_jobs_service_role_all on public.ai_image_jobs;

create policy ai_image_jobs_service_role_all
on public.ai_image_jobs
for all
to service_role
using (true)
with check (true);