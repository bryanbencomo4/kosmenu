# Auditoría de columnas — `public.metodos_pago`

| Columna | Comensal | Propietario (CRUD Flutter) | Notas |
|---|---|---|---|
| `id` | Sí | Sí | Identificador |
| `comercio_id` | Sí (filtro) | Sí | Relación |
| `nombre` | Sí | Sí | Etiqueta visible |
| `tipo` | Sí | Sí | Incluye moneda embebida (`__usd`) |
| `descripcion` | Sí | Sí | Texto corto |
| `detalles` | Sí (tras elegir método) | Sí | Puede incluir datos de cuenta; web ya los muestra al seleccionar |
| `notas` / `notas_internas` | No | Si existiera | Privado |
| `owner_id` | No | N/A | No usar |
| `verificado` / `metadata` / admin | No | Si existiera | Privado |

## Solución

DTO público en `/api/menu` via `toPublicMetodosPagoDto` — allow-list: `id, comercio_id, nombre, tipo, descripcion, detalles`.

CRUD owner en Flutter permanece sobre la tabla real con políticas owner (fase restrictiva).
