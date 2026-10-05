# Personalizacion opcional: revision dirigida

Fecha: 2026-10-04. Estado actual: publicado en produccion despues de la
aprobacion literal `Apruebo ejecutar la ventana de produccion` recibida en chat.
Seleccion independiente A/B aprobada. Sin commits ni activacion de productos.

## Publicacion autorizada

- Next: `kosmenu-gn5xdsypk-bryanbencomo4s-projects.vercel.app`, alias
  `https://elmenuxfa.com`.
- Flutter: `web-j23msuwlj-bryanbencomo4s-projects.vercel.app`, alias
  `https://app.elmenuxfa.com`.
- Antes de publicar: 103 pruebas Next criticas y 18 pruebas Flutter de
  editor/enlaces aprobadas. Builds de produccion completados correctamente.
- Smoke: landing, health, menu publico, API de menu y app HTTP200. Health
  aprobado; bundle servido coincide por SHA con el build, contiene controles
  nuevos y solo el ref Supabase de produccion, sin Preview ni service_role.
- No se crearon pedidos ni se modificaron productos/configuraciones en
  produccion. No se trasladaron fixtures QA ni se ejecutaron migraciones.
- Opt-ins siguen OFF por defecto. Guardar/recargar manual del editor sigue
  siendo una comprobacion pendiente; no se certifica aqui un pedido real prod.
- Rollback de codigo: retornar Vercel a los deployments anteriores de cada
  proyecto. Conservar snapshots y datos; no deshacer la reparacion Preview del
  numerador ni apagar funciones globales o resetear el repositorio.

## Resultado actual

1. Arquitectura: `opciones_menu.personalizacion.version = 1`, opt-ins
  independientes, OFF por defecto. Motor/editor/modal/carrito actuales
  reutilizados; sin mapeo por nombres ni motor paralelo.
2. Archivos de aplicacion: `lib/core/constants.dart`,
  `lib/widgets/product_options_editor.dart`, `lib/screens/product_form_screen.dart`,
  `site/app/_lib/menu-product-options.ts`, `site/app/_lib/whatsapp-order-format.ts`,
  `site/app/api/_lib/{order-item-snapshots,order-idempotency-key,public-order}.ts`,
  `site/app/api/orders/route.ts`, `site/app/v/[id]/page.tsx`,
  `site/app/v/[id]/_components/ProductOptionsSheet.tsx` y la demo en
  `site/app/preview/dev-product-customization/{page,client}.tsx`.
  Se ampliaron pruebas existentes de editor, opciones, snapshots, API, comanda
  e idempotencia. Sin modificaciones de Realtime, delivery ni estados.
3. Combinacion: `combinacion.activada/titulo/productos_compatibles/regla_precio=max`.
  Seleccion B en `combinacion.productId/seleccion`, con sus propios IDs.
4. MAX: carga A/B en lote, filtrada por comercio; valida disponibilidad,
  compatibilidad, UUID B, grupos/tamanos/ajustes y exclusiones. Usa
  `resolveCartLineUnitPrice` por componente y MAX por unidad, despues cantidad.
  Precio del navegador ignorado para la nueva configuracion. Totales/voucher
  autoritativos; hashes antiguos conservados, intent nuevo distingue A/B.
5. Exclusiones: `exclusiones.activadas/titulo/ingredientes[{id,nombre}]`;
  seleccion `exclusionesIds` por producto, sin descuento ni descripcion parseada.
6. Modal/carrito: A normal; B simple inmediato, exclusiones inline; B con
  opciones usa el mismo configurador. Muestra nombres, opciones y exclusiones
  independientes. Claves y HTML normal/disabled mantienen igualdad legacy.
7. Snapshot: `detalles.items[].personalizacion` congela regla/precio final y
  componentes con ID/nombre, precio efectivo, opciones y exclusiones. Guarda
  tambien `selecciones` legibles para consumidores actuales. DTO cliente
  muestra esas etiquetas, no la configuracion interna ni IDs en texto.
8. WhatsApp: nombres reales y opciones/exclusiones por A/B, sin IDs. Solo
  personalizacion efectiva fuerza detalle; pedidos normales siguen iguales.
9. Gates: Flutter279 aprobadas y analisis focal limpio. Next ultima suite
  completa379 aprobadas/8 fallos previos tracking; checks posteriores API/DTO
  aprobados. Typecheck4 errores previos de tests ajenos. Lint aprobado con
  warnings existentes. Builds Next local/remoto y Flutter Preview aprobados.
  Navegador390/1280: base40k, qty2=80k, opciones50k/80k=80k; B obligatorio
  bloquea continuar. Snapshots y comanda independientes verificados.
10. URLs: menu real
   https://kosmenu-product-options-qa-bryanbencomo4s-projects.vercel.app/v/preview-demo
   ; editor
   https://web-product-options-qa-bryanbencomo4s-projects.vercel.app
   ; demo aislada
   https://kosmenu-product-options-qa-bryanbencomo4s-projects.vercel.app/preview/dev-product-customization
   ; demo local http://127.0.0.1:3019/preview/dev-product-customization.
11. Limites: URLs requieren sesion Vercel por Deployment Protection, conservada.
   Editor probado con widgets/build; guardar/recargar manual del operador queda
   para revision. Picker hasta1000 productos, parser100 compatibles/50
   ingredientes. Preview usa fallback largo al no tener enlaces cortos.
12. Rollback: apagar toggles conserva configuracion/snapshots historicos;
   desactivar solo productos QA listados y retirar solo alias QA. No reset ni
   cambios globales, no borrar pedidos ni secuencia del numerador.

## Evidencia real Preview

Supabase: `gsfxqzvmyzjjgpigrste`. Comercio `Preview Cafe Demo`,
`11111111-1111-4111-8111-111111111111`. Moneda existente USD conservada;
30k/40k/50k/80k son valores numericos en esa moneda. Demo aislada usa COP.

Productos nuevos, prefijo `QA Personalizacion 20261004`:

- A base: `fc887aeb-eaab-45f6-ba89-f75c44199fed`; precio30000.
- B base: `8b9df865-ea30-46d1-91fb-fce0ae58fa93`; precio40000.
- A opciones: `4a44e447-c462-4c24-81fa-aad3a7351ba7`; efectivo50000.
- B opciones: `3f73d3bc-fe62-4049-aee8-36610bc86dd2`; efectivo80000.

Pedidos reales QA `EMXFA-000001/000002/000003`: total80000, base unit40000 qty2
y opciones unit80000 qty1. Snapshots persistidos y comanda comprobados.
Rechazos reales: IDs A usados en B400, B no permitido400, otro tenant409.
Recibo cliente `EMXFA-000003`: GET autorizado200 con exclusiones visibles.
No correos ni mensajes WhatsApp enviados; estados siguen pendiente.

Preview inicialmente carecia del RPC `next_order_display_number`; se restauro
SOLO la migracion aditiva existente `20260910203000_order_display_number_seq.sql`
con project-ref explicito y se recargo PostgREST. Antes se confirmo ausencia de
RPC/secuencia/codigos EMXFA existentes. Sin backfill ni cambios en pedidos
anteriores. El fallo del DTO de exclusiones se corrigio y volvio a validar.

READY FOR PREVIEW TEST

## Registro inicial historico

Lo siguiente documenta la revision anterior a la decision A/B; NO describe
el estado actual, que queda detallado arriba.

## Alcance y evidencia

- Editor: `lib/screens/product_form_screen.dart` usa
  `ProductOptionsEditor` y `ProductOptionGroup.mergeIntoMenuOptions`.
  El editor real es Flutter, no Next. El merge conserva claves JSON desconocidas
  y opciones legacy; solo reemplaza `activadas`/`grupos`.
- Estructura: `lib/models/product_option_group.dart` genera IDs aleatorios
  locales por grupo/opcion. Los grupos incluyen unica/multiple, obligatorio,
  min/max, opciones activas, defaults, texto libre y reglas de precio.
- Motor: `site/app/_lib/menu-product-options.ts` resuelve tamanos, ajustes,
  servicio adicional de categoria y grupos con precios dependientes. Las reglas
  referencian IDs de la seleccion del mismo producto. No contienen relacion
  entre las opciones de dos productos.
- Modal: `ProductOptionsSheet.tsx` configura un producto, valida sus reglas y
  usa `resolveCartLineUnitPrice`. No recibe configuracion del segundo producto.
- Carrito: `buildCartLineKey`/`parseCartLineKey` serializan producto, tamano,
  servicio, ajustes, grupos y textos. Las claves actuales deben mantenerse
  identicas cuando las capacidades nuevas no estan activadas.
- Creacion: `site/app/api/orders/route.ts` carga productos/categorias filtrados
  por UUID del comercio y llama a `buildOrderItemSnapshots`.
- Snapshot: `order-item-snapshots.ts` guarda nombres/precios/opciones e imagen/
  categoria del catalogo. Valida/recalcula lineas con grupos; conserva el
  contrato legacy de otras lineas y de clientes sin `opciones`.
- Comanda: `whatsapp-order-format.ts` lee `selecciones` guardadas y agrupa
  productos por categoria. Permite reutilizar nombres congelados sin IDs.
- Disponibilidad: el menu publico filtra `disponible`; la consulta del catalogo
  en la creacion del pedido no proyecta ese campo. Las nuevas combinaciones
  requeririan comprobarlo en backend, ademas de comercio e IDs compatibles.

## Bloqueo de precio efectivo

No existe una asociacion que permita afirmar que una opcion elegida de A debe
seleccionar una opcion concreta de B. Los IDs son locales. La coincidencia de
nombres tampoco implica equivalencia de precio o dependencias.

`resolveCartLineUnitPrice` no es un validador: una seleccion ajena puede no
encontrar opciones y terminar calculando un precio base. Es imprescindible
ejecutar `validateOptionGroupSelection` sobre cada seleccion de cada producto
antes de calcular MAX. Los tamanos legacy tambien necesitan validar su ID:
su resolver actual puede usar el primer tamano cuando no encuentra el pedido.
No se debe cambiar silenciosamente ese comportamiento para productos antiguos.

Por tanto no se implementa `max(precioA, precioB)` pasando la seleccion de A a
B, ni un mapeo por nombres, ni se ignoran opciones de B para acelerar la entrega.
La solicitud pide detenerse y documentar precisamente este caso.

## Solucion minima propuesta, pendiente de decision

Reutilizar el JSON `opciones_menu`, con capacidades versionadas y opt-in
independientes. Ninguna clave legacy se reinterpretaria. Configuracion ausente,
antigua, incompleta o disabled conservaria el comportamiento anterior.

Para el precio hay dos alternativas:

1. Selecciones independientes A/B. Reutilizar los controles y el motor actual
   por separado; el cliente configura cada producto. Es la alternativa minima
   sin equivalencias inventadas, pero requiere aprobar esa experiencia.
2. Seleccion compartida. El negocio define asociaciones por IDs de grupo/opcion
   para cada producto compatible. Se valida cada asociacion; los textos no
   participan en la identidad. Necesita controles adicionales no incluidos en
   la pantalla simple solicitada.

En ambos casos el backend cargaria A/B desde el comercio autenticado/resuelto,
validaria opt-in, regla `max`, lista permitida, disponibilidad y selecciones,
y reutilizaria `resolveCartLineUnitPrice` para cada uno. Precio unitario:
`max(effectivePriceA, effectivePriceB)`. Cantidad se aplica despues. El precio
del navegador nunca seria autoridad. Un mismatch se rechaza antes de crear;
no se acepta un importe mayor sin que el cliente lo haya confirmado.

Exclusiones: lista explicita de IDs/etiquetas en el mismo JSON, independiente
y apagada por defecto. El servidor validaria pertenencia y congelaria los
nombres seleccionados. No se parsearia la descripcion ni se cambiaria precio.
No se implementa parcialmente antes de resolver el bloqueo de combinaciones.

El snapshot de combinacion debe conservar ambos IDs/nombres, las selecciones
de cada producto, los precios efectivos y la regla `max`; el de exclusiones,
IDs/nombres y etiqueta de presentacion. Carrito, pedido y comanda consumirian
esa representacion sin depender del catalogo futuro ni mostrar IDs tecnicos.

## Preview y pruebas

No existe Preview de esta funcionalidad porque no esta implementada. No se
crearon fixtures A/B, no se enviaron pedidos ni mensajes y no se promovio.
La configuracion Preview estaba incompleta en la entrega anterior; no debe
usarse produccion como sustituto. Debe verificarse nuevamente al retomar.

Las 12 pruebas solicitadas y la comparacion antes/despues siguen pendientes.
Las pruebas existentes del motor, snapshot y comanda pueden validar el baseline,
pero no certifican una capacidad nueva ni un flujo Preview end-to-end.

Verificacion ejecutada: 70 pruebas existentes aprobadas en
`menu-product-options`, `menu-option-groups`, `order-item-snapshots` y
`whatsapp-order-format`. No se ejecutaron builds/lint/typecheck adicionales,
porque solo se modifico documentacion; ni Flutter ni Next cambiaron.

Comprobacion en memoria del motor actual, sin escribir catalogo: A con sus IDs
cuesta 50.000, B con los suyos 80.000, MAX correcto 80.000. Reutilizar la
seleccion de A en B produce un MAX inseguro de 50.000. El validador actual
rechaza esa seleccion ajena. No es una regresion introducida en el sistema
actual: demuestra el riesgo de implementar la combinacion con esa suposicion.

Decision necesaria antes de implementar: opciones independientes para A/B,
o asociaciones explicitas por IDs configuradas por el negocio. Se recomienda
la primera si se acepta configurar cada componente por separado.

## Rollback

No hay rollback de codigo funcional ni de datos que ejecutar: solo se agrego
este documento. Al implementar, apagar cada capacidad debe afectar pedidos
futuros, conservar el JSON legacy y preservar snapshots historicos.