# Revisión — `log_delivery_invitation_event`

## Estado previo (producción / migraciones antiguas)

| Aspecto | Hallazgo |
|---|---|
| `SECURITY DEFINER` | Sí |
| `search_path` | `public` (fijo) |
| Autorización interna | **Ninguna** — insertaba cualquier evento |
| `EXECUTE` | Tras 2A.2 local: `authenticated` + `service_role` (anon revocado) |
| SQL dinámico | No |
| Efectos laterales | Solo insert en `delivery_invitation_events` |

## Riesgos

- Cliente `authenticated` podía registrar eventos para invitaciones ajenas.
- Tipos de evento no validados.
- No verificaba que `pedido_id` / `order_id` correspondieran a la invitación.

## Remediación local (`20260718194100_harden_log_delivery_invitation_event.sql`)

1. Valida invitación existente y match de pedido/order/comercio.
2. Allow-list de `event_type`.
3. Si `auth.uid()` presente → debe ser owner del comercio.
4. `REVOKE EXECUTE` de `anon` y `authenticated`.
5. `GRANT EXECUTE` solo a `service_role`.
6. Llamadas anidadas desde otras funciones `SECURITY DEFINER` (create/revoke) siguen funcionando; con JWT de owner, el check de ownership aplica.

## Callers

- SQL: `create_delivery_invitation`, `revoke_delivery_invitation` (definer).
- Next (service role): `api/orders/[orderId]`, `api/delivery/invite/[token]`.
- Flutter: **no** llama RPC directo.
