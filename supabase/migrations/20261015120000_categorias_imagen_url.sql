-- Optional cover image for menu categories (overrides first-product cover).
alter table public.categorias
  add column if not exists imagen_url text;

comment on column public.categorias.imagen_url is
  'Public cover image for the category. When null, the menu uses the first product image.';
