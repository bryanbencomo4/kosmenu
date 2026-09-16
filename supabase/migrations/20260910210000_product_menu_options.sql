alter table public.productos
  add column if not exists opciones_menu jsonb;

alter table public.categorias
  add column if not exists opciones_menu jsonb;

comment on column public.productos.opciones_menu is
  'Variantes del producto: tamanos (N/G) y ajustes opcionales.';

comment on column public.categorias.opciones_menu is
  'Opciones a nivel categoria, p.ej. servicio adicional con precio por tamano.';
