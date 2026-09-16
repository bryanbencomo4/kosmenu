-- Platform-wide sequential public order codes: EMXFA-000001, EMXFA-000002, ...

create sequence if not exists public.order_display_number_seq
  as bigint
  start with 1
  increment 1
  no maxvalue
  cache 1;

create or replace function public.next_order_display_number()
returns bigint
language sql
security definer
set search_path = public
as $$
  select nextval('public.order_display_number_seq');
$$;

revoke all on function public.next_order_display_number() from public;
revoke all on function public.next_order_display_number() from anon;
revoke all on function public.next_order_display_number() from authenticated;
grant execute on function public.next_order_display_number() to service_role;
