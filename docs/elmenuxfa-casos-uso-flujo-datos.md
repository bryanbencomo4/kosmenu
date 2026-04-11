# elmenuxfa.com - Casos de Uso y Flujo de Datos

## 1) Alcance y fuentes

Este documento modela el comportamiento funcional actual de elmenuxfa.com con foco en:

- Pantalla pública de menú y checkout
- Pantalla de tracking de pedido
- Rutas API de menú y pedidos
- Migración de schema relevante para pedidos

Fuentes analizadas:

- [site/app/v/[id]/page.tsx](site/app/v/[id]/page.tsx)
- [site/app/orders/[orderId]/page.tsx](site/app/orders/[orderId]/page.tsx)
- [site/app/api/menu/[comercioId]/route.ts](site/app/api/menu/[comercioId]/route.ts)
- [site/app/api/orders/route.ts](site/app/api/orders/route.ts)
- [site/app/api/orders/[orderId]/route.ts](site/app/api/orders/[orderId]/route.ts)
- [site/app/api/send-order/route.ts](site/app/api/send-order/route.ts)
- [site/app/api/_lib/order-utils.ts](site/app/api/_lib/order-utils.ts)
- [supabase/migrations/20260407103000_checkout_hardening_pedidos.sql](supabase/migrations/20260407103000_checkout_hardening_pedidos.sql)

---

## 2) Mapa de Casos de Uso

## Pequeños (acciones atómicas)

| ID | Caso de uso | Actor | Trigger | Resultado |
|---|---|---|---|---|
| UC-01 | Cargar menú por slug/id | Cliente | Abrir v/[id] | Carga comercio, categorías, productos y métodos de pago |
| UC-02 | Buscar productos | Cliente | Input de búsqueda | Filtra categorías/productos visibles |
| UC-03 | Cambiar moneda global | Cliente | Selector Moneda global | Recalcula importes visuales en moneda seleccionada |
| UC-04 | Agregar/Quitar producto | Cliente | Botones + / - | Actualiza carrito y total |
| UC-05 | Abrir checkout | Cliente | Botón Confirmar pedido | Modal/hoja de checkout por pasos |
| UC-06 | Completar datos de cliente | Cliente | Paso 1 | Valida nombre, WhatsApp y email opcional válido |
| UC-07 | Definir logística | Cliente | Paso 2 | Pickup o Delivery con dirección y punto en mapa |
| UC-08 | Validar pago digital | Cliente | Paso 3 | Exige referencia 4 dígitos + comprobante |
| UC-09 | Confirmar pedido | Cliente | Botón final | Inserta pedido en pedidos + redirige a tracking |
| UC-10 | Consultar tracking | Cliente | Abrir /orders/[orderId] | Visualiza estado, resumen, pago y delivery |
| UC-11 | Activar notificaciones estado | Cliente | Botón notificaciones | Pide permiso Notification API |
| UC-12 | Recibir cambios en tiempo real | Sistema | Realtime de Supabase | Refresca estado del pedido en pantalla |
| UC-13 | Visualización de desglose de orden en Tracking | Cliente | Pedido cargado en /orders/[orderId] | Muestra ítems (cantidad, precio unitario, subtotal), método de pago y transparencia de tasa aplicada |

Evidencia de UC críticos:

- Selector de moneda global: [site/app/v/[id]/page.tsx#L1946](site/app/v/[id]/page.tsx#L1946)
- Persistencia de pedido: [site/app/v/[id]/page.tsx#L1529](site/app/v/[id]/page.tsx#L1529), [site/app/v/[id]/page.tsx#L1629](site/app/v/[id]/page.tsx#L1629)
- Redirección a tracking: [site/app/v/[id]/page.tsx#L1752](site/app/v/[id]/page.tsx#L1752)
- Tracking realtime: [site/app/orders/[orderId]/page.tsx#L284](site/app/orders/[orderId]/page.tsx#L284)

## Medianos (subprocesos)

### M-01 Descubrimiento y armado de carrito

1. Identifica comercio por slug o UUID en URL
2. Carga catálogo y métodos de pago
3. Permite filtrar, navegar por categoría y ajustar cantidades
4. Mantiene total vivo del carrito

Referencias:

- Lectura de comercios/categorías/productos/métodos: [site/app/v/[id]/page.tsx#L768](site/app/v/[id]/page.tsx#L768), [site/app/v/[id]/page.tsx#L784](site/app/v/[id]/page.tsx#L784), [site/app/v/[id]/page.tsx#L790](site/app/v/[id]/page.tsx#L790), [site/app/v/[id]/page.tsx#L796](site/app/v/[id]/page.tsx#L796)

### M-02 Checkout por pasos

1. Paso 1 Cliente: nombre + WhatsApp obligatorios, email opcional
2. Paso 2 Logística: pickup o delivery; para delivery se exige dirección y punto en mapa
3. Paso 3 Pago: moneda, método, validaciones por tipo de pago, totales convertidos
4. Confirmación: guarda pedido y navega a tracking

Referencias:

- Email opcional: [site/app/v/[id]/page.tsx#L1055](site/app/v/[id]/page.tsx#L1055)
- Validación de avance paso 1: [site/app/v/[id]/page.tsx#L1106](site/app/v/[id]/page.tsx#L1106)
- Confirmación y navegación: [site/app/v/[id]/page.tsx#L1707](site/app/v/[id]/page.tsx#L1707), [site/app/v/[id]/page.tsx#L1752](site/app/v/[id]/page.tsx#L1752)

### M-03 Tracking y post-compra

1. Recupera pedido por orderId
2. Resuelve comercio y mapas
3. Muestra resumen de montos y datos de entrega/pago
4. Se suscribe a cambios realtime del pedido

Referencias:

- Carga de pedido: [site/app/orders/[orderId]/page.tsx#L225](site/app/orders/[orderId]/page.tsx#L225)
- Realtime: [site/app/orders/[orderId]/page.tsx#L284](site/app/orders/[orderId]/page.tsx#L284)
- Notificaciones: [site/app/orders/[orderId]/page.tsx#L391](site/app/orders/[orderId]/page.tsx#L391)

## Flujo completo (end-to-end)

1. Cliente entra a menú público por URL v/[id]
2. Frontend consulta Supabase directo para catálogo
3. Cliente arma pedido + define moneda/logística/pago
4. Frontend sube comprobante (si aplica) y construye payload detallado
5. Frontend envía pedido a /api/orders para validación y persistencia server-side
6. Frontend guarda URL/WA en sessionStorage/localStorage y redirige a orders/[orderId]
7. Tracking vuelve a consultar pedidos y queda escuchando cambios en realtime

Nota arquitectónica relevante:

- El flujo actual de checkout en v/[id] ya converge en /api/orders para persistencia server-side, validación y acciones post-venta.
- APIs disponibles: [site/app/api/menu/[comercioId]/route.ts](site/app/api/menu/[comercioId]/route.ts), [site/app/api/orders/route.ts](site/app/api/orders/route.ts), [site/app/api/orders/[orderId]/route.ts](site/app/api/orders/[orderId]/route.ts)

---

## 3) Ciclo de Vida del objeto Order

## Fase A - Construcción de datos en checkout (frontend)

Se generan/normalizan en memoria:

- Cliente: clientName, clientWhatsapp, clientEmail
- Logística: delivery.mode, delivery.address, delivery.reference, delivery.instructions, delivery.coordinates
- Pago: paymentMethod, referenceLast4, proofFile
- Divisas: selectedCurrencyCode, selectedExchangeRate
- Montos: subtotal, costo_delivery, total y versiones convertidas

Referencias:

- Conversión y moneda seleccionada: [site/app/v/[id]/page.tsx#L1079](site/app/v/[id]/page.tsx#L1079), [site/app/v/[id]/page.tsx#L1080](site/app/v/[id]/page.tsx#L1080)
- Función de persistencia: [site/app/v/[id]/page.tsx#L1529](site/app/v/[id]/page.tsx#L1529)

## Fase B - Ensamblaje de detalles y persistencia

Objeto detalles construido en frontend y enviado a pedidos:

- order_id
- cliente_nombre
- cliente_email
- telefono_cliente
- moneda_checkout
- tasa_cambio_snapshot
- metodo_pago { id, nombre, datos }
- referencia_pago
- comprobante_url
- delivery { mode, address, reference, instructions, coordinates }
- order_notes
- pago_con
- cambio_de
- subtotal
- subtotal_moneda_checkout
- costo_delivery
- costo_delivery_moneda_checkout
- total
- total_moneda_checkout
- items[] { product_id, nombre, cantidad, precio }

Referencias:

- Construcción de detalles: [site/app/v/[id]/page.tsx#L1584](site/app/v/[id]/page.tsx#L1584)
- Campos de snapshot monetario: [site/app/v/[id]/page.tsx#L1589](site/app/v/[id]/page.tsx#L1589), [site/app/v/[id]/page.tsx#L1590](site/app/v/[id]/page.tsx#L1590), [site/app/v/[id]/page.tsx#L1609](site/app/v/[id]/page.tsx#L1609)
- Inserción en pedidos: [site/app/v/[id]/page.tsx#L1629](site/app/v/[id]/page.tsx#L1629)

## Fase C - Representación en tracking

Tracking consume y refleja:

- Estado operacional del pedido
- Datos de cliente
- Totales (moneda snapshot + referencia COP)
- Referencia y comprobante de pago
- Notas del pedido
- Datos de delivery y mapas

Referencias:

- Lectura de referencia/comprobante/notas: [site/app/orders/[orderId]/page.tsx#L375](site/app/orders/[orderId]/page.tsx#L375), [site/app/orders/[orderId]/page.tsx#L376](site/app/orders/[orderId]/page.tsx#L376), [site/app/orders/[orderId]/page.tsx#L377](site/app/orders/[orderId]/page.tsx#L377)
- Reflejo de entrega: [site/app/orders/[orderId]/page.tsx#L545](site/app/orders/[orderId]/page.tsx#L545), [site/app/orders/[orderId]/page.tsx#L549](site/app/orders/[orderId]/page.tsx#L549)

---

## 4) Matriz de Comunicación

| Origen | Destino | Mecanismo | Contrato de datos | Observación |
|---|---|---|---|---|
| v/[id] URL | PublicMenuPage | Query param dinámico id | slug o UUID comercio | useParams |
| PublicMenuPage | Supabase tablas de catálogo | Supabase JS cliente | comercios, categorias, productos, metodos_pago | Lectura directa sin pasar por API route |
| PublicMenuPage | Supabase Storage | Supabase JS cliente | bucket comprobantes, archivo de imagen | Sube comprobante en checkout |
| PublicMenuPage | API /api/orders | fetch POST | payload de pedido + detalles + metadatos de pago/divisa | Persistencia centralizada en servidor |
| PublicMenuPage | orders/[orderId] | Navegación de ruta | orderId en path | router.push |
| PublicMenuPage | sessionStorage/localStorage | Web Storage | order-wa, order-tracking, draft cliente | Persistencia local de apoyo UX |
| orders/[orderId] | Supabase pedidos | Supabase JS cliente | busca por detalles.order_id | Carga inicial |
| orders/[orderId] | Supabase Realtime | Channel postgres_changes | cambios en pedidos | Actualización de estado en vivo |
| orders/[orderId] | Browser Notification API | Web API | permiso + notificación de cambio | Opcional del usuario |
| API /api/orders | Supabase server client | Route Handler | CreateOrderPayload | Camino alterno server-side |
| API /api/orders/[orderId] | Supabase server client | Route Handler | orderId path param | Camino alterno para lectura |
| API /api/menu/[comercioId] | Supabase server client | Route Handler | comercioId path param | Camino alterno para menú |
| API /api/send-order | Resend | Route Handler | clientEmail, orderId, tracking URL | Camino alterno para email |

Referencias clave:

- v/[id] lectura directa catálogo: [site/app/v/[id]/page.tsx#L768](site/app/v/[id]/page.tsx#L768)
- v/[id] envío a API pedidos: [site/app/v/[id]/page.tsx#L1622](site/app/v/[id]/page.tsx#L1622)
- orders realtime: [site/app/orders/[orderId]/page.tsx#L284](site/app/orders/[orderId]/page.tsx#L284)
- API POST orders: [site/app/api/orders/route.ts#L18](site/app/api/orders/route.ts#L18)

---

## 5) Análisis de Gaps de Datos

Definición aplicada: campos que el frontend envía en detalles al crear pedido, pero que tracking no muestra explícitamente.

Estado actual de cierre de gaps:

| Campo enviado desde frontend | Se envía en | Se muestra en tracking | Estado |
|---|---|---|---|
| detalles.metodo_pago.id/nombre/datos | v/[id] persistencia | Sí | Resuelto |
| detalles.pago_con | v/[id] persistencia | Sí | Resuelto |
| detalles.cambio_de | v/[id] persistencia | Sí | Resuelto |
| detalles.items[] | v/[id] persistencia | Sí (cantidad, precio unitario, subtotal) | Resuelto |
| detalles.delivery.coordinates | v/[id] persistencia | Parcial | Vigente (se usa para mapa, no se expone precisión textual) |

Referencias:

- Envío de esos campos: [site/app/v/[id]/page.tsx#L1584](site/app/v/[id]/page.tsx#L1584)
- Tracking actual: [site/app/orders/[orderId]/page.tsx](site/app/orders/[orderId]/page.tsx)

---

## 6) Lógica de Negocio de Divisas

## Flujo de tasa y moneda

1. El checkout agrupa métodos de pago por currency y detecta exchange_rate/tasa_cambio/rate por método.
2. Se define selectedCurrencyCode y selectedExchangeRate.
3. Todos los montos visuales del checkout y carrito se convierten desde COP usando convertFromCop.
4. Al persistir pedido se guarda snapshot en detalles (moneda_checkout + tasa_cambio_snapshot + montos convertidos).
5. Tracking muestra totales en moneda snapshot y tasa snapshot histórica.

Referencias:

- Detección de tasa: [site/app/v/[id]/page.tsx#L425](site/app/v/[id]/page.tsx#L425)
- Conversión base COP -> moneda: [site/app/v/[id]/page.tsx#L455](site/app/v/[id]/page.tsx#L455)
- Estado de moneda/tasa seleccionadas: [site/app/v/[id]/page.tsx#L1079](site/app/v/[id]/page.tsx#L1079), [site/app/v/[id]/page.tsx#L1080](site/app/v/[id]/page.tsx#L1080)
- Snapshot a DB: [site/app/v/[id]/page.tsx#L1589](site/app/v/[id]/page.tsx#L1589), [site/app/v/[id]/page.tsx#L1590](site/app/v/[id]/page.tsx#L1590)
- Reflejo en tracking: [site/app/orders/[orderId]/page.tsx#L507](site/app/orders/[orderId]/page.tsx#L507)

## Regla operativa implícita

- COP es la base de cálculo canónica.
- Si moneda != COP, monto_moneda = monto_cop / tasa.
- Snapshot evita drift histórico cuando cambian tasas en configuración del comercio.

---

## 7) Schema de pedidos (estado actual visible)

La migración relevante endurece pedidos con:

- Tipo enum pedido_estado
- Campos columnares: nombre_cliente, telefono_cliente, costo_delivery, estado
- Normalización de estado legacy a enum y renombre de estado_v2 a estado

Referencia:

- [supabase/migrations/20260407103000_checkout_hardening_pedidos.sql#L8](supabase/migrations/20260407103000_checkout_hardening_pedidos.sql#L8)
- [supabase/migrations/20260407103000_checkout_hardening_pedidos.sql#L19](supabase/migrations/20260407103000_checkout_hardening_pedidos.sql#L19)
- [supabase/migrations/20260407103000_checkout_hardening_pedidos.sql#L43](supabase/migrations/20260407103000_checkout_hardening_pedidos.sql#L43)

---

## 8) Observaciones de arquitectura

1. Convergencia de persistencia completada:
   - Camino actual UI: fetch a /api/orders desde v/[id]
   - Persistencia, validación y snapshot monetario en servidor
2. Validación de contrato completada:
   - API con esquema estricto y respuestas 400 detalladas para datos inválidos
3. Visualización de tracking completada:
   - Desglose de ítems y método de pago visibles para el usuario final

---

## 9) Resumen ejecutivo por tamaño de proceso

- Pequeños: navegación, selección de moneda, validaciones, acciones de carrito.
- Medianos: checkout por etapas, persistencia de pedido, tracking realtime.
- Flujo completo: menú -> checkout multimoneda -> persistencia con snapshot -> tracking vivo.

Estado general: la lógica de divisas ya viaja con snapshot hasta DB y tracking; quedan brechas de visibilidad puntual en tracking para cerrar trazabilidad total del pedido al 100%.
