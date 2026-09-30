# Opciones y modificadores de productos: análisis previo

Estado: análisis antes de implementar. Solo localhost, sin deploy.

## Hallazgo principal

La tabla `productos` **ya tiene** una columna `opciones_menu jsonb` (migración
`20260910210000_product_menu_options.sql`). La leen el menú público (`/api/menu`,
loader del navegador) y el sheet de producto del menú web. Hoy guarda dos formatos:

- `tamanos`: selección única con precio **absoluto** (reemplaza el precio base).
- `ajustes`: casillas con precio **adicional**.

No hace falta crear tablas nuevas (`product_option_groups` / `product_options`):
los grupos viven en `opciones_menu.grupos` y **solo se aplican si
`opciones_menu.activadas === true`**. Los productos actuales no se convierten.
El menú público recorta `grupos` cuando el interruptor está apagado, así el
payload de un producto simple sigue siendo el de siempre. Si el comercio
activa las opciones, los grupos viajan en la misma fila (cero queries extra
al abrir el detalle).

¿Por qué no `product_options_groups` / `product_options`? Esas tablas obligarían a:
una migración en la base de datos de producción (la app local usa esa misma base),
nuevas políticas RLS por tenant, un join o una query extra al cargar el menú, y
sincronizar el proyecto preview. El jsonb por producto cubre el caso (menos de 20
grupos por producto) con cero costo de lectura.

## Reporte por archivo

| Archivo | Función | Impacto | Cambio necesario | Riesgo |
|---|---|---|---|---|
| `lib/models/product.dart` | `ProductModel` (Flutter) | No lee `opciones_menu`. Al editar, el form no conoce las opciones | Agregar `opcionesMenu` (mapa crudo) + parser de `grupos` | Bajo. `toMap()` no se usa para escribir en la base de datos |
| `lib/screens/product_form_screen.dart` | `_FormPanel`, `_save()` | El payload no incluye `opciones_menu` (hoy no lo pisa) | Sección "Opciones del producto" debajo del precio. Guardar **mezclando**: conservar `tamanos`/`ajustes` y reemplazar solo `grupos` | Medio: si se escribiera `opciones_menu` sin mezclar, se perderían tamaños/ajustes existentes |
| `site/app/_lib/menu-product-options.ts` | parse, clave del carrito, precio unitario, etiqueta | El cliente y el servidor calculan el precio con estas funciones | Agregar `grupos`: parser, validación (obligatorio/mín/máx), precio, etiqueta, snapshot | Medio: la clave del carrito debe seguir siendo compatible (4 segmentos antiguos) |
| `site/app/v/[id]/_components/ProductOptionsSheet.tsx` | Detalle del producto en el menú | Solo muestra tamaños/ajustes | Mostrar grupos (radio/casillas), reglas y precio actualizado | Bajo: los productos sin opciones siguen igual |
| `site/app/v/[id]/page.tsx` | Carrito y checkout | Usa las funciones compartidas; envía `opciones: selection` | Sin cambios de lógica. La selección de grupos viaja en la misma `opciones` | Bajo |
| `site/app/api/orders/route.ts` | Crea el pedido (service role) | **Descarta `opciones`**. Confía en el precio unitario del cliente | Para líneas con selección: leer el producto de la base de datos (filtrado por `comercio_id`), validar reglas, recalcular el precio de los grupos y guardar el snapshot inmutable | Medio: el flujo de WhatsApp al comercio no se toca; solo se agregan campos a `detalles.items` |
| `site/app/api/_lib/public-order.ts` | Seguimiento público (repetir pedido) | Lee `item.opciones` como selección | Leer `seleccion` primero; ignorar `opciones` si es un array (snapshot) | Bajo |
| `site/app/orders/[orderId]/page.tsx` | Tracking y repetir pedido | Tipo de selección sin `grupos` | Agregar `grupos` al tipo | Bajo |
| `lib/models/pedido.dart` | `PedidoItemModel` | Solo `nombre`, `cantidad`, `precio` | Leer `producto`, `precio_base`, `opciones[]` | Bajo: los pedidos antiguos no traen estos campos |
| `lib/widgets/kitchen_order/kitchen_order_widgets.dart` | `KitchenPrepSection` | La cocina solo ve el nombre | Mostrar las opciones agrupadas (Tamaño: Grande / Extras: ✓ …) | Bajo |
| `lib/screens/order_detail_screen.dart` | Resumen del comercio y vista del cliente | `x2 Nombre` + total | Mostrar las opciones debajo del nombre | Bajo |
| `lib/screens/public_menu_view.dart` | Menú Flutter / pedido asistido | No soporta opciones (precio plano) | **Fuera de alcance** en esta fase (ver "Pendientes") | Los productos con grupos obligatorios se piden sin opciones desde el modo asistido |
| `supabase/functions/process-menu-*` | Importación de menú con IA | Solo escribe `precio` | Ninguno | Ninguno |
| WhatsApp al comercio (`notify-order`, `send-merchant-new-order-whatsapp.ts`) | Aviso de pedido nuevo | Solo total + link | **Ninguno** (no se toca) | Ninguno |

## Cómo funciona hoy

1. **Precio**: `productos.precio numeric` en la moneda base del comercio. `tamanos` reemplaza el precio; `ajustes` suma.
2. **Carrito (web)**: `Record<cartKey, cantidad>` en memoria. `cartKey = productId::tamano::servicio::ajustes`. El mismo producto con distinta selección genera líneas distintas.
3. **Pedido**: `POST /api/orders` guarda `detalles.items = [{product_id, nombre, cantidad, precio}]`. El `nombre` ya incluye las etiquetas de las opciones ("Campesina · Grande (G)").
4. **Cliente**: la card del kiosko abre `ProductOptionsSheet` (imagen, nombre, descripción, opciones, cantidad, Agregar).
5. **Vendedor**: `OrderDetailScreen` → `KitchenPrepSection` muestra `xN nombre`.

## Estructura de datos propuesta

`productos.opciones_menu`:

```json
{
  "tamanos": [],
  "ajustes": [],
  "grupos": [
    {
      "id": "g_k3f9a1",
      "nombre": "Tamaño",
      "tipo": "unica",
      "obligatorio": true,
      "min": 1,
      "max": 1,
      "opciones": [
        { "id": "o_p0x2c8", "nombre": "Pequeña", "precio": 0, "activo": true },
        { "id": "o_m1b7d4", "nombre": "Mediana", "precio": 1, "activo": true }
      ]
    }
  ]
}
```

Reglas normalizadas:

- `unica` implica `max = 1`.
- `obligatorio` implica `min >= 1`.
- No obligatorio implica `min = 0`.
- `min <= max`.
- Las opciones con `activo: false` no se muestran.

Selección en el carrito: `seleccion.grupos = { [grupoId]: [opcionId, ...] }`. Se agrega un
5.º segmento a la clave del carrito; las claves antiguas de 4 segmentos siguen funcionando.

Snapshot guardado en `pedidos.detalles.items[]`:

```json
{
  "product_id": "…",
  "nombre": "Hamburguesa Clásica · Grande · Tocineta",
  "producto": "Hamburguesa Clásica",
  "cantidad": 1,
  "precio": 8.5,
  "precio_base": 5,
  "opciones": [
    { "grupo": "Tamaño", "nombre": "Grande", "precio": 2 },
    { "grupo": "Extras", "nombre": "Tocineta", "precio": 1.5 }
  ],
  "precio_final": 8.5,
  "seleccion": { "grupos": { "g_…": ["o_…"] } }
}
```

- `nombre` y `precio` se mantienen para compatibilidad: recibo, app antigua, WhatsApp.
- El snapshot lo arma **el servidor** con los datos de la base de datos al momento del pedido. Si el comercio cambia precios después, el pedido histórico no cambia.
- Siempre se cumple: `precio_base + Σ opciones.precio = precio_final`.

## Seguridad y precio

Hoy el servidor confía en el precio unitario del cliente (riesgo existente, no nuevo).
Para las líneas con grupos, el servidor recalcula con las mismas funciones compartidas:

- Si el precio no coincide (el menú cambió o hay manipulación): responde 409 con un mensaje claro.
- Si faltan grupos obligatorios o se excede el máximo: responde 400.

Las líneas sin grupos mantienen el comportamiento actual.

## Rendimiento

- Sin queries nuevas al abrir el menú: las opciones vienen en la fila del producto.
- La caché actual del menú (5 s en el servidor y 6 h de respaldo en el navegador) sigue aplicando.
- Al crear un pedido: 1 query extra (productos del pedido filtrados por `comercio_id`), y solo si alguna línea trae opciones.

## Pendientes / fuera de alcance

- Menú Flutter (`public_menu_view.dart`, usado por el pedido asistido del comercio): sin UI de opciones.
- La edición de `tamanos`/`ajustes` antiguos desde el admin sigue sin UI (se conservan intactos al guardar).
