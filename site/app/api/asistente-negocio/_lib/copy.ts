import type { WaHandoffPayload } from '../../_lib/wa-handoff';
import type { BusinessShop } from './auth';
import type { ShopHomeMetrics } from './tools';

/** Caracas wall-clock greeting — same as dashboard home. */
export function timeGreetingEs(now = new Date()): string {
  const hour = new Date(now.getTime() - 4 * 60 * 60 * 1000).getUTCHours();
  if (hour < 12) return 'Buenos días';
  if (hour < 19) return 'Buenas tardes';
  return 'Buenas noches';
}

function formatMoney(amount: number, moneda: string | null): string {
  const rounded = Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
  return moneda ? `${rounded} ${moneda}` : rounded;
}

/** Home-style intro when the merchant already has a shop selected. */
export function homeGreetingText(
  shop: BusinessShop,
  metrics: ShopHomeMetrics | null,
): string {
  const name = shop.nombre.trim() || 'tu negocio';
  const hello = `¡${timeGreetingEs()}, *${name}*! 👋`;
  const status =
    shop.enLinea === true
      ? '🟢 Tu menú está visible y listo para pedidos.'
      : shop.enLinea === false
        ? '🔴 Tu menú está oculto al público. ¿Lo abrimos?'
        : '⚪️ Cuéntame si quieres abrir o cerrar el menú.';

  let metricsBlock: string;
  if (!metrics) {
    metricsBlock = 'Hoy todavía no pude cargar el resumen 🙈 — igual te ayudo con lo que necesites.';
  } else if (metrics.ordersToday === 0) {
    metricsBlock = 'Hoy aún no hay pedidos. Cuando entren, te los resumo aquí 📊';
  } else {
    const ticket =
      metrics.ordersToday > 0
        ? formatMoney(metrics.salesToday / metrics.ordersToday, shop.moneda)
        : '—';
    metricsBlock = [
      'Resumen de *hoy*:',
      `• 🧾 Pedidos: *${metrics.ordersToday}*`,
      `• 💵 Ventas: *${formatMoney(metrics.salesToday, shop.moneda)}*`,
      `• 👥 Clientes: *${metrics.customersToday}*`,
      `• 🎟️ Ticket prom.: *${ticket}*`,
    ].join('\n');
  }

  // Options live only in the bottom chip bar — never duplicated here.
  return `${hello}\n\n${status}\n\n${metricsBlock}\n\n¿Qué hacemos? Usa la barra de abajo o escríbeme 🍕`;
}

/** Human labels for WhatsApp handoff operations (never show raw keys like `set_fx`). */
const HANDOFF_OP_LABEL: Record<string, string> = {
  set_fx: 'el cambio de tasa',
  edit_price: 'el cambio de precio',
  edit_products: 'la edición de productos',
  set_availability: 'la disponibilidad de productos',
  set_delivery: 'la configuración de delivery',
  menu_links: 'tus enlaces del menú',
  set_hours: 'el cambio de horario',
  admin_settings: 'el ajuste de tu negocio',
  admin_help: 'tu consulta',
  register_business: 'el registro de tu negocio',
};

/** Friendly label for the pending handoff operation, or null when unknown. */
export function handoffOperationLabel(op: string | null | undefined): string | null {
  const key = (op ?? '').trim();
  return key ? HANDOFF_OP_LABEL[key] ?? null : null;
}

/**
 * Hint shown to the merchant for a WhatsApp handoff: a human label, never an internal key.
 */
export function humanHandoffHint(payload: WaHandoffPayload | null): string | null {
  if (!payload) return null;
  const label = handoffOperationLabel(payload.pendingOperation);
  if (label) return label;
  const candidates = [payload.pendingOperation, payload.conversationHint, payload.summary];
  for (const raw of candidates) {
    const v = (raw ?? '').trim();
    if (!v) continue;
    // Skip snake_case keys and "key · Shop" summaries.
    if (/^[a-z]+(?:_[a-z]+)+(?:\s*·.*)?$/.test(v)) continue;
    return v.slice(0, 160);
  }
  return null;
}

/** Short WhatsApp-style lines — human, warm, never walls of text. */
export function greetingText(
  payload: WaHandoffPayload | null,
  authenticated: boolean,
): string {
  if (payload?.pendingOperation === 'edit_price' || payload?.intent?.includes('edit_price')) {
    const hint = payload.conversationHint || 'ese cambio de precio';
    if (!authenticated) {
      return `¡Ey! 👋 Seguimos con *${hint}*.\n\nEntra aquí mismito (abajo) y lo resolvemos juntos ✨`;
    }
    return `¡Listo! 🙌 Seguimos con *${hint}*.\n\nTe preparo el cambio y tú solo confirmas aquí en el chat ✅`;
  }
  if (payload?.pendingOperation === 'register_business') {
    const name = payload.businessNameDraft ? ` *${payload.businessNameDraft}*` : '';
    if (!authenticated) {
      return `¡Qué bien! 🎉 Vamos a crear tu negocio${name}.\n\nRegístrate o entra aquí abajo — no hace falta salir del chat 💬`;
    }
    return `¡Dale! 🚀 Seguimos el registro${name}. Dime cómo se llama el local y te guío paso a paso.`;
  }
  const opLabel = handoffOperationLabel(payload?.pendingOperation);
  if (opLabel) {
    if (!authenticated) {
      return `¡Hola! 👋 Seguimos con *${opLabel}*.\n\nEntra aquí abajo y lo resolvemos juntos ✨`;
    }
    return `¡Hola de nuevo! 🙌 Seguimos con *${opLabel}*.\n\nDime cómo lo quieres y te lo preparo; tú solo confirmas aquí en el chat ✅`;
  }
  if (payload?.conversationHint) {
    return `¡Hola de nuevo! 😊 Retomamos: *${payload.conversationHint}*`;
  }
  if (authenticated) {
    return `¡Hola! 👋 Soy tu asistente de *elmenuxfa.com*.\n\nEn un momentito te muestro cómo va tu negocio y qué podemos hacer desde aquí 💬`;
  }
  return `¡Hola! 👋 Soy tu asistente de *elmenuxfa.com*.\n\nEstoy para ayudarte a manejar tu negocio *sin salir de este chat* 💬\n\nEntra o regístrate aquí abajo y te doy la bienvenida como en el inicio ✨`;
}

export function needsAuthText(handoffStale: boolean): string {
  if (handoffStale) {
    return `Para seguir necesito que entres con tu cuenta 🔐\n\nUsa la tarjetita de abajo y retomamos justo donde lo dejaste 💪`;
  }
  return `Para ver tu menú o cambiar algo, necesito que entres 🔐\n\nUsa la tarjetita de abajo — *no tienes que ir a ningún otro lado* 🙌`;
}

export function noBusinessText(): string {
  return `Hmm, aún no veo un negocio en tu cuenta 🧐\n\n¿Lo registramos ahora? Dime el nombre del local y te ayudo desde aquí 🏪`;
}

export function multiBusinessText(names: string[]): string {
  const list = names.map((n) => `• ${n}`).join('\n');
  return `Tienes varios negocios 👀\n\n${list}\n\n¿Con cuál seguimos? Escribe el nombre ✍️`;
}

export function helpText(shopName: string, enLinea: boolean | null): string {
  const status =
    enLinea === true ? '🟢 en línea' : enLinea === false ? '🔴 fuera de línea' : '⚪️';
  return `Estoy con *${shopName}* (${status}).\n\nToca lo que necesites en la barra de abajo — o escríbeme lo que necesites 💬`;
}

export function rateLimitText(): string {
  return `Uy, vas muy rápido 😅 Espera un momentito y me escribes de nuevo.`;
}
