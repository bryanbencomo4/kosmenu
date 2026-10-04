# Gestión manual por WhatsApp: revisión local

Fecha: 2026-10-02. Código desplegado en producción tras aprobación literal.
El modo sigue desactivado por defecto y no se activó en ningún comercio. No se
actualizaron pedidos históricos; no hubo migraciones ni cambios RLS.

## Arquitectura

Dos preferencias independientes en la configuración existente del comercio:

- `comercios.branding_ia.config_negocio.whatsapp_order_format`: summary/detailed.
- `comercios.branding_ia.config_negocio.order_management_mode`: platform/whatsapp_manual.

Snapshot por pedido: `pedidos.detalles.management_mode`.
La creación reutiliza el comercio ya resuelto por UUID/slug y guarda ese valor
antes de insertar. El body del cliente no puede imponerlo. No se añade una
consulta por pedido ni se consulta la preferencia actual al abrir uno existente.

Solo `whatsapp_manual` exacto activa gestión manual. Campo ausente, null,
inválido, error de lectura o formato detailed sin modo independiente -> platform.
Los pedidos antiguos sin snapshot permanecen platform. Nuevos pedidos normales
guardan platform explícitamente. Cambiar preferencias no reescribe snapshots.
Las respuestas idempotentes conservan el snapshot de su creación original.

Se mantiene el estado SQL interno compatible (`pendiente` al crear), sin ampliar
el enum global. No se convierte manual a aceptado, en camino ni entregado.
La UI deriva el único estado visible: Gestionado por WhatsApp.

## Configuración

Operación y WhatsApp ahora incluye Modo de gestión de pedidos:

- Gestionar desde ElMenúXFA: conserva el formato de mensaje configurado.
- Gestionar manualmente por WhatsApp: fuerza formato detailed y recepción WhatsApp.

El control de formato sigue separado. Cambiar detailed solo no habilita manual.
Para guardar manual se requiere recepción activa y un teléfono válido con la
validación existente. El guardado usa UUID editado, permisos actuales, JSON
actual fusionado y feedback; no cambia preferencias de otros comercios.

## Consulta y protección

Comercio Flutter: banner de gestión manual, datos/productos/pago/entrega y
observaciones normales, sin timeline, aceptar, transición ni delegación.
Actualización de estado comprueba el pedido recién leído y rechaza manual.
Helpers de invitación también bloquean manual. Badge móvil compacto WhatsApp;
el aviso conserva el texto completo. Layout probado a 320/390/768 px.

Cliente Next: estado manual y coordinación directa, sin etapas, cancelación,
confirmación de recepción, calificación por estado ni misión de repartidor.
El DTO deshabilita permisos de workflow y suprime hints/progreso delegado
automáticos. Sus totales/productos y enlaces de menú/contacto permanecen.

La API de mutación verifica token/shortCode/correo como antes y, después de
autorizar, rechaza cancel/confirm_received/submit_rating en manual con 409.
La preferencia de notificaciones (no transición) conserva su contrato existente.
No hay bypass de autorización ni cambios del enlace seguro.

La pantalla de pedido enviado/voucher guarda el modo, incluido el retorno del
chat. Clientes/DTO antiguos sin campo siguen platform.

## Mensaje WhatsApp

La comanda se basa en el snapshot manual, no en el formato como workflow.
Manual fuerza comanda; su footer dice:

```text
📲 Gestión: Por WhatsApp

🔗 *Ver pedido*
<mismo enlace seguro existente>
```

No contiene Estado: Pendiente ni Gestionar pedido. El fallback de mensaje
manual tampoco anuncia tracking platform. Platform conserva summary exacto,
comanda detailed anterior si estaba configurada, estado y mecanismos de envío.
No se añade otro envío ni cambia proveedor/shortCode.

## Analytics

Clasificación visual Flutter separada: `OrderStatusBucket.whatsappManual`.
Es un bucket de presentación, no un valor del enum SQL. Manual no queda dentro
de pending/inProgress/completed/canceled para las etapas operativas.
Los filtros de todos/no cancelados conservan sus pedidos, ingresos y artículos.
La lectura reducida de métricas/clientes proyecta el snapshot para no perderlo
fuera de la ventana realtime. Prueba de ingresos mixtos y productos conservados.

Dashboard administrativo Next lee el escalar de snapshot en la consulta que ya
existe; manual se excluye de cola abierta y conteos pendiente/en camino/entregado,
pero no de volumen total ni ingresos. No hay consulta extra por fila.
No se cambió el sistema Realtime global.

## Delivery: dependencia auditada

Checkout crea el pedido delivery sin requerir aceptar y sin crear invitación.
La UI actual del vendedor invoca `create_delivery_invitation` cuando elige
delegar al pasar a En camino. Manual oculta esa ruta y bloquea los helpers.
Se mantienen dirección, referencia, instrucciones y mapa como datos de consulta.

El RPC SQL existente no exige aceptado: permite delivery no cancelado/entregado
para el propietario autenticado. No fue redefinido ni se modificaron permisos.
Por tanto un propietario con acceso técnico al RPC todavía puede invocarlo
directamente; no se afirma inmutabilidad a nivel de base de datos frente a SQL
privilegiado o clientes antiguos. Una restricción SQL dura requeriría revisión
y migración independiente en Preview, no cambios ad hoc de RLS.

Si existiera una invitación manual por una llamada externa, la API de delivery
devuelve canAccept/canMarkArrived false y rechaza acciones POST manuales.
No se crearon misiones, se alteraron invitaciones anteriores ni se habilitó
automáticamente un workflow diferente para el repartidor.

## Tests y cobertura

| Caso solicitado | Cobertura local |
| --- | --- |
| 1. Comercio/pedido antiguo sin modo | Resolvers, modelo y render platform |
| 2. Pedido normal nuevo | API guarda snapshot platform; body no lo fuerza |
| 3. Nuevo manual | API guarda whatsapp_manual y comanda manual |
| 4. Vendedor manual | Pantalla completa simulada sin aceptar/acciones/timeline |
| 5. Cliente manual | Render real sin etapas incluso con flags inconsistentes |
| 6. Platform sin cambios | Render explicit platform = campo ausente; tests existentes |
| 7. Manual -> platform | Snapshot antiguo manual permanece; nuevo platform |
| 8. Platform -> manual | Snapshot antiguo platform permanece |
| 9. A/B | API por UUID y nuevos pedidos sin contaminación |
| 10. Footer manual | Gestión Por WhatsApp, Ver pedido, sin Pendiente |
| 11. Enlace de consulta | GET autorizado; PATCH workflow rechaza; URL intacta |
| 12. Platform acepta | Timeline/transiciones anteriores y suites existentes |
| 13. Analytics | Ingresos mixtos, cantidad y productos conservados |
| 14. Checkout | Creación manual/delivery simulada; una lectura normal de comercio |

Pruebas adicionales: inválidos/null/error -> platform, detailed no activa modo,
selector reversible, DTO Flutter compatible, header manual responsive.
Son pruebas con dependencias simuladas, no pruebas de entrega WhatsApp, RLS real
o medición de latencia contra una base Preview funcional.

## Resultados

- Flutter suite final: 267 aprobados.
- Next suite: 355 aprobados; mismos 8 fallos previos de tracking/auth.
- Typecheck: mismos 4 errores previos en tests ajenos; sin tipos nuevos fallidos.
- Flutter analyze: mismos 21 avisos existentes, sin diagnósticos nuevos.
- Lint Next: aprobado con warnings existentes.
- Build Next local: aprobado con configuración ficticia explícita.
- Build Flutter web: aprobado en `build/whatsapp-manual-preview`, no publicación.
- Desbordamientos nuevos detectados en manual a 320/390 px: corregidos y probados.
- Setup de JSX/PostgREST de pruebas: corregido; no se debilitaron accesos.

## Preview y producción

Preview continúa sin configuración utilizable: faltan
NEXT_PUBLIC_SUPABASE_URL, anon key y service credential. No se validó con
comercios ni pedidos reales en Preview. Después de recibir la aprobación literal
`Apruebo ejecutar la ventana de producción`, se desplegó el código:

- Next/Vercel: `kosmenu-icikd1jlm-bryanbencomo4s-projects.vercel.app`, alias
   `https://elmenuxfa.com`.
- Flutter/Vercel: `web-b8iswr5jj-bryanbencomo4s-projects.vercel.app`, alias
   `https://app.elmenuxfa.com`.
- Smoke: landing, `/api/health`, menú público, shell Flutter y `main.dart.js`
   respondieron HTTP 200. El bundle servido contiene el ref Supabase de prod y
   no contiene el ref Preview ni `service_role`.
- No se ejecutaron migraciones, no se escribieron preferencias de comercios,
   no se enviaron mensajes WhatsApp ni se crearon pedidos de prueba.
- El build local de `vercel build --prod` compiló Next pero falló al empaquetar
   una lambda dinámica en Windows; el deploy remoto desde el root del monorepo
   completó build y publicación correctamente.

La funcionalidad ya está disponible, pero permanece opt-in por comercio:
`platform` sigue siendo el default y solo pedidos nuevos toman la preferencia
actual como snapshot. La validación de comportamiento end-to-end por tenant
sigue pendiente.

Antes de certificar la restricción de workflow para todas las versiones:

1. Validar A platform y B manual con cuentas de prueba, incluyendo guardar y
    recargar ambas preferencias.
2. Crear pedidos controlados y verificar snapshot, mensaje y consulta como
    comercio/cliente; cambiar preferencias y confirmar que el histórico no varía.
3. Revisar analytics y confirmar que los pedidos manuales no crean misiones.
4. Revisar clientes nativos antiguos y el RPC `create_delivery_invitation`:
    los guards desplegados protegen las rutas UI/API actuales, pero el RPC SQL
    directo para propietario no se endureció y sigue siendo una limitación.

## Rollback por comercio

Seleccionar plataforma y guardar. Solo pedidos futuros serán platform; los
manuales anteriores siguen de consulta según su snapshot. No se actualiza
histórico ni se elimina la configuración completa. El formato queda separado
y puede elegirse summary/detailed en gestión platform.

Estado: desplegado en producción, smoke HTTP aprobado; Preview real no validado,
sin activación de comercios y con la limitación de RPC descrita arriba. No se
declara validación integral end-to-end terminada.