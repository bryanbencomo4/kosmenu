alter table public.comercios
  add column if not exists negocio_virtual boolean not null default false,
  add column if not exists mostrar_en_directorio_publico boolean not null default true;

comment on column public.comercios.negocio_virtual is
  'Indica si el negocio opera sin ubicacion fisica publica (solo digital).';

comment on column public.comercios.mostrar_en_directorio_publico is
  'Controla si el negocio puede aparecer en el directorio publico de elmenuxfa.com.';

create index if not exists idx_comercios_public_directory_listing
  on public.comercios (mostrar_en_directorio_publico, en_linea, updated_at desc);
