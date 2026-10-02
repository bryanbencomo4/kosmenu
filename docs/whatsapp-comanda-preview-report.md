# Modo Comanda WhatsApp: reporte de revisión

Fecha: 2026-10-02.

Actualización de publicación: el usuario solicitó probar en producción y dio
la aprobación literal `Apruebo ejecutar la ventana de producción`.
Next y Flutter se reconstruyeron/publicaron en producción después de esa
aprobación. No se activó ningún comercio y no se ejecutó ninguna migración.
No se declara validación integral completada: los gates generales pendientes
y el bloqueo de Preview documentados abajo siguen vigentes.

## 1. Archivos de esta funcionalidad

- [Formatter y resolución opt-in](../site/app/_lib/whatsapp-order-format.ts).
- [API de creación: texto opcional](../site/app/api/orders/route.ts).
- [Cliente Next: elección de contenido](../site/app/v/[id]/page.tsx).
- [Configuración Flutter: operaciones](../lib/screens/business_setup_screen.dart).
- [Selector de formato](../lib/widgets/whatsapp_order_format_selector.dart).
- [DTO de respuesta Flutter](../lib/services/public_order_api_service.dart).
- [Cliente Flutter: fallback existente](../lib/screens/public_menu_view.dart).
- [Tests del formatter](../site/tests/whatsapp-order-format.test.ts).
- [Tests API multitenant](../site/tests/whatsapp-order-format-api.test.ts).
- [Tests del selector](../test/whatsapp_order_format_selector_test.dart).
- [Tests del DTO Flutter](../test/public_order_api_service_test.dart).
- Este reporte.

No se modificaron Realtime, proveedor, webhook, estados del pedido, shortCode,
autorización del enlace ni políticas RLS durante esta tarea.

## 2. Configuración utilizada

Tabla existente: `comercios`.
Columna JSON existente: `branding_ia`.
Clave: `config_negocio.whatsapp_order_format`.
Valores: `summary` y `detailed`.

La API reutiliza el objeto de comercio que ya carga por UUID/slug al crear el
pedido. La proyección `branding_ia->config_negocio` ya estaba en esa consulta.
No se añade una consulta de preferencias por pedido, ni N+1 por producto.

## 3. Default y compatibilidad

Únicamente el valor exacto `detailed` activa la comanda. Ausente, null, inválido,
configuración antigua, error de acceso al campo o error del formatter dejan
el texto opcional ausente y activan el formatter summary anterior.

Los comercios nuevos no reciben opt-in durante onboarding. El selector solo
aparece en la configuración de operaciones del comercio existente.

## 4. Summary

El bloque literal del resumen Next se trasladó a `buildClientOrderSummary`
para probar su texto exacto; no se alteraron etiquetas, saltos, emojis,
precios ni enlaces. Tiene una prueba `toBe` byte por byte.

El formatter corto del servicio de envío automático y su prueba existente
se mantienen sin modificaciones. El formatter anterior del menú Flutter
también sigue intacto; solo se añade `serverText ?? existingFormatter()`.

Antes: comercio sin preferencia -> summary.
Después: el mismo caso -> el mismo summary.

## 5. Detailed

Se arma en el servidor con los datos del pedido que se están persistiendo,
no con una preferencia enviada por el cliente. Datos reales usados:

- `items[].cantidad`, `producto`, `nombre`, `precio_final` o `precio`.
- `selecciones[].grupo/opcion` y snapshots antiguos en `opciones[]`.
- `seleccion.tamanoLabel` cuando no existe snapshot de etiquetas.
- `order_notes`, `total_moneda_checkout`, `moneda_base`, `moneda_checkout`,
  `tasa_cambio_snapshot`.
- `delivery.mode/address/reference/instructions/coordinates`.
- `metodo_pago.nombre`, referencia de cuatro dígitos enmascarada,
  `pago_con` y `cambio_de` para efectivo.

Los precios base se convierten con la misma función de moneda del pedido.
No se recalculan precios ni totales. No se muestran ids de opciones como
si fueran nombres. Los textos libres congelados en snapshots aparecen
como opciones; no se inventa un campo de notas por artículo inexistente.

No se imprimen comprobantes privados, tokens, metadata interna ni datos
arbitrarios de pago. El formatter no registra teléfonos, direcciones ni texto.

## 6. UI y permisos

Configuración -> Operación y WhatsApp -> Pedidos por WhatsApp.
Dos radios: Resumen + enlace / Comanda por WhatsApp.
Respeta `MerchantSession.canManageSettings` y deshabilita cambios al guardar.
El guardado usa el UUID que está editando la pantalla, lee el JSON actual,
fusiona la nueva clave y mantiene el resto de preferencias del comercio.
Comprueba que la actualización devolvió una fila y muestra feedback.
La recarga lee la clave persistida; si falta, vuelve a summary.

La comprobación real de persistencia/RLS/recarga sigue pendiente en Preview.

## 7. Delivery

Solo para `mode = delivery`: dirección y referencia reales si existen,
indicaciones y Maps únicamente con coordenadas presentes, numéricas y dentro
de rangos válidos. No se inventa una dirección ni se usa `0,0` por null.
No se altera el costo, la tarifa ni el sistema de delivery.

## 8. Retiro

Muestra `RETIRO EN TIENDA`. No publica dirección, referencia, indicaciones ni
Maps aunque un pedido antiguo conserve esos campos.

## 9. Tests añadidos

18 tests de formatter/default/regresión y 3 de integración de API: 21 aprobados.
5 tests del selector: default, opt-in, rollback, permisos y anchos 320/390/768.
Un nuevo test del DTO Flutter y una aserción de ausencia en respuesta antigua.

Se cubren preferencias ausentes/null/summary/invalid, comanda, A/B, retiro,
delivery, productos simples, modificadores, observaciones presentes/ausentes,
error de lectura, error del formatter, enlaces y pedidos extensos.

## 10. Aislamiento y no duplicación

API simulada: A detailed -> B sin configuración -> A summary.
Cada inserción conserva el UUID correspondiente. Un body con
`whatsapp_order_format = detailed` no fuerza el modo del comercio.
La ruta habitual consulta el comercio una vez.

Se conserva `whatsappStatus = client_link` y el mismo mecanismo `wa.me`.
No se añade un envío automático, worker, cola ni segunda llamada a WhatsApp.
La idempotencia y el estado `pendiente` no cambian.

Estos son tests con dependencias simuladas, no una certificación de entrega
de WhatsApp ni una prueba real de RLS entre cuentas de Preview.

## 11. Resultados de validación

| Gate | Resultado |
| --- | --- |
| `npm run build` | PASS, build local con variables de prueba explícitas |
| `npm run lint` | PASS con advertencias existentes |
| `npm run typecheck` | 4 errores ya presentes antes del cambio, en 3 tests ajenos |
| `npm test` | 327 aprobados, 8 fallos en tracking del cliente |
| Suite tracking aislada | Los mismos 8 fallos, sin cargar mocks de Comanda |
| Nuevos tests Next | 21/21 PASS |
| `flutter analyze` | 21 avisos existentes, ningún diagnóstico nuevo de la función |
| `flutter test` | 243/243 PASS con `API_BASE_URL = https://preview.example` |
| `flutter build web` | PASS, artefacto local separado con valores ficticios |

Typecheck previo y posterior: errores de tipos en dispatch-order-notification,
notify-merchant-new-order y payment-method-display. No se corrigieron durante
esta tarea por ser ajenos al cambio.

Los 8 fallos de tracking son respuestas 401 frente a expectativas 200/404/409;
la ruta de tracking no se modificó para esta funcionalidad y el fallo se
reproduce aislado. Deben resolverse o revisarse en su propia tarea; no se
debilitó autenticación para hacerlos pasar.

## 12. Preview: bloqueado

Se consultaron las variables Preview de la rama `security/phase-2a-preview`
y se descargaron con `vercel pull --environment=preview`, sin publicar.
La variable pública `NEXT_PUBLIC_SUPABASE_URL` está vacía. El guard rechazó
el entorno antes de cualquier petición a la base de datos.

Por tanto: no tenant real creado, no opt-in real activado, no pedido Preview
real, no envío WhatsApp real y ningún despliegue Next/Flutter Preview.
El build Flutter local usa credenciales placeholder, no un entorno funcional.

Pendiente: restaurar URL y credenciales del Supabase Preview autorizado
`gsfxqzvmyzjjgpigrste`, revisar los gates generales y completar:

1. Entrar a un tenant seguro Preview y comprobar summary por defecto.
2. Seleccionar comanda, guardar, recargar y confirmar persistencia.
3. Crear pedido Preview con opciones y comprobar mensaje/enlace/total.
4. Probar retiro, delivery, referencia, instrucciones y Maps.
5. Repetir con B summary para verificar aislamiento real.
6. Volver A a summary, guardar/recargar y crear otro pedido.
7. Comparar el texto anterior y posterior byte por byte y verificar un único envío.

No sustituir variables vacías por producción ni usar el script de deploy
Flutter de producción para estas pruebas.

## 13. SQL y límites del canal

No hay migración: se reutiliza una columna JSON ya existente. No se cambian
defaults de columnas, RLS, tablas, triggers ni políticas.

Canal activo auditado: Click to Chat `wa.me`, no envío WASender desde checkout.
La cola WASender del repositorio rechaza mensajes > 12.000 caracteres en la
migración existente `20260927193000_wasender_global_message_queue.sql`.
La [documentación del proveedor](https://wasenderapi.com/api-docs/messages/send-text-message)
publica el parámetro `text` pero no un máximo en la página consultada.
No se atribuye a WhatsApp un límite oficial de URL no documentado.

Política conservadora propia: <= 8.000 caracteres de comanda y <= 18.000
caracteres tras `encodeURIComponent`. Al excederse se entrega un único texto
con aviso de pedido extenso, cantidad de líneas, número, total y el mismo enlace
de gestión. No hay truncado silencioso ni mensajes múltiples.
El comportamiento de enlaces largos debe validarse en navegadores/dispositivos
reales durante Preview; estos umbrales no constituyen una garantía del proveedor.

## 14. Rollback

Para un comercio afectado: elegir Resumen + enlace y guardar. La siguiente
creación vuelve a summary sin revertir la aplicación. No existe caché global
de formato, y otros comercios no cambian.

También puede quitarse solo esa clave del JSON del tenant; ausencia equivale
a summary. Nunca eliminar `config_negocio` completo. No se ejecutó SQL.
Mensajes ya generados o respuestas idempotentes previas no se reescriben.

Rollback demostrado por tests: A detailed -> A summary produce respuesta sin
comanda y conserva tracking URL y mecanismo de envío.

## 15. Ejemplos ejecutados

Salida del formatter con fixtures ficticios; no enviados y no datos reales.
El dominio y shortCode son de ejemplo.

### Summary

```text
🆕 *NUEVO PEDIDO #EMXFA-000156*

👤 Cliente: Cliente Preview
📞 +584121234567

📦 Entrega: Retiro en tienda
💳 Pago: Efectivo

💰 Total: $ 40.500

⏳ Estado: *Pendiente*

🔗 Ver pedido:
https://flutter-preview.example/orders/view/EMXFA-000156?shortCode=AbCdEf1234
```

### Detailed

```text
🧾 *PEDIDO #EMXFA-000156*
━━━━━━━━━━━━━━━━━━

🍽️ *DETALLE DEL PEDIDO*

*2x Pizza*
$ 18.000 c/u
• Tamaño: Grande
• Extras: Extra queso

*1x Coca-Cola 1.5L*
$ 4.500

📝 *OBSERVACIONES*
Cortar en ocho porciones

━━━━━━━━━━━━━━━━━━
💰 *TOTAL: $ 40.500*
━━━━━━━━━━━━━━━━━━

👤 *CLIENTE*
Cliente Preview
📞 +584121234567

📦 *RETIRO EN TIENDA*
💳 Pago: Efectivo

⏳ Estado: Pendiente

🔗 *Gestionar pedido*
https://flutter-preview.example/orders/view/EMXFA-000156?shortCode=AbCdEf1234
```

## Conclusión

Código y tests nuevos preparados; no se detectó regresión nueva de Comanda.
Preview real no validado por configuración vacía. Tras la revisión inicial,
el usuario autorizó expresamente publicar para pruebas manuales en producción;
esto no convierte los gates generales pendientes en PASS.

## 16. Publicación posterior autorizada

- Next publicado: `https://elmenuxfa.com`.
- Deployment: `https://kosmenu-21j5biee6-bryanbencomo4s-projects.vercel.app`.
- Flutter publicado: `https://app.elmenuxfa.com`.
- Deployment: `https://web-qvlykrfve-bryanbencomo4s-projects.vercel.app`.
- Antes de publicar: 29 tests Next enfocados y 5 tests del selector aprobados.
- Flutter se compiló con configuración de producción mediante el script del
    repositorio; no se reutilizó el artefacto de prueba con credenciales ficticias.
- Smoke de solo lectura: app, bundle y menú `pizzas-el-trueno` responden 200.
- El bundle publicado contiene `Pedidos por WhatsApp`, `Comanda por WhatsApp`
    y el campo opcional `merchantWhatsappText`.
- No se crearon pedidos reales, no se enviaron mensajes ni se cambiaron
    preferencias de restaurantes durante estas verificaciones.

Para probar manualmente: Configuración -> Operación y WhatsApp -> Pedidos
por WhatsApp. Seleccionar Comanda solo en un comercio de prueba, guardar,
recargar y realizar un pedido controlado. Luego volver a Resumen + enlace
y repetir para verificar la reversibilidad documentada arriba.

Estado actual: publicado bajo aprobación explícita; prueba integral manual
pendiente. Summary continúa siendo el default de los comercios sin opt-in.