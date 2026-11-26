/**
 * Central brain knowledge base — only facts we can stand behind.
 * Anything not listed here is answered honestly ("no lo tengo confirmado") and
 * offered to a human advisor, never invented.
 */

import { fold } from './topics';

export type FeatureAnswer = { id: string; re: RegExp; answer: string };

const ADVISOR_TAIL =
  'Si quieres el detalle exacto para tu caso, te registro con un asesor y te contacta.';

/** Order matters: first match wins. Regexes run on folded text. */
export const FEATURE_KB: FeatureAnswer[] = [
  {
    id: 'multi_business',
    re: /\b(dos|varios|mas de un|otro) (restaurantes?|negocios?|locales?)|misma cuenta\b/,
    answer:
      'Sí, una misma cuenta puede manejar más de un negocio y cambias entre ellos desde tu panel (app.elmenuxfa.com). Cada negocio tiene su propio menú y enlace.',
  },
  {
    id: 'multi_user',
    re: /\b(varios usuarios|varios empleados|empleados|colaboradores|equipo|meseros?|cocina)\b/,
    answer:
      'Sí, puedes darle acceso a tu equipo con distintos roles (administrador, cocina, marketing o mesero), según lo que cada persona deba poder hacer.',
  },
  {
    id: 'whatsapp_orders',
    re: /\b(pedidos por whatsapp|recibir pedidos por whatsapp|whatsapp)\b.*\b(pedido|pedidos)\b|\b(pedido|pedidos)\b.*\bwhatsapp\b/,
    answer:
      'Sí: tus clientes arman el pedido en tu menú digital y te lo envían por WhatsApp con el detalle ya ordenado; además lo ves en tu panel.',
  },
  {
    id: 'phone_computer',
    re: /\b(desde (mi )?(telefono|celular|computadora|pc|laptop)|computadora|celular)\b/,
    answer:
      'Sí, puedes manejar todo desde el teléfono o desde una computadora entrando a app.elmenuxfa.com; tus clientes ven el menú desde el navegador, sin instalar nada.',
  },
  {
    id: 'photos',
    re: /\b(fotos?|imagenes?)\b/,
    answer: 'Sí, puedes subir foto de cada producto y también tu logo y portada para que el menú se vea como tu negocio.',
  },
  {
    id: 'branding',
    re: /\b(logo|colores|portada|marca)\b/,
    answer:
      'Sí puedes colocar tu logo y portada. Sobre personalizar los colores exactos no tengo la confirmación a la mano, así que prefiero no prometerlo. ' +
      ADVISOR_TAIL,
  },
  {
    id: 'qr_tables',
    re: /\b(qr|codigo qr).*(mesa|mesas)|\b(mesa|mesas).*(qr)\b/,
    answer:
      'Sí: tu menú tiene un enlace y un código QR; puedes poner el QR en cada mesa para que el cliente vea el menú desde su teléfono.',
  },
  {
    id: 'qr_print_both',
    re: /\b(imprimir|qr).*(instagram|enlace)|\b(instagram).*(qr)\b|al mismo tiempo/,
    answer:
      'Sí, puedes usar el QR en las mesas y el enlace en Instagram a la vez: ambos llevan al mismo menú y se mantienen actualizados cuando cambias algo.',
  },
  {
    id: 'qr',
    re: /\b(qr|codigo qr|imprimir mis codigos)\b/,
    answer:
      'Sí: cada negocio tiene un enlace de menú y un código QR que puedes imprimir o compartir, según la configuración de tu negocio. Cuando el menú cambia, el QR sigue funcionando igual.',
  },
  {
    id: 'instagram_link',
    re: /\b(instagram|enlace personalizado|link personalizado|compartir mi menu)\b/,
    answer:
      'Sí, tu menú tiene su propio enlace (elmenuxfa.com/v/tu-negocio) que puedes poner en Instagram, WhatsApp o donde quieras.',
  },
  {
    id: 'currencies',
    re: /\b(dolares|bolivares|moneda|bs)\b/,
    answer:
      'Sí, puedes mostrar precios en dólares y aceptar bolívares a tasa BCV; el cliente elige la moneda al pedir según lo que tú aceptes.',
  },
  {
    id: 'fx_update',
    re: /\b(tasa|cambio)\b/,
    answer:
      'La tasa la manejas desde tu panel (Configuración → Tasas y cobros) y los precios en bolívares se calculan con ella. Si quieres, el asistente del negocio también la cambia por ti.',
  },
  {
    id: 'payment_methods',
    re: /\bmetodos? de pago\b|\bformas? de pago\b/,
    answer:
      'Sí, configuras qué métodos de pago acepta tu negocio (efectivo, Zelle, pago móvil, etc.) y se muestran públicos en tu menú.',
  },
  {
    id: 'promo',
    re: /\b(promocion|promociones|oferta|ofertas)\b/,
    answer: 'Sí, puedes mostrar promociones y precios de oferta en tus productos para destacarlos en el menú.',
  },
  {
    id: 'availability',
    re: /\b(agotado|agotados|disponibilidad|disponible)\b/,
    answer:
      'Sí, puedes marcar cualquier producto como agotado o disponible en cualquier momento; el menú público lo refleja. Y si prefieres, el asistente del negocio lo hace por ti.',
  },
  {
    id: 'change_prices',
    re: /\b(cambiar|cambio|actualizar|modificar) (los )?precios?\b|\bcambiar los precios\b/,
    answer:
      'Sí, puedes cambiar tus precios cuando quieras desde el panel (o pidiéndoselo al asistente del negocio) y el menú público se actualiza.',
  },
  {
    id: 'few_products',
    re: /\b(pocos productos|agregar mas despues|empezar con poco)\b/,
    answer: 'Sí, puedes arrancar con pocos productos y seguir agregando más cuando quieras, sin complicarte.',
  },
  {
    id: 'setup_help',
    re: /\b(ayudan a configurar|configurar el menu|configure el menu|cargar mis productos)\b/,
    answer:
      'Puedes armarlo tú desde el panel, y yo te voy guiando paso a paso por aquí. Si prefieres que alguien del equipo te acompañe en la configuración, te registro con un asesor.',
  },
  {
    id: 'excel',
    re: /\b(excel|importar|csv)\b/,
    answer:
      'No tengo confirmada la carga masiva desde Excel y prefiero no prometértela. Lo que sí puedes es cargar tus productos desde el panel. ' +
      ADVISOR_TAIL,
  },
  {
    id: 'inventory',
    re: /\b(inventario|stock)\b/,
    answer:
      'Hoy puedes marcar productos como agotados o disponibles. Sobre control de inventario con cantidades no tengo confirmación, así que no te lo prometo. ' +
      ADVISOR_TAIL,
  },
  {
    id: 'notifications',
    re: /\b(notificacion|notificaciones|avis\w+)\b/,
    answer:
      'Los pedidos te llegan por WhatsApp apenas el cliente los envía, y los puedes ver también en tu panel. ' +
      'El detalle de otros tipos de aviso te lo confirma un asesor si lo necesitas.',
  },
  {
    id: 'print',
    re: /\b(imprimir los pedidos|comanda|cocina)\b/,
    answer:
      'No tengo confirmada la impresión directa de pedidos en cocina, así que prefiero no prometértela. ' + ADVISOR_TAIL,
  },
  {
    id: 'reports',
    re: /\b(reporte|reportes|ventas|vendi|estadisticas)\b/,
    answer:
      'El panel te muestra la actividad de tu negocio (pedidos y visitas al menú, incluidos escaneos del QR). Para ver cifras de tu propio negocio hay que entrar con tu sesión; te lo detallo cuando estés registrado. ' +
      'Sobre reportes de ventas más avanzados no tengo la confirmación, y no quiero decirte algo incorrecto.',
  },
  {
    id: 'highlight',
    re: /\b(destacar|mas vendidos|mas pedidos)\b/,
    answer:
      'Puedes organizar tu menú por categorías y mostrar promociones para destacar lo que más quieres vender. Sobre una etiqueta automática de "más vendido" no tengo confirmación. ' +
      ADVISOR_TAIL,
  },
  {
    id: 'no_food_stores',
    re: /\b(tiendas|productos y no comida|no comida|solamente con restaurantes|solo (con )?restaurantes)\b/,
    answer:
      'ElMenúXFA está pensado para restaurantes y comercios que venden por menú (comida, bebidas, postres, tiendas). Cuéntame qué vendes y te digo cómo encaja.',
  },
  {
    id: 'delivery_how',
    re: /\b(delivery|domicilio|retiro)\b/,
    answer:
      'Cada negocio configura sus opciones de pedido: delivery con sus zonas y tarifas, retiro en el local, o ambos. Un negocio que solo vende por delivery también puede usarlo. Lo configuras en el panel.',
  },
  {
    id: 'cancel',
    re: /\b(cancelar|darme de baja)\b/,
    answer:
      'No tengo publicadas las condiciones exactas de cancelación y no quiero inventarlas. ' + ADVISOR_TAIL,
  },
  {
    id: 'billing',
    re: /\b(pago de la suscripcion|como se paga|forma de pago de la)\b/,
    answer:
      'No tengo publicado aquí el método exacto de cobro de la suscripción y prefiero no inventarlo. ' + ADVISOR_TAIL,
  },
];

export function matchFeature(text: string): FeatureAnswer | null {
  const t = fold(text);
  for (const row of FEATURE_KB) if (row.re.test(t)) return row;
  return null;
}

/** Honest follow-ups to prepend when a pricing question touches unpublished conditions. */
export function pricingNote(text: string): string | null {
  const t = fold(text);
  if (/\b(prueba|probar|gratis)\b/.test(t)) {
    return 'No tengo publicado un período de prueba gratuito, así que no te lo prometo.';
  }
  if (/\b(costo adicional|comision|por cada pedido)\b/.test(t)) {
    return 'En lo publicado no figura un cobro adicional por pedido; lo que ves abajo es lo vigente.';
  }
  if (/\b(dejo de pagar|no pago|atras)\b/.test(t)) {
    return 'Las reglas exactas si se vence un mes no las tengo publicadas, y no quiero decirte algo incorrecto.';
  }
  if (/\b(cambiar de plan|cambio de plan)\b/.test(t)) {
    return 'El cambio de plan lo confirma un asesor según tu caso.';
  }
  if (/\b(cancelar|pago de la suscripcion|como se paga)\b/.test(t)) {
    return 'Sobre el método de pago y la cancelación no tengo detalle publicado y no quiero inventarlo.';
  }
  if (/\b(incluye|economico|barato)\b/.test(t)) {
    return null;
  }
  return null;
}

export const ADVISOR_OFFER = ADVISOR_TAIL;
