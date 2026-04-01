alter table public.comercios
add column if not exists telefonos text;

do $$
declare
  has_telefono boolean;
  has_celular boolean;
  has_whatsapp boolean;
  set_expr text;
begin
  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'comercios'
      and column_name = 'telefono'
  ) into has_telefono;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'comercios'
      and column_name = 'celular'
  ) into has_celular;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'comercios'
      and column_name = 'whatsapp'
  ) into has_whatsapp;

  set_expr := 'nullif(telefonos, '''')';

  if has_telefono then
    set_expr := set_expr || ', nullif(telefono, '''')';
  end if;

  if has_celular then
    set_expr := set_expr || ', nullif(celular, '''')';
  end if;

  if has_whatsapp then
    set_expr := set_expr || ', nullif(whatsapp, '''')';
  end if;

  execute format(
    'update public.comercios set telefonos = coalesce(%s) where coalesce(telefonos, '''') = '''';',
    set_expr
  );
end $$;

comment on column public.comercios.telefonos is
  'Compatibilidad legacy: alias historico para telefono/celular/whatsapp.';