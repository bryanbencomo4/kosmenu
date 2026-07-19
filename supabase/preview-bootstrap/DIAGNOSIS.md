# Diagnóstico — bootstrap Preview

## Verificación previa

| Check | Resultado |
|---|---|
| Branch | `security/phase-2a-preview` |
| Commit includes `86d92bd` | YES |
| Allowed Preview ref | `gsfxqzvmyzjjgpigrste` |
| Forbidden prod ref | `qqhberaayhohxlbbhdyi` |
| Linked CLI project (read-only inspect) | `qqhberaayhohxlbbhdyi` |
| `.env.preview.*` gitignored | YES |

## Matriz migraciones históricas → objetos requeridos

| Objeto requerido | Existe en migraciones | Completo | Acción requerida |
|---|---:|---:|---|
| Extensiones (pgcrypto) | Parcial | No | Crear en `01` |
| Enums `pedido_estado`, FX | Sí (alter) | Parcial | Crear en `01` |
| `comercios` | Solo ALTER | **No** | CREATE en `01` (shape desde metadata RO) |
| `categorias` / `productos` / `catalogos` | No CREATE | **No** | CREATE en `01` |
| `metodos_pago` | No CREATE | **No** | CREATE en `01` |
| `pedidos` | Solo ALTER | **No** | CREATE en `01` + tracking cols |
| `is_comercio_owner*` | Referenciadas | **No CREATE** | CREATE en `02` |
| Delivery tables/RPCs | Sí | Sí (si core existe) | Adaptar endurecido en `01`/`02` |
| Admin / newsletter | Sí | Sí | CREATE en `01`/`02` |
| `global_market_rates` | Sí | Sí | CREATE en `01` |
| Idempotency / tracking / views | `20260718*` | Sí | `03` |
| RLS seguro final | `20260718*` sanitize | Sí | `04` directo (sin policies vulnerables) |
| Bucket `comprobantes` | `20260718*` | Sí | `05` |

**Veredicto:** migraciones solas **no** bastan. Se usó inspección RO de columnas en prod para reconstruir schema; **no** se copiaron policies/grants/datos.

## Diferencias vs producción (intencionales)

| Tema | Producción (hoy) | Preview bootstrap |
|---|---|---|
| Policies pedidos públicas | Existen (P0) | **Ausentes de nacimiento** |
| Anon INSERT pedidos | Sí (legacy) | **No** |
| Anon SELECT comercios base | Sí (expone columnas) | **No** — views públicas |
| Bucket comprobantes | Ausente | Privado creado |
| Tracking hash / idempotency | Ausentes | Presentes |
| Datos | Reales | Solo seed sintético |

## No aplicado remotamente aún

Esperando aprobación explícita del manifiesto (sección 10 del brief) antes de ejecutar SQL en `gsfxqzvmyzjjgpigrste`.
