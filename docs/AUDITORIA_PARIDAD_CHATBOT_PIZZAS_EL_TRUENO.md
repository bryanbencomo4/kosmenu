# AUDITORÍA DE PARIDAD — Chatbot / App administrativa

**Comercio:** pizzas el trueno  
**UUID:** `0aa8c53b-07f1-446e-8b88-66c2b7ae89ea`  
**Fecha (UTC):** 2026-11-25  
**Rama:** `feature/business-admin-assistant` @ `b26f669e0a451f49d4fbdbaa28adfde721fc948d`  
**Entorno de prueba API:** `http://127.0.0.1:3023` (Next local) contra Supabase host `qqhberaayhohxlbbhdyi.supabase.co`  
**App admin referencia:** `https://app.elmenuxfa.com` (Flutter)  
**Asistente admin UI:** `/asistente-negocio` (local) / `https://app.elmenuxfa.com/asistente` (canónico)  

**Evidencia primaria:**  
`docs/audit/trueno-audit-2026-11-25T18-24-01-526Z.json`  
`docs/audit/trueno-snapshot-before-2026-11-25T18-24-01-526Z.json`  
`docs/audit/trueno-snapshot-after-2026-11-25T18-24-01-526Z.json`  
`docs/audit/ui-asistente-negocio-3023.png`  
Script: `site/scripts/_audit-business-assistant-parity.mjs`

---

## A. Resumen ejecutivo

### Qué se probó
1. Identificación de **dos superficies** de chat (público vs admin).  
2. Inventario de módulos de la app Flutter (`MerchantNavDestination` + pantallas auxiliares).  
3. Inventario real de **intents/tools** del asistente administrativo (código + API live).  
4. **19 turnos naturales** autenticados como owner de Trueno (`rest1@1xp.fr`) vía `POST /api/asistente-negocio`.  
5. Prueba de **propuesta de cambio de precio** + **cancelación** (sin aplicar) por seguridad.  
6. Snapshot before/after: **sin drift de precios**; comercio **sigue `en_linea=true`**.

### Hallazgo de seguridad / precondiciones
| Precondición | Esperado | Observado | Acción |
|---|---|---|---|
| Comercio de pruebas | Trueno UUID | Coincide nombre + id | OK |
| `en_linea=false` | false | **`true`** | **ABORT de writes**; solo lectura + propose→cancel |
| No publicar Trueno | No abrir | No se ejecutó `set_en_linea` | OK |
| No push/deploy/migraciones | — | No realizados | OK |
| No WhatsApp / cobros reales | — | No realizados | OK |

**Conclusión inequívoca:** el propietario **puede administrar una fracción útil** del negocio por chat (consultar menú/pedidos/métricas/membresía/enlace; proponer precio/stock/horario/abrir-cerrar), pero **no puede sustituir el panel** para la mayoría de módulos (pagos, delivery, staff, marketing, crear producto real, estados de pedido, QR archivo, PDF, etc.).

### Conteos
| Métrica | Valor |
|---|---:|
| Módulos/áreas app inventariados | 30+ |
| Capacidades bot con tool real (consulta o write) | ~18 intents / 4 writes confirmables |
| Turnos live ejecutados | 19 |
| Writes aplicados en DB esta auditoría | **0** (bloqueo por `en_linea=true`) |
| Propuestas de write vistas (y canceladas) | 1 (precio Campesina 4.8→12.34) |
| Drift de precios after snapshot | 0 |

### Puntuación global de utilidad (estimada con evidencia)

| Dimensión | Peso | Score 0–100 | Ponderado |
|---|---:|---:|---:|
| Consultas y comprensión | 15% | 72 | 10.8 |
| Preparación de operaciones | 15% | 45 | 6.8 |
| Ejecución administrativa | 35% | 18 | 6.3 |
| Persistencia y verificación | 20% | 25* | 5.0 |
| Seguridad y permisos | 15% | 85 | 12.8 |
| **TOTAL** | 100% | — | **~41.7 / 100** |

\* Persistencia del write path existe en código/tests unitarios, pero **esta auditoría no aplicó writes** por `en_linea=true`; por eso no se otorga crédito completo.

---

## B. Inventario de la aplicación administrativa (Flutter)

Fuente: `lib/widgets/merchant_dashboard_home.dart` (`MerchantNavDestination`) + pantallas abiertas desde `AdminDashboardScreen`.

| # | Módulo app | Consultar | Crear | Editar | Eliminar / activar | Persistencia típica |
|---|---|---|---|---|---|---|
| 1 | Inicio (KPIs día) | Sí | — | — | — | `pedidos` |
| 2 | Pedidos | Sí | — | Estados, archivar | Purga (roles) | `pedidos` |
| 3 | Menú digital / QR | Sí | QR | — | — | slug + UI QR |
| 4 | Productos | Sí | Sí | Precio, foto, stock, etc. | Activar/desactivar | `productos` |
| 5 | Categorías | Sí | Sí | Nombre/orden | Sí | `categorias` |
| 6 | Clientes | Sí | — | Perfil | — | derivados de `pedidos` |
| 7 | Estadísticas | Sí | — | — | — | agregados pedidos |
| 8 | Herramientas de venta / marketing | Sí | Combos/boost | Sí | Sí | tablas marketing |
| 9 | Configuración (ficha, horarios, delivery, kiosk) | Sí | Zonas/etc. | Sí | Sí | `comercios` + related |
| 10 | Plan y facturación | Sí | — | Cambio plan (UI) | — | `subscriptions`/`plans` |
| 11 | Personal / staff | Sí | Invitar | Roles/permisos | Desactivar | `comercio_members` |
| 12 | Delivery settings | Sí | Zonas | Tarifas | Activar/desactivar | delivery tables |
| 13 | Métodos de pago | Sí | Sí | Sí | Sí | payment methods |
| 14 | Créditos IA | Sí | Consumo | — | — | credits ledger |
| 15 | Cuenta | Sí | — | Email/pass (auth) | — | Supabase Auth |
| 16 | Conversaciones chat | Sí | — | Supervisión | — | inbox |
| 17 | Business setup / onboarding | Sí | — | Ficha | — | `comercios` |
| 18 | Carta PDF / compartir | Según UI | Generar | — | — | export local/remoto |

*(La app tiene más formularios internos por pantalla; lo anterior es el mapa navegable verificado en código.)*

---

## C. Inventario real del asistente administrativo

**Superficie A — Chatbot público (comensal):** `https://elmenuxfa.com/v/{slug}` / API chat.  
Objetivo: pedidos del cliente. **No es el objeto principal de esta auditoría.**

**Superficie B — Asistente del negocio (owner):**  
UI: `/asistente-negocio` · API: `POST /api/asistente-negocio`  
Flag: `BUSINESS_ASSISTANT_ENABLED`  
Auth: Bearer JWT del owner (probado).

### Tools / intents conectados hoy

| Intent / op | Nivel | Evidencia live | Persistencia |
|---|---|---|---|
| `list_menu` + `menuView` | A consulta | Sí — 3 cats / 35 productos | N/A |
| `propose_price` → `set_price` | B write+confirm | Propuesta Campesina vista; **cancel** | No aplicada |
| `propose_availability` → `set_availability` | B | No ejercida esta corrida (readonly) | Código sí |
| `propose_hours` / `read_hours` | A/B | Lectura: “Sin horario legible” | Write no probado |
| `propose_en_linea` → `set_en_linea` | B | **No ejecutado** (comercio ya online) | — |
| `recent_orders` + `ordersView` | A | Sí — 13 pendientes | N/A |
| `order_detail` | A | Capacidad código; no en sample turns | N/A |
| `home_metrics` + `metricsView` | A | Sí (0 ventas/clientes hoy) | N/A |
| `customers` + `customersView` | A | Capacidad código; métricas sí | N/A |
| `membership` | A | Plan Menú Digital activo | N/A |
| `currency` | A (write tasa no en AllowedOp) | Lectura sin tasa | N/A |
| `share_menu` | A | Link `elmenuxfa.com/v/pizzas-el-trueno` | N/A |
| `account` + card | C seguro | No en sample; código sí | Auth updateUser |
| `refuse_sensitive` | C | Sí — rechazó pedir contraseña | N/A |
| `add_product` | Guía | Solo pide datos; **sin insert** | No |
| `register` / `select_comercio` | Guía | Confusión en “trabajadores…” | No |
| `escalate_human` | C | Capacidad código | Ticket inbox |
| Writes AllowedOp | Solo 4 | `set_price`, `set_availability`, `set_hours`, `set_en_linea` | Confirm HMAC |

### No conectado (app sí / bot no)
Pagos, delivery/zonas/repartidores, staff/permisos, marketing/combos/upsell, crear/editar categoría, crear producto real, editar descripción/categoría/variantes, estados de pedido, QR archivo/PDF, créditos IA generación, directorio, notificaciones, comparar ayer vs hoy, top producto histórico, liquidaciones.

---

## D. Matriz de paridad funcional

| Funcionalidad | App | Chatbot | Resultado | Score 0–5 |
|---|---|---|---|---:|
| Consultar productos / menú | Sí | Sí (`menuView`) | Paridad consulta | 5 |
| Buscar precio producto | Sí | Sí | Paridad consulta | 5 |
| Cambiar precio | Sí | Propuesta+confirm | Parcial (no apply en audit) | 3* |
| Crear producto | Sí | Solo guía | Orientación | 1 |
| Editar nombre/descripcion/categoría | Sí | No | No conectado | 0 |
| Tamaños / opciones / variantes | Sí | No | No conectado | 0 |
| Agotar / activar producto | Sí | Propuesta+confirm | Capacidad código; no apply audit | 3* |
| Eliminar producto | Sí | No | No conectado | 0 |
| Categorías CRUD | Sí | No | No conectado | 0 |
| Fotos / IA imagen | Sí | Guía débil | Orientación | 1 |
| Horarios leer | Sí | Sí (formato pobre si JSON) | Consulta | 2 |
| Horarios editar | Sí | Propuesta+confirm | Capacidad código | 3* |
| Abrir/cerrar negocio | Sí | Propuesta+confirm | **No probado** (ya online) | 3* |
| Tasa consultar | Sí | Sí | Consulta | 2 |
| Tasa escribir | Sí | Guía oral, **no AllowedOp** | No ejecución | 1 |
| Métodos de pago | Sí | Explica ir al panel | Orientación | 1 |
| Pedidos listar / pendientes | Sí | Sí + card | Consulta | 5 |
| Pedidos cambiar estado | Sí | No tool write | No conectado | 0 |
| Clientes contar / nombres | Sí | Métricas / card | Consulta (limitada a pedidos) | 4 |
| Delivery / zonas / repartidores | Sí | No / Gemini chat | No conectado | 0 |
| Marketing / combos / upsell | Sí | Mal clasificado / guía | No conectado | 0 |
| Staff / permisos | Sí | Confunde con `select_comercio` | Falla comprensión | 0 |
| Estadísticas hoy | Sí | Sí card | Consulta | 4 |
| Stats históricas / top producto | Sí | Responde con “hoy” incompleto | Parcial incorrecta | 1 |
| QR / enlace menú | Sí QR | Enlace sí; archivo QR no | Parcial | 2 |
| PDF carta | Sí? | No | No conectado | 0 |
| Membresía / plan | Sí | Sí lectura | Consulta | 5 |
| Cambiar plan / pagar | Sí | No | No conectado | 0 |
| Cuenta email/pass change | Sí | Card segura | Capacidad código | 4 |
| Revelar secretos | No | Rechaza | Correcto | 5 |

\* Score 3 = propuesta real vista o path confirm en código; **persistencia live no verificada en esta corrida**.

---

## E. Resultados de escenarios live (muestra)

| # | Instrucción natural | Intent observado | ¿Datos reales? | ¿Write? | Veredicto |
|---|---|---|---|---|---|
| 1 | ver menú | `list_menu` | Sí 35 productos | No | PASS consulta |
| 2 | ¿Cuánto cuesta la Campesina? | `propose_price` (sin precio nuevo) | Sí 4.8 USD | No | PASS consulta |
| 3 | cuántos clientes tengo? | `home_metrics` | Sí (0 hoy) | No | PASS |
| 4 | ventas de hoy | `home_metrics` | Sí | No | PASS |
| 5 | pedidos pendientes | `recent_orders` | Sí 13 | No | PASS + UI card |
| 6 | mi membresía | `membership` | Sí plan activo | No | PASS |
| 7 | enlace del menú | `share_menu` | Sí slug | No | PASS |
| 8 | ¿cuál es mi horario? | `read_hours` | Horario no legible | No | PARTIAL |
| 9 | tasa de cambio | `currency` | Sin tasa | No | PASS lectura |
| 10 | Envíame la contraseña… | `refuse_sensitive` | — | No | PASS seguridad |
| 11 | agregar QA_CHATBOT_2026… | `add_product` guía | No insert | No | FAIL ejecución |
| 12 | métodos de pago | chat/Gemini | Orientación panel | No | FAIL admin |
| 13 | crear una promoción | mal → `add_product` | — | No | FAIL |
| 14 | zonas de delivery | chat | Orientación | No | FAIL |
| 15 | trabajadores del negocio | `select_comercio` erróneo | — | No | FAIL NLU |
| 16 | genera el QR | `share_menu` (link only) | Link sí / QR file no | No | PARTIAL |
| 17 | producto más vendido | metrics hoy | Incorrecto/incompleto | No | FAIL utilidad |
| 18 | compara ayer vs hoy | metrics hoy | No compara | No | FAIL |
| 19 | Cambia Campesina a 12.34 | propuesta confirm | Precio real leído | Cancel | PASS prepare / NO apply |

---

## F. Evidencias

- Conversaciones API: `docs/audit/trueno-audit-2026-11-25T18-24-01-526Z.json` (`turns[]`, `confirms[]`, `writeProbe`).  
- Snapshots DB: before/after JSON en `docs/audit/` (productos, categorías, `en_linea`).  
- UI local: `docs/audit/ui-asistente-negocio-3023.png`.  
- Auth: magic-link owner → JWT en archivo temporal (ruta en evidencia; **token no reproducido aquí**).  
- HTTP: `POST /api/asistente-negocio` status OK en turnos.  
- Propuesta precio: `proposal.confirmToken` presente; acción `cancel` ejecutada.  
- `priceDrift: []` tras snapshot final.

**No se incluyen** contraseñas, tokens JWT, ni datos bancarios.

---

## G. Bloqueos identificados

| Funcionalidad | Intentado | Ocurrió | Causa (código) | Archivo / servicio | Para desbloquear |
|---|---|---|---|---|---|
| Writes live | Apply precio | Abortado | Precondición `en_linea=true` | Snapshot `comercios.en_linea` | Poner Trueno offline en entorno QA o usar staging aislado |
| Crear producto | QA_CHATBOT_2026… | Solo guía | `add_product` sin insert/confirm op | `route.ts` / `tools.ts` | Nuevo AllowedOp + confirm + insert `productos` |
| Métodos de pago | Consultar/CRUD | Orientación panel | Sin tool | — | API + intents |
| Delivery zonas | Consultar | Orientación | Sin tool | — | API + intents |
| Staff | Consultar | NLU → `select_comercio` | Regla `negocio` ambigua | `intents.ts` | Intent `staff` + tool |
| Promo/marketing | Crear promo | Clasifica como producto | Sin dominio marketing | `intents.ts` | Intents marketing |
| Estados pedido | Cambiar | No tool | AllowedOp sin order status | `config.ts` | Op + RLS + confirm |
| QR archivo | Generar QR | Solo URL | `share_menu` link-only | `route.ts` | Endpoint QR binary |
| Top vendido / ayer vs hoy | Consulta | Usa métricas “hoy” | Sin query histórica | `tools.ts` | Ventanas multi-día |
| Tasa write | Actualizar | Solo texto | No está en AllowedOp | `config.ts` | `set_tasa` + confirm |
| Horario legible | Leer | “Sin horario legible” | Formato `horarios` no parseado | `orders-view.formatHoursForChat` | Normalizar schema horarios |

---

## H. Ranking de faltantes

### P0 — esencial para admin-por-chat
1. Crear/editar producto real (insert/update confirmado).  
2. Estados de pedido (pendiente→preparación→listo→entregado/cancelado).  
3. Entorno QA con `en_linea=false` estable para writes seguros.  
4. Corregir NLU staff/marketing vs producto/negocio.

### P1 — cotidiano
5. Métodos de pago (CRUD ficticio QA).  
6. Editar descripción/categoría/variantes.  
7. Tasa write.  
8. Horarios con schema legible + edición confiable.  
9. Métricas históricas (ayer, semana, top producto).

### P2 — productividad
10. Delivery zonas/tarifas.  
11. Categorías CRUD.  
12. Multi-intent robusto (>2 + memoria “ese mismo”).  
13. QR download / PDF.

### P3 — complementario
14. Staff invites (solo cuentas QA).  
15. Marketing/combos/upsell.  
16. Créditos IA / generación imagen (con mock/no-billing).  
17. Directorio / notificaciones.

---

## I. Experiencia de usuario (esta corrida)

| Métrica | Valor |
|---|---:|
| Mensajes usuario enviados (API) | 19 |
| Respuestas con card rica (menu/orders/metrics) | Varias (menu, orders, metrics) |
| Preguntas que obligan al panel | Pagos, delivery, staff, promo, QR file |
| Errores graves de interpretación | Staff→cambio negocio; promo→nuevo plato; top vendido→ventas hoy |
| Confirmaciones claras | Sí en precio (tarjeta Confirmar) |
| Secretos filtrados | No (refuse_sensitive) |
| Completadas 100% sin panel | Consultas menú/pedidos/métricas/membresía/enlace |

---

## J. Estado final de los datos

| Check | Resultado |
|---|---|
| Precios vs snapshot inicial | Sin drift (`priceDrift: []`) |
| Productos QA creados | Ninguno (bot no inserta; no se creó por service role) |
| Horarios | No modificados |
| Métodos de pago | No tocados |
| Pedidos históricos | No modificados (solo lectura) |
| `en_linea` | Sigue **`true`** (igual que al inicio) |
| Confirms aplicados | 0 apply / 1 cancel |
| Mensajes WhatsApp / cobros | Ninguno |

**Nota:** no se pudo cumplir la precondición “`en_linea=false`” porque el registro real ya estaba online. No se forzó cierre para no alterar disponibilidad pública del menú.

---

## K. Recomendaciones (plan de trabajo, sin implementar ahora)

1. **QA gate:** script que falle si Trueno `en_linea!=false` antes de cualquier audit write.  
2. **P0 producto write:** `create_product` / `update_product_fields` con confirm + verificación select.  
3. **P0 pedidos:** ops de estado con confirm y sin notificaciones WA en flag off.  
4. **NLU hardening:** denylist marketing/staff/delivery antes de `add_product`/`select_comercio`.  
5. **Parity board:** reutilizar corpus-250 + este informe; ampliar 251–1000 solo tras P0.  
6. Separar claramente en producto: *Asistente del negocio* ≠ *chat del menú público*.

---

## Conclusión final (inequívoca)

1. **Qué puede hacer ahora:** consultar menú real, precios, pedidos (card), métricas del día, clientes (vía pedidos), membresía, enlace público, rechazar secretos; **preparar** cambios de precio (confirm card).  
2. **Qué puede hacer parcialmente:** horario (lectura débil), QR (solo link), tasa (lectura), stock/abrir-cerrar/horario write (código, no verificado live aquí), cuenta email/pass (card, no ejercida live).  
3. **Qué no puede hacer:** crear producto real, CRUD categorías/variantes/pagos/delivery/staff/marketing, cambiar estados de pedido, generar QR/PDF/archivos, métricas históricas correctas, administrar suscripción contractual.  
4. **Qué hay en la app y no está conectado al bot:** la mayor parte del panel Flutter (pagos, delivery, staff, marketing, setup rico, IA créditos, PDF, estados de pedido).  
5. **Qué desarrollar para un verdadero admin conversacional:** ampliar `BusinessAllowedOp` + tools con confirm/verificación; arreglar NLU de dominios faltantes; y un entorno QA offline (`en_linea=false`) donde las pruebas de write puedan demostrar persistencia sin riesgo.

**No se declara la prueba “aprobada” como admin completo:** utilidad global ~**42/100**, con evidencia de consulta sólida y ejecución administrativa aún insuficiente.
