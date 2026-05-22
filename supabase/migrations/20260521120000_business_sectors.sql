create table if not exists public.sectores_negocio (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sectores_negocio_nombre_not_empty
    check (length(btrim(nombre)) > 0)
);

create unique index if not exists idx_sectores_negocio_nombre_normalized
  on public.sectores_negocio (lower(btrim(nombre)));

create index if not exists idx_sectores_negocio_active_sort
  on public.sectores_negocio (is_active, sort_order, nombre);

create or replace function public.set_sectores_negocio_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_sectores_negocio_updated_at on public.sectores_negocio;
create trigger trg_sectores_negocio_updated_at
before update on public.sectores_negocio
for each row execute function public.set_sectores_negocio_updated_at();

insert into public.sectores_negocio (nombre, sort_order)
select nombre, row_number() over (order by nombre)
from (
  values
    ('Abastos y minimarket'),
    ('Abogado'),
    ('Academia de idiomas'),
    ('Agencia de marketing'),
    ('Agencia de viajes'),
    ('Agricola'),
    ('Arquitectura'),
    ('Arte y diseno'),
    ('Asesoria contable'),
    ('Autolavado'),
    ('Automotriz'),
    ('Bar'),
    ('Barberia'),
    ('Belleza'),
    ('Bienes raices'),
    ('Boutique'),
    ('Cafe'),
    ('Carniceria'),
    ('Centro educativo'),
    ('Cerrajeria'),
    ('Clinica'),
    ('Cocteleria'),
    ('Comida rapida'),
    ('Consultoria'),
    ('Construccion'),
    ('Cuidado personal'),
    ('Delivery y logistica'),
    ('Deportes'),
    ('Discoteca'),
    ('Diseno grafico'),
    ('E-commerce'),
    ('Electricidad'),
    ('Eventos'),
    ('Farmacia'),
    ('Ferreteria'),
    ('Finanzas'),
    ('Floristeria'),
    ('Fotografia'),
    ('Gimnasio'),
    ('Heladeria'),
    ('Hospedaje'),
    ('Imprenta'),
    ('Informatica y tecnologia'),
    ('Joyeria'),
    ('Laboratorio'),
    ('Lavanderia'),
    ('Licoreria'),
    ('Libreria'),
    ('Mecanica'),
    ('Medicina'),
    ('Moda'),
    ('Muebles y decoracion'),
    ('Panaderia'),
    ('Papeleria'),
    ('Peluqueria'),
    ('Pizzeria'),
    ('Pollera'),
    ('Reparaciones'),
    ('Reposteria'),
    ('Restaurante'),
    ('Salud'),
    ('Servicios legales'),
    ('Spa'),
    ('Supermercado'),
    ('Taller de motos'),
    ('Tienda de mascotas'),
    ('Tienda de ropa'),
    ('Veterinaria'),
    ('Videojuegos'),
    ('Otros')
) as seed(nombre)
where not exists (
  select 1
  from public.sectores_negocio existing
  where lower(btrim(existing.nombre)) = lower(btrim(seed.nombre))
);

alter table public.sectores_negocio enable row level security;

drop policy if exists sectores_negocio_select_active on public.sectores_negocio;
create policy sectores_negocio_select_active
on public.sectores_negocio
for select
to anon, authenticated
using (is_active = true);

grant select on public.sectores_negocio to anon;
grant select on public.sectores_negocio to authenticated;
grant select, insert, update, delete on public.sectores_negocio to service_role;

comment on table public.sectores_negocio is
  'Catalogo de sectores/rubros para el campo comercios.categoria en el onboarding de negocios.';
