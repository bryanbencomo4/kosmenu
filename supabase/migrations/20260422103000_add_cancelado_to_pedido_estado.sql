do $$
begin
  if exists (
    select 1
    from pg_type
    where typname = 'pedido_estado'
  ) and not exists (
    select 1
    from pg_enum
    where enumtypid = 'public.pedido_estado'::regtype
      and enumlabel = 'cancelado'
  ) then
    alter type public.pedido_estado add value 'cancelado';
  end if;
end
$$;
