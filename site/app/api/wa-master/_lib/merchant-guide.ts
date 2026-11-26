/**
 * Human merchant guidance: acknowledge shop → explain panel steps → offer assistant.
 * Never ask for passwords on WhatsApp.
 */

import type { WaMasterComercioRef } from './types';

export type MerchantHelpTopic =
  | 'fx'
  | 'price'
  | 'product'
  | 'availability'
  | 'delivery'
  | 'links'
  | 'hours'
  | 'settings'
  | 'generic';

export function detectMerchantHelpTopic(text: string): MerchantHelpTopic | null {
  const t = text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  if (!t.trim()) return null;
  if (/\b(tasa|bcv|cambio del dolar|tasa del dolar)\b/.test(t)) return 'fx';
  if (/\b(enlace|link|qr|url).*(menu|menú|pedido|delivery)?|\benlaces?\b/.test(t)) return 'links';
  if (/\b(delivery|domicilio)\b/.test(t) && /\b(activa|desactiva|configura|cambiar|cambia)\b/.test(t)) {
    return 'delivery';
  }
  if (/\b(agotado|disponib|activar producto|desactivar producto)\b/.test(t)) return 'availability';
  if (/\b(horario|abren|cierran)\b/.test(t)) return 'hours';
  if (/\b(precio|tarif)\b/.test(t) && /\b(cambia|cambiar|actualiza|actualizar|pon|poner|modifica)\b/.test(t)) {
    return 'price';
  }
  if (/\b(producto|agregar|añadir|subir|editar producto)\b/.test(t)) return 'product';
  if (/\b(configuracion|configuración|panel|ajustes)\b/.test(t)) return 'settings';
  if (
    /\b(cambia|cambiar|actualiza|actualizar|modifica|modificar|editar|poner)\b/.test(t) &&
    /\b(menu|menú|negocio|restaurante|tasa|precio|producto)\b/.test(t)
  ) {
    return 'generic';
  }
  return null;
}

function topicCopy(topic: MerchantHelpTopic): { title: string; steps: string; pendingOp: string } {
  switch (topic) {
    case 'fx':
      return {
        title: 'cambiar la tasa',
        steps:
          'Entra en el panel *app.elmenuxfa.com* → *Configuración* → *Tasas y cobros*. Ahí puedes actualizarla.',
        pendingOp: 'set_fx',
      };
    case 'price':
      return {
        title: 'cambiar precios',
        steps:
          'Entra en *app.elmenuxfa.com*, abre tu menú y edita el producto. También puedes hacerlo desde el asistente del negocio.',
        pendingOp: 'edit_price',
      };
    case 'product':
      return {
        title: 'gestionar productos',
        steps:
          'Entra en *app.elmenuxfa.com*, abre tu negocio y ve a productos del menú para agregar o editar.',
        pendingOp: 'edit_products',
      };
    case 'availability':
      return {
        title: 'cambiar disponibilidad',
        steps:
          'En *app.elmenuxfa.com* abre el producto y marca si está disponible o agotado.',
        pendingOp: 'set_availability',
      };
    case 'delivery':
      return {
        title: 'configurar delivery',
        steps:
          'En *app.elmenuxfa.com* ve a la configuración de pedidos / delivery de tu negocio.',
        pendingOp: 'set_delivery',
      };
    case 'links':
      return {
        title: 'obtener enlaces del menú',
        steps:
          'En *app.elmenuxfa.com* puedes copiar el enlace del menú y el de pedidos / QR.',
        pendingOp: 'menu_links',
      };
    case 'hours':
      return {
        title: 'ajustar horarios',
        steps: 'En *app.elmenuxfa.com* ve a configuración del negocio y edita los horarios.',
        pendingOp: 'set_hours',
      };
    case 'settings':
      return {
        title: 'configuración del negocio',
        steps: 'Entra en *app.elmenuxfa.com* y abre la configuración de tu local.',
        pendingOp: 'admin_settings',
      };
    default:
      return {
        title: 'gestionar tu menú',
        steps: 'Entra en el panel *app.elmenuxfa.com* y abre tu negocio para continuar.',
        pendingOp: 'admin_help',
      };
  }
}

export function buildMerchantHelpReply(params: {
  topic: MerchantHelpTopic;
  shops: WaMasterComercioRef[];
  panelUrl: string;
  handoffUrl?: string | null;
  /** When false, skip assistant offer (assistant not available). */
  offerAssistant?: boolean;
}): { reply: string; pendingOperation: string; intent: string } {
  const copy = topicCopy(params.topic);
  const offerAssistant = params.offerAssistant !== false;
  const shops = params.shops;
  const panel = (params.panelUrl || 'https://app.elmenuxfa.com/').replace(/\/$/, '') || 'https://app.elmenuxfa.com';

  let ack: string;
  if (shops.length === 1) {
    ack = `Vale, veo que tienes *${shops[0].publicName}* registrado con nosotros.`;
  } else if (shops.length > 1) {
    const list = shops.map((s) => `• ${s.publicName}`).join('\n');
    ack = `Vale, veo varios negocios ligados a este número:\n${list}\n\nTe explico el camino general (si hace falta, dime cuál).`;
  } else {
    ack = 'Vale, te explico cómo hacerlo en el panel.';
  }

  const parts = [
    ack,
    '',
    `Te explico lo que debes hacer para ${copy.title}:`,
    '',
    copy.steps.replace('app.elmenuxfa.com', panel.replace(/^https?:\/\//, '')),
    '',
    'No me pases claves ni datos de acceso por WhatsApp.',
  ];

  if (offerAssistant && params.handoffUrl) {
    parts.push(
      '',
      'Aunque si quieres, *yo lo puedo hacer por ti* con el asistente del negocio (inicia sesión ahí de forma segura):',
      '',
      'Escríbeme aquí:',
      params.handoffUrl,
    );
  } else if (offerAssistant) {
    parts.push(
      '',
      `Aunque si quieres hacerlo con el asistente del negocio: ${panel}/asistente`,
    );
  }

  return {
    reply: parts.join('\n'),
    pendingOperation: copy.pendingOp,
    intent:
      params.topic === 'fx'
        ? 'admin.fx'
        : params.topic === 'price'
          ? 'admin.edit_price'
          : params.topic === 'product'
            ? 'admin.edit_product'
            : params.topic === 'delivery'
              ? 'admin.delivery'
              : params.topic === 'links'
                ? 'admin.menu_links'
                : params.topic === 'hours'
                  ? 'admin.hours'
                  : 'admin.settings',
  };
}
