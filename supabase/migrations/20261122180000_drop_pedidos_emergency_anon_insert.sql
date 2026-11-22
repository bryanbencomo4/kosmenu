-- Drop insecure emergency INSERT on public.pedidos.
-- Authorized for controlled chatbot pilot deploy (2026-11-22).
-- Traditional checkout uses service_role via POST /api/orders (RLS bypass).

begin;

drop policy if exists pedidos_emergency_anon_insert on public.pedidos;

revoke insert on table public.pedidos from anon;
revoke insert on table public.pedidos from authenticated;

grant all on table public.pedidos to service_role;

commit;
