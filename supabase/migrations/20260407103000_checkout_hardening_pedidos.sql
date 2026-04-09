do $$
begin
  if not exists (
    select 1
    from pg_type
    where typname = 'pedido_estado'
  ) then
    create type public.pedido_estado as enum (
      'pendiente',
      'confirmado',
      'preparando',
      'en_camino',
      'entregado'
    );
  end if;
end
$$;

alter table public.pedidos
  add column if not exists nombre_cliente text,
  add column if not exists telefono_cliente text,
  add column if not exists costo_delivery numeric(10,2) not null default 0,
  add column if not exists estado_v2 public.pedido_estado not null default 'pendiente';

update public.pedidos
set
  nombre_cliente = coalesce(nombre_cliente, trim(detalles->>'nombre_cliente')),
  telefono_cliente = coalesce(telefono_cliente, trim(detalles->>'telefono_cliente')),
  costo_delivery = coalesce(costo_delivery, 0),
  estado_v2 = case lower(coalesce(estado::text, 'pendiente'))
    when 'pendiente' then 'pendiente'::public.pedido_estado
    when 'confirmado' then 'confirmado'::public.pedido_estado
    when 'preparando' then 'preparando'::public.pedido_estado
    when 'en_camino' then 'en_camino'::public.pedido_estado
    when 'entregado' then 'entregado'::public.pedido_estado
    else 'pendiente'::public.pedido_estado
  end;

alter table public.pedidos
  drop column if exists estado;

alter table public.pedidos
  rename column estado_v2 to estado;

comment on column public.pedidos.nombre_cliente is
  'Nombre completo del cliente en checkout.';

comment on column public.pedidos.telefono_cliente is
  'Telefono WhatsApp del cliente en checkout.';

comment on column public.pedidos.costo_delivery is
  'Costo de envio aplicado al pedido.';

comment on column public.pedidos.estado is
  'Estado operacional del pedido para tracking del cliente.';
