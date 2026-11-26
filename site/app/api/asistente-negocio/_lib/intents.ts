import { extractFxValue, parseLocaleNumber } from './fx';

export type BusinessIntent =
  | { kind: 'list_menu' }
  | { kind: 'propose_price'; productHint?: string; newPrice?: number }
  | { kind: 'propose_availability'; productHint?: string; available?: boolean }
  | { kind: 'change_image'; productHint?: string }
  | { kind: 'read_hours' }
  | { kind: 'propose_hours'; hoursText?: string }
  | { kind: 'propose_en_linea'; enLinea?: boolean }
  | { kind: 'recent_orders'; filter?: 'all' | 'pending' | 'today' }
  | { kind: 'home_metrics'; focus?: 'all' | 'sales' | 'customers' | 'orders' }
  | { kind: 'customers' }
  | { kind: 'order_detail'; hint: string }
  | { kind: 'currency'; setValue?: number }
  | { kind: 'membership' }
  | { kind: 'account'; mode?: 'password' | 'email' | 'menu' }
  | { kind: 'share_menu' }
  | { kind: 'refuse_sensitive' }
  | { kind: 'register' }
  | { kind: 'add_product' }
  | { kind: 'delete_product'; productHint?: string }
  | { kind: 'create_category'; raw?: string }
  | { kind: 'delete_category'; raw?: string }
  | { kind: 'list_payments' }
  | { kind: 'upsert_payment'; raw?: string }
  | { kind: 'delete_payment'; raw?: string }
  | { kind: 'read_delivery' }
  | {
      kind: 'set_delivery';
      enabled?: boolean;
      fixedPrice?: number;
      pricingType?: 'fixed' | 'distance' | 'zones' | 'area_zones' | 'free';
      zones?: Array<Record<string, unknown>>;
      areaZones?: Array<Record<string, unknown>>;
    }
  | { kind: 'create_promo'; raw?: string }
  | { kind: 'toggle_promo'; raw?: string; enabled?: boolean }
  | { kind: 'delete_promo'; raw?: string }
  | { kind: 'set_order_status'; raw?: string }
  | { kind: 'list_staff' }
  | { kind: 'invite_staff'; raw?: string }
  | { kind: 'revoke_staff'; raw?: string }
  | { kind: 'set_product_options'; raw?: string }
  | { kind: 'set_featured'; raw?: string; clear?: boolean }
  | { kind: 'set_product_image'; productHint?: string; imageUrl?: string; productId?: string }
  | { kind: 'update_profile'; nombre?: string; descripcionVisual?: string; whatsapp?: string }
  | {
      kind: 'unsupported';
      topic: 'payments' | 'delivery' | 'promo' | 'staff' | 'category' | 'order_status' | 'variations';
    }
  | { kind: 'select_comercio'; nameHint: string }
  | { kind: 'escalate_human'; reason?: string }
  | { kind: 'confirm_apply' }
  | { kind: 'cancel_confirm' }
  | { kind: 'chat'; reply: string }
  | { kind: 'help' };

/** Write-like intents that need confirm before apply. */
const WRITE_KINDS = new Set([
  'propose_price',
  'propose_availability',
  'propose_hours',
  'propose_en_linea',
  'add_product',
  'delete_product',
  'create_category',
  'delete_category',
  'upsert_payment',
  'delete_payment',
  'set_delivery',
  'create_promo',
  'toggle_promo',
  'delete_promo',
  'set_order_status',
  'invite_staff',
  'revoke_staff',
  'set_product_options',
  'set_featured',
  'set_product_image',
  'update_profile',
  'currency',
]);

/** True when rules already matched a concrete admin action (skip Gemini). */
export function isConcreteBusinessIntent(intent: BusinessIntent): boolean {
  return intent.kind !== 'help';
}

export function isWriteBusinessIntent(intent: BusinessIntent): boolean {
  return WRITE_KINDS.has(intent.kind);
}

export function foldText(s: string) {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function parsePrice(text: string): number | undefined {
  const m = text.match(
    /(?:a|por|precio(?:\s+a)?|dejar(?:lo)?(?:\s+en)?|poner(?:lo)?(?:\s+en)?|cuesta|vale|=)\s*\$?\s*(\d[\d.,]*\d|\d)/i,
  );
  const raw = m?.[1] ?? text.match(/\b(\d[\d.,]*\d|\d)\s*(?:usd|\$)?/i)?.[1];
  if (!raw) return undefined;
  return parseLocaleNumber(raw) ?? undefined;
}

/**
 * Split simple dual requests: "cierra … y dime …".
 * Avoids splitting product names like "arepa y queso".
 */
export function splitMultiUtterance(raw: string): string[] {
  const parts = raw
    .split(
      /\s+y\s+(?=(?:dime|muestr|consult|revis|cambi|pon(?:le|me)?|activ|cerr|abr|desactiv|manda|public|sube|baja|agrega|añade))/i,
    )
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length >= 2 ? parts.slice(0, 2) : [raw.trim()].filter(Boolean);
}

export function parseBusinessIntent(
  raw: string,
  opts?: { pendingOp?: string | null },
): BusinessIntent {
  const t = foldText(raw);
  const pendingOp = /^(hola|buenas|buenos dias|hey|gracias|listo|ok)\b/.test(t) ? null : opts?.pendingOp;

  // Only whole-message confirms — "sí pero…" must not apply a write.
  if (/^(si|sí|confirmar|confirma|aplicar|dale|ok|okay|acepto)[!?.]*$/.test(t)) {
    return { kind: 'confirm_apply' };
  }
  if (/^(no|cancelar|cancela|descartar)[!?.]*$/.test(t)) {
    return { kind: 'cancel_confirm' };
  }

  // Never reveal secrets — before account/password change helpers.
  if (
    /\b(codigo de (verificacion|acceso)|otp|clave api|api key|token de acceso|pin de seguridad)\b/.test(
      t,
    ) ||
    (/\b(envia|enviame|pasame|dame|dime|muestrame|revela|copia|quiero que me (des|muestres)|necesito que me des|necesito el)\b/.test(
      t,
    ) &&
      /\b(contrase[nñ]a|password|token|otp|pin|clave api|api key|codigo de (verificacion|acceso)|datos de acceso|telefono privado|teléfono privado)\b/.test(
        t,
      )) ||
    (/\b(contrase[nñ]a|password|token|otp|pin|clave api|api key|codigo de (verificacion|acceso)|telefono privado|teléfono privado|datos de acceso)\b/.test(
      t,
    ) &&
      /\b(otro|otra|due[nñ]o|competencia|vendedor|empleado|ajeno|propietario)\b/.test(t)) ||
    /\b(acceso de administrador de mi competencia)\b/.test(t)
  ) {
    return { kind: 'refuse_sensitive' };
  }

  if (
    /\b(hablar con (un )?humano|hablar con (un )?asesor|pasar a (un )?asesor|pasar a (un )?humano|soporte humano|atencion humana|atención humana|necesito ayuda humana|necesito un asesor|necesito que soporte|contactar soporte|quiero (un )?asesor|hablar con (una )?persona|atender(me)? (alguien|una persona|un asesor)|prefiero que me atienda|me pueden llamar|persona de soporte|asesor humano|persona del equipo|(un )?asesor (revise|humano)|necesito que (un )?asesor|quiero que (me )?contacten|quiero que una persona|soporte me explique)\b/.test(
      t,
    )
  ) {
    return { kind: 'escalate_human', reason: raw.trim().slice(0, 240) };
  }

  // "otro menú / otro negocio" must NOT fall into list_menu.
  if (
    /\b(otro negocio|nueva cuenta|nuevo negocio|segundo negocio|otro local|otra tienda|segunda sucursal|crear(me)? (un )?negocio|registrar(me)?|dos sucursales|cambiar de restaurante|negocios (que )?tengo)\b/.test(
      t,
    ) ||
    (/\b(menu|menú)\b/.test(t) &&
      /\b(otro|otra|nuevo|nueva|crear|segundo)\b/.test(t) &&
      /\b(negocio|local|comercio|tienda|cuenta|cafeteria|pasteleria)\b/.test(t))
  ) {
    return { kind: 'register' };
  }

  if (
    /\b(enlace|link|qr|codigo qr|compart(ir|e) (mi )?menu|compart(ir|e) (el )?menu|pasame el enlace|imprimir.*(qr|menu))\b/.test(
      t,
    )
  ) {
    return { kind: 'share_menu' };
  }

  // Payments
  if (/\b(metodos? de pago|métodos? de pago)\b/.test(t) && !/\b(agrega|añade|crea|quitar|elimina)\b/.test(t)) {
    return { kind: 'list_payments' };
  }
  if (
    /\b(quita|quitar|elimina|eliminar|borra|borrar)\b/.test(t) &&
    /\b(zelle|pago movil|pago móvil|metodo de pago|método de pago|efectivo)\b/.test(t)
  ) {
    return { kind: 'delete_payment', raw };
  }
  if (
    (/\b(metodo(s)? de pago|métodos? de pago|zelle|pago movil|pago móvil|transferencia)\b/.test(t) &&
      /\b(agrega|añade|crear|crea|configura|pon|nuevo|nueva)\b/.test(t)) ||
    /\bagrega(r|me)?\s+(un\s+)?(zelle|pago movil|pago móvil)\b/.test(t)
  ) {
    return { kind: 'upsert_payment', raw };
  }

  // Delivery
  if (
    /\b(delivery|domicilio)\b/.test(t) &&
    /\b(cierra|cerrar|apaga|desactiva|quita|paus)\w*\b/.test(t)
  ) {
    return { kind: 'set_delivery', enabled: false };
  }
  if (
    /\b(delivery|domicilio)\b/.test(t) &&
    /\b(zonas?|intervalos?|pol[ií]gonos?|mapa|km|distancia)\b/.test(t) &&
    /\b(agrega|añade|crear|crea|configura|pon|guarda|activa|activar)\b/.test(t)
  ) {
    const price = parsePrice(raw);
    const pricingType = /\bpol[ií]gonos?|mapa\b/.test(t)
      ? 'area_zones'
      : /\bkm|distancia\b/.test(t)
        ? 'distance'
        : 'zones';
    return { kind: 'set_delivery', enabled: true, fixedPrice: price, pricingType };
  }
  if (
    /\b(delivery|domicilio)\b/.test(t) &&
    /\b(abre|abrir|activa|activar|enciende|pon)\w*\b/.test(t)
  ) {
    const price = parsePrice(raw);
    return { kind: 'set_delivery', enabled: true, fixedPrice: price, pricingType: 'fixed' };
  }
  if (
    /\b(delivery|domicilio|zonas? de (delivery|envio|envío)|tarifa de (delivery|envio|envío))\b/.test(
      t,
    ) &&
    !/\b(pedido)\b/.test(t)
  ) {
    return { kind: 'read_delivery' };
  }

  // Promos
  if (
    /\b(promocion|promoción|promo|oferta)\b/.test(t) &&
    /\b(elimina|eliminar|borra|borrar|quita|quitar)\b/.test(t)
  ) {
    return { kind: 'delete_promo', raw };
  }
  if (
    /\b(promocion|promoción|promo|oferta)\b/.test(t) &&
    /\b(pausa|pausar|desactiva|desactivar|apaga)\b/.test(t)
  ) {
    return { kind: 'toggle_promo', raw, enabled: false };
  }
  if (
    /\b(promocion|promoción|promo|oferta)\b/.test(t) &&
    /\b(reactiva|reactivar|reanuda|reanudar)\b/.test(t)
  ) {
    return { kind: 'toggle_promo', raw, enabled: true };
  }
  if (
    /\b(promocion|promoción|promo|2x1|dos por uno|descuento|cupon|cupón|oferta)\b/.test(t) &&
    /\b(agrega|añade|crear|crea|activa|activar|nueva|nuevo|pon)\b/.test(t)
  ) {
    return { kind: 'create_promo', raw };
  }

  // Staff — revoke before list so “revoca acceso” no cae en listado
  if (
    /\b(revoca|revocar|quita(r)? acceso|elimina(r)? (al )?empleado|desactiva(r)? (al )?miembro)\b/.test(
      t,
    ) ||
    (/\b(trabajador|empleado|invitaci[oó]n|miembro|acceso)\b/.test(t) &&
      /\b(revoca|quita|eliminar|desactiva)\b/.test(t))
  ) {
    return { kind: 'revoke_staff', raw };
  }
  if (
    /\b(equipo|trabajadores|empleados|miembros)\b/.test(t) &&
    !/\b(invita|agrega|añade|revoca)\b/.test(t) &&
    !/@/.test(t)
  ) {
    return { kind: 'list_staff' };
  }
  if (
    /\b(invita|invitar|agrega(r)? (un )?empleado|agrega(r)? (un )?trabajador|nuevo (cajero|mesero|cocinero))\b/.test(
      t,
    ) ||
    (/\b(trabajador|empleado|cajero|mesero|cocinero)\b/.test(t) &&
      /\b(invita|agrega|añade)\b/.test(t))
  ) {
    return { kind: 'invite_staff', raw };
  }

  // Categories
  if (
    (/\b(categoria|categoría|categorias|categorías)\b/.test(t) &&
      /\b(elimina|eliminar|borra|borrar|quita|quitar)\b/.test(t)) ||
    /\b(elimina|borra)\s+(la\s+)?categor/.test(t)
  ) {
    return { kind: 'delete_category', raw };
  }
  if (
    (/\b(categoria|categoría|categorias|categorías)\b/.test(t) &&
      /\b(agrega|añade|crear|crea|nueva|nuevo)\b/.test(t)) ||
    /\b(crea|crear)\s+(una\s+)?categor/.test(t)
  ) {
    return { kind: 'create_category', raw };
  }

  // Order status change
  if (
    /\b(pedido|orden)\b/.test(t) &&
    /\b(entregado|en camino|despachad|confirmad|cancel|anul|marcar como|cambiar (el )?estado|listo|prepar)\w*\b/.test(
      t,
    )
  ) {
    return { kind: 'set_order_status', raw };
  }

  // Featured / upsell badge
  if (
    /\b(destaca(r|do)?|mas pedido|más pedido|mejor valor|upsell)\b/.test(t) &&
    !/\b(quita|quitar|sacar)\b/.test(t)
  ) {
    return { kind: 'set_featured', raw, clear: false };
  }
  if (/\b(quita|quitar)\b/.test(t) && /\b(destacado|badge)\b/.test(t)) {
    return { kind: 'set_featured', raw, clear: true };
  }

  // Variations / sizes / extras → opciones_menu (Flutter product editor contract)
  if (
    /\b(variacion|variación|tamanos?|tamaños?|extras?|complementos?|opciones del menu|opciones del menú|grupos? de opciones)\b/.test(
      t,
    ) &&
    /\b(agrega|añade|crear|crea|edita|configura|pon)\b/.test(t)
  ) {
    return { kind: 'set_product_options', raw };
  }

  // Delete product
  if (
    /\b(elimina|eliminar|borra|borrar|quita|quitar)\b/.test(t) &&
    /\b(producto|plato|pizza|hamburguesa|arepa)\b/.test(t)
  ) {
    return { kind: 'delete_product', productHint: raw };
  }

  if (
    (/\b(agregar|añadir|añade|agrega|incorpora|nuevo producto|producto nuevo|producto llamado)\b/.test(
      t,
    ) ||
      (/\b(crea|crear)\b/.test(t) &&
        /\b(producto|plato|combo|arepa|pizza|hamburguesa|bebida|ensalada|menu infantil|menú infantil)\b/.test(
          t,
        )) ||
      /\bagrega(me)?\s+(una?\s+)?(pizza|hamburguesa|arepa)\b/.test(t)) &&
    !/\b(foto|imagen|tasa|anuncio|promocion|promoción|pago|zelle|delivery|domicilio|categoria|categoría|empleado|trabajador)\b/.test(
      t,
    )
  ) {
    return { kind: 'add_product' };
  }
  const mentionsRateWord =
    /\b(tasa|moneda|dolar|dolares|bolivares|bcv|divisa|cambio de moneda|tasa de cambio)\b/.test(t);
  const mentionsPesoOnly =
    /\b(pesos?|cop)\b/.test(t) &&
    /\b(tasa|recib|cobr|cambi|convert|equival|cotiz|vale el|a cuanto|cuanto (esta|vale)|actualiz|pon|deja|establec)/.test(t) &&
    !/\b(precio|producto|plato|combo|pizza|hamburguesa|arepa|bebida|categoria|costo|cuesta|delivery|domicilio|envio|pedido)\b/.test(t);
  if (mentionsRateWord || mentionsPesoOnly) {
    const setValue = extractFxValue(raw) ?? undefined;
    return { kind: 'currency', setValue };
  }
  if (
    /\b(descripcion del negocio|descripción del negocio|cambia(r)? (el )?nombre|mi whatsapp|logo del negocio)\b/.test(
      t,
    )
  ) {
    return { kind: 'update_profile' };
  }
  if (
    /\b(membres[ií]a|membresia|suscripci[oó]n|subscription|mi plan|el plan|que plan|qué plan|facturaci[oó]n|billing|renovar|cu[aá]nto (tiempo|falta).*(pagar|membres|plan)|cu[aá]nto (me )?(toca|debo|tengo que) pagar|cuando (pago|vence)|fecha de corte|pr[oó]ximo pago|plan (anual|actual|contratado))\b/.test(
      t,
    )
  ) {
    return { kind: 'membership' };
  }
  if (
    /\b(cambiar contrase[nñ]a|nueva contrase[nñ]a|olvide mi contrase|olvidé mi contrase|recuperar (el )?acceso|reset(ear)? (la )?pass|cambiar (el )?email|cambiar (el )?correo|mi cuenta|actualizar (email|correo|contrase)|cambiar la clave)\b/.test(
      t,
    )
  ) {
    if (/\b(email|correo)\b/.test(t)) return { kind: 'account', mode: 'email' };
    if (/\b(contrase|pass|clave|acceso)\b/.test(t)) return { kind: 'account', mode: 'password' };
    return { kind: 'account', mode: 'menu' };
  }
  if (
    /\b(detalle (del |de |del)?pedido|ver pedido|pedido (numero|número|#)?\s*\d+|pedido [a-f0-9]{6,}|ref(erencia)? [a-f0-9]{6,})\b/.test(
      t,
    )
  ) {
    return { kind: 'order_detail', hint: raw.trim().slice(0, 120) };
  }

  // Names before "clientes" count / metrics.
  if (
    /\b(nombres? de (los )?clientes|lista de clientes|quienes (son|pidieron|compraron)|quiénes (son|pidieron|compraron)|clientes (recientes|que pidieron|que mas compran|que más compran)|dame (los )?(nombres? de )?(los )?clientes|dale (el |los )?nombres? de (los )?clientes|ultimo cliente|último cliente|quien fue el ultimo)\b/.test(
      t,
    )
  ) {
    return { kind: 'customers' };
  }

  // Pending / today order lists before generic "cuántos pedidos" metrics.
  if (/\b(pedidos|ordenes|órdenes|ultimos pedidos|últimos pedidos)\b/.test(t)) {
    if (/\b(pendiente|pendientes)\b/.test(t)) {
      return { kind: 'recent_orders', filter: 'pending' };
    }
    if (/\bhoy\b/.test(t) && !/\bcuant[oa]s?\b/.test(t)) {
      return { kind: 'recent_orders', filter: 'today' };
    }
    if (!/\bcuant[oa]s?\b/.test(t)) {
      return { kind: 'recent_orders', filter: 'all' };
    }
  }

  if (
    /\b(resumen( de)? hoy|como va( el)? (dia|día|negocio)|cómo va( el)? (dia|día|negocio)|ventas( de)? hoy|cuanto(s)? (he )?vendido|cuánto(s)? (he )?vendido|cuanto vendimos|cuánto vendimos|ticket prom|promedio que gasta)\b/.test(
      t,
    ) ||
    (/\bcuant[oa]s?\b/.test(t) &&
      /\b(clientes|pedidos|ventas)\b/.test(t) &&
      !/\b(pendiente|pendientes)\b/.test(t)) ||
    (/\bhoy\b/.test(t) && /\b(ventas|resumen|vendi|vendí|vendimos)\b/.test(t))
  ) {
    let focus: 'all' | 'sales' | 'customers' | 'orders' = 'all';
    if (/\bclientes?\b/.test(t)) focus = 'customers';
    else if (/\bventas?\b|\bvendido\b|\bvendimos\b|\bvendi\b|\bvendí\b/.test(t)) focus = 'sales';
    else if (/\bpedidos?\b/.test(t)) focus = 'orders';
    return { kind: 'home_metrics', focus };
  }

  if (/\b(pedidos|ordenes|órdenes|ultimos pedidos|últimos pedidos)\b/.test(t)) {
    return { kind: 'recent_orders', filter: 'all' };
  }
  if (/\b(foto|imagen|picture|logo)\b/.test(t) && !/\b(enlace|link|qr)\b/.test(t)) {
    return { kind: 'change_image', productHint: raw };
  }

  if (/\b(horario|horarios)\b/.test(t)) {
    if (
      /\b(cambiar|actualizar|modificar|poner|dejar|atender|correge|corrige|ajustar|configurar)\b/.test(
        t,
      ) ||
      /:\s*\d/.test(raw) ||
      /\b\d{1,2}:\d{2}\b/.test(t)
    ) {
      return { kind: 'propose_hours', hoursText: raw.trim() };
    }
    return { kind: 'read_hours' };
  }

  // Product availability BEFORE open/close — "activa Campesina" ≠ abrir el local.
  const availOff =
    /\b(agotad[oa]|agotar|agota|agoto|se agoto|se agotó|no disponible|desactivar|desactiva|ocultar|oculta|ocultalo|inhabilitar|inhabilita|deshabilitar|deshabilita)\b/.test(
      t,
    );
  const availOn =
    /\b(activar|activa|activo|habilitar|habilita|habilito|reactiva|reactivar|disponibilizar|desagotar|marcar como disponible|pon(?:er)? disponible|deja(?:r)? disponible)\b/.test(
      t,
    ) || /\bdisponible\b/.test(t);
  const availLocal =
    /\b(local|negocio|comercio|tienda|menu|menú|caja|en linea|en línea)\b/.test(t);
  if (
    pendingOp === 'edit_availability' ||
    ((availOn || availOff) && !availLocal) ||
    (/\b(agotado|agotar|agotada|ocultar producto)\b/.test(t) && availLocal === false)
  ) {
    return {
      kind: 'propose_availability',
      productHint: raw,
      available: !availOff,
    };
  }

  if (
    /\b(abrir|abre|encender|poner online|en linea|en línea|activar el local|activar el negocio|aparece abierto|esta abierto|está abierto)\b/.test(
      t,
    )
  ) {
    return { kind: 'propose_en_linea', enLinea: true };
  }
  if (
    /\b(cerrar|cierra|apagar|poner offline|fuera de linea|fuera de línea|cerrar caja|cerrar por hoy)\b/.test(
      t,
    ) &&
    !/\b(producto|plato|item)\b/.test(t)
  ) {
    return { kind: 'propose_en_linea', enLinea: false };
  }
  if (/\b(estado|estoy abierto|estas abierto|estás abierto)\b/.test(t)) {
    return { kind: 'propose_en_linea' };
  }

  // Price: explicit price language OR "cuánto cuesta X".
  if (pendingOp === 'set_fx' && /\d/.test(t)) {
    return { kind: 'currency', setValue: extractFxValue(raw) ?? undefined };
  }
  if (
    (pendingOp === 'edit_price' && /\d/.test(t)) ||
    /\bprecio\b/.test(t) ||
    /\b(cuanto cuesta|cuánto cuesta|cuanto vale|cuánto vale)\b/.test(t) ||
    (/\b(cambiar|actualizar|modificar|subir|bajar|dejar|pon|coloca|aumenta|baja)\b/.test(t) &&
      /\b(precio|precios|cuesta|costo|vale|\$|usd|bs|\d)\b/.test(t))
  ) {
    return {
      kind: 'propose_price',
      productHint: raw,
      newPrice: parsePrice(raw),
    };
  }

  // Browse menu / products / category lists.
  if (
    /^(ver menu|ver menú|mostrar menu|mostrar menú|productos|carta|precios)$/.test(t) ||
    /\b(ver (el )?menu|ver (el )?menú|mostrar (el )?menu|mostrar (el )?menú|lista de productos|ver productos|ver carta|ver precios|muestrame (todos )?los productos|muéstrame (todos )?los productos|productos (que )?tengo|listar|categoria|categoría|bebidas|desayunos|postres)\b/.test(
      t,
    )
  ) {
    return { kind: 'list_menu' };
  }

  if (
    (/\b(usar|seleccionar|elegir|cambiar (a|al)|seguir con)\b/.test(t) &&
      /\b(negocio|local|comercio|tienda)\b/.test(t)) ||
    (/^(usar|seleccionar|elegir)\b/.test(t) && t.length < 120)
  ) {
    return { kind: 'select_comercio', nameHint: raw };
  }

  return { kind: 'help' };
}

/**
 * Up to 2 concrete intents for simple multi utterances.
 * Prefer executing reads + at most one write (caller enforces).
 */
export function parseBusinessIntents(
  raw: string,
  opts?: { pendingOp?: string | null },
): BusinessIntent[] {
  const chunks = splitMultiUtterance(raw);
  if (chunks.length < 2) return [parseBusinessIntent(raw, opts)];

  const intents = chunks
    .map((c) => parseBusinessIntent(c, opts))
    .filter((i) => i.kind !== 'help' && i.kind !== 'chat');

  if (intents.length >= 2) return intents.slice(0, 2);
  return [parseBusinessIntent(raw, opts)];
}


/**
 * Short answers to a question the assistant just asked ("5000", "en pesos", "sí en COP")
 * must continue the previous task instead of falling to a generic help.
 */
export function inferFollowUpIntent(
  raw: string,
  lastAssistantText: string | null | undefined,
  priorUserTexts: string[] = [],
): BusinessIntent | null {
  const prev = foldText(lastAssistantText || '');
  if (!prev) return null;
  const t = foldText(raw);
  const bareNumber = /^\$?\s*\d[\d.,]*\s*(pesos?|cop|bs|bolivares|ves|usd|dolares?|euros?)?\s*[.!]*$/.test(t);
  const askedFx = /nuevo valor|tasa|de cual moneda|cambiamos la tasa/.test(prev);
  if (askedFx && (bareNumber || /^(en |a )?(pesos?|cop|bolivares|bs|ves|dolares?|usd)\b/.test(t))) {
    let value = extractFxValue(raw);
    if (value == null) {
      for (const prevUser of [...priorUserTexts].reverse()) {
        if (/(tasa|peso|dolar|bolivar|cambio|recib|cobr)/.test(foldText(prevUser))) {
          value = extractFxValue(prevUser);
          if (value != null) break;
        }
      }
    }
    return { kind: 'currency', setValue: value ?? undefined };
  }

  // "¿A cuánto lo dejamos?" → bare number applies to the product the assistant just named.
  const askedPrice = /a cuanto lo dejamos/.test(prev);
  if (askedPrice && bareNumber) {
    const name = /\*([^*]{2,80})\*/.exec(lastAssistantText || '')?.[1]?.trim();
    const price = parsePrice(raw);
    if (name && price != null) return { kind: 'propose_price', productHint: name, newPrice: price };
  }

  // The assistant asked "which product?" → the answer is the product; replay the earlier request.
  const askedWhich =
    /de cual producto|encontre varios parecidos|no encontre ese producto|para que producto|para cual es|cual de esos es/.test(
      prev,
    );
  if (askedWhich && t.length >= 2 && t.length <= 80 && !/^(no|cancel|ver menu|menu|ayuda)\b/.test(t)) {
    for (const prior of [...priorUserTexts].reverse()) {
      const pi = parseBusinessIntent(prior);
      if (pi.kind === 'propose_price') return { ...pi, productHint: raw };
      if (pi.kind === 'propose_availability') return { ...pi, productHint: raw };
      if (pi.kind === 'change_image') return { kind: 'change_image', productHint: raw };
    }
  }
  return null;
}