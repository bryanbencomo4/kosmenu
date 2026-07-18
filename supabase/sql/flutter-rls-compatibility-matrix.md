# Matriz Flutter ↔ RLS propuesto (estática, 2A.3)

Leyenda **Compatible**: funciona con políticas post-`sanitize_rls` (sin SELECT/UPDATE/INSERT público en `pedidos`; catálogo anon solo SELECT; storage comprobantes privado).

| Archivo | Tabla/API | Operación | Rol | Política requerida | Compatible |
|---|---|---|---|---|---|
| `public_menu_view.dart` | `GET /api/menu` | READ menú | N/A (HTTPS) | service_role servidor | **Sí** |
| `public_menu_view.dart` | `POST /api/orders` | CREATE pedido | N/A (HTTPS) | service_role servidor | **Sí** |
| `public_menu_view.dart` | `POST /api/orders/comprobantes` | UPLOAD | N/A (HTTPS) | service_role + bucket privado | **Sí** |
| `public_menu_view.dart` | ~~`pedidos` insert().select()~~ | — | — | eliminado | N/A |
| `order_detail_screen.dart` | `pedidos` | SELECT | authenticated | owner via `comercios.owner_id` | **Sí** |
| `order_detail_screen.dart` | `pedidos` | UPDATE estado | authenticated | owner UPDATE | **Sí** |
| `order_detail_screen.dart` | `GET .../comprobante` | SIGNED URL | authenticated Bearer | owner check en API | **Sí** |
| `admin_dashboard_screen.dart` | `pedidos` | SELECT | authenticated | owner SELECT | **Sí** |
| `order_gate_handler.dart` | `pedidos` | SELECT | authenticated | owner SELECT | **Sí** |
| `business_setup_screen.dart` | `comercios` | INSERT/UPDATE/SELECT | authenticated | `owner_id = auth.uid()` | **Sí** |
| `business_setup_screen.dart` | `metodos_pago` | DELETE+INSERT | authenticated | owner del comercio | **Sí** |
| `category_screen.dart` | `categorias` / `catalogos` | CRUD | authenticated | owner | **Sí** |
| `product_screen.dart` / `product_form_screen.dart` | `productos` | CRUD + storage público productos | authenticated | owner + bucket productos (no comprobantes) | **Sí*** |
| `delivery_courier_service.dart` | RPC couriers | EXECUTE | authenticated | grants authenticated + ownership en FN | **Sí** |
| delivery invites | RPC create/revoke | EXECUTE | authenticated | grants + ownership en FN | **Sí** |
| `storage_service` / logos / productos | `storage.objects` `getPublicUrl` | READ público | anon | bucket **productos/logos** público | **Sí*** |
| comprobantes | ~~`getPublicUrl`~~ | — | — | no usar; signed URL API | **Sí** |

\* Product image `getPublicUrl` sigue en buckets públicos de media — fuera del cierre de `comprobantes`. No marcar como compatible con políticas legacy de `pedidos`.

## No compatible con legacy (y ya no usado en checkout)

| Patrón | Motivo |
|---|---|
| Anon `pedidos` SELECT/UPDATE | Eliminado en RLS propuesto |
| Anon `pedidos` INSERT + `.select()` | Requiere SELECT RETURNING; migrado a API |
| Public SELECT `*` en `comercios` | Expone `owner_id`; migrado a DTO/API |
