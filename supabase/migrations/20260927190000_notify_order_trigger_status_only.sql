drop trigger if exists enviar_notificacion_pedido on public.pedidos;

create trigger enviar_notificacion_pedido
after update of estado on public.pedidos
for each row execute function public.notify_order_webhook_trigger();