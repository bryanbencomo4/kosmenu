alter table public.comercios
add column if not exists en_linea boolean not null default true;

comment on column public.comercios.en_linea is
  'Indica si el comercio esta visible/en linea en el menu publico.';