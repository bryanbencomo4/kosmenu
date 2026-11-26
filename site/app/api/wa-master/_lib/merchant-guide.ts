/**
 * Central WA acts as L1 tech support: triage the case → escalate to business assistant.
 * Panel steps are a backup, never the main path. Never ask for passwords.
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
  // Tolerate common typos: taza/tasaa/tasas, kambiar, nesesito…
  if (/\b(tasa|tasas|taza|bcv|cambio del dolar|tasa del dolar)\b/.test(t)) return 'fx';
  if (/\b(enlace|link|qr|url).*(menu|menú|pedido|delivery)?|\benlaces?\b/.test(t)) return 'links';
  if (/\b(delivery|domicilio)\b/.test(t) && /\b(activa|desactiva|configura|cambiar|cambia|kambiar)\b/.test(t)) {
    return 'delivery';
  }
  if (/\b(agotado|disponib|activar producto|desactivar producto)\b/.test(t)) return 'availability';
  if (/\b(horario|abren|cierran)\b/.test(t)) return 'hours';
  if (
    /\b(precio|tarif)\b/.test(t) &&
    /\b(cambia|cambiar|kambiar|actualiza|actualizar|pon|poner|modifica)\b/.test(t)
  ) {
    return 'price';
  }
  if (/\b(producto|agregar|añadir|subir|editar producto)\b/.test(t)) return 'product';
  if (/\b(configuracion|configuración|panel|ajustes)\b/.test(t)) return 'settings';
  if (
    /\b(cambia|cambiar|kambiar|actualiza|actualizar|modifica|modificar|editar|poner)\b/.test(t) &&
    /\b(menu|menú|negocio|restaurante|tasa|taza|precio|producto)\b/.test(t)
  ) {
    return 'generic';
  }
  return null;
}

function topicCopy(topic: MerchantHelpTopic): {
  need: string;
  backupSteps: string;
  pendingOp: string;
} {
  switch (topic) {
    case 'fx':
      return {
        need: 'cambiar la tasa de cambio',
        backupSteps:
          'Si prefieres hacerlo tú: *app.elmenuxfa.com* → *Configuración* → *Tasas y cobros*.',
        pendingOp: 'set_fx',
      };
    case 'price':
      return {
        need: 'cambiar precios del menú',
        backupSteps: 'Si prefieres hacerlo tú: *app.elmenuxfa.com* → abre el producto y edita el precio.',
        pendingOp: 'edit_price',
      };
    case 'product':
      return {
        need: 'gestionar productos del menú',
        backupSteps: 'Si prefieres hacerlo tú: *app.elmenuxfa.com* → productos del menú.',
        pendingOp: 'edit_products',
      };
    case 'availability':
      return {
        need: 'cambiar disponibilidad de productos',
        backupSteps: 'Si prefieres hacerlo tú: *app.elmenuxfa.com* → marca el producto disponible o agotado.',
        pendingOp: 'set_availability',
      };
    case 'delivery':
      return {
        need: 'configurar delivery',
        backupSteps: 'Si prefieres hacerlo tú: *app.elmenuxfa.com* → configuración de pedidos / delivery.',
        pendingOp: 'set_delivery',
      };
    case 'links':
      return {
        need: 'obtener los enlaces del menú',
        backupSteps: 'Si prefieres hacerlo tú: *app.elmenuxfa.com* → copia el enlace del menú / QR.',
        pendingOp: 'menu_links',
      };
    case 'hours':
      return {
        need: 'ajustar horarios',
        backupSteps: 'Si prefieres hacerlo tú: *app.elmenuxfa.com* → configuración → horarios.',
        pendingOp: 'set_hours',
      };
    case 'settings':
      return {
        need: 'revisar la configuración del negocio',
        backupSteps: 'Si prefieres hacerlo tú: *app.elmenuxfa.com* → configuración.',
        pendingOp: 'admin_settings',
      };
    default:
      return {
        need: 'gestionar el menú del negocio',
        backupSteps: 'Si prefieres hacerlo tú: entra a *app.elmenuxfa.com* y abre tu negocio.',
        pendingOp: 'admin_help',
      };
  }
}

/**
 * L1 support tone: acknowledge shop + need → escalate to business specialist.
 */
export function buildMerchantHelpReply(params: {
  topic: MerchantHelpTopic;
  shops: WaMasterComercioRef[];
  panelUrl: string;
  handoffUrl?: string | null;
  offerAssistant?: boolean;
}): { reply: string; pendingOperation: string; intent: string } {
  const copy = topicCopy(params.topic);
  const offerAssistant = params.offerAssistant !== false;
  const shops = params.shops;
  const panelHost = (params.panelUrl || 'https://app.elmenuxfa.com/')
    .replace(/^https?:\/\//, '')
    .replace(/\/$/, '') || 'app.elmenuxfa.com';

  let caseLine: string;
  if (shops.length === 1) {
    caseLine = `Revisé tu caso: veo *${shops[0].publicName}* registrado con nosotros.`;
  } else if (shops.length > 1) {
    const list = shops.map((s) => `• ${s.publicName}`).join('\n');
    caseLine = `Revisé tu caso. Hay varios negocios en este número:\n${list}\n\nSigo con el primero salvo que me digas otro.`;
  } else {
    caseLine = 'Revisé tu caso.';
  }

  const parts = [
    caseLine,
    '',
    `Entendí que quieres *${copy.need}*.`,
    'Te paso con el especialista del negocio para que lo resuelva con tu sesión (no me pases claves por aquí).',
  ];

  if (offerAssistant && params.handoffUrl) {
    parts.push('', 'Continúa aquí:', params.handoffUrl);
  } else if (offerAssistant) {
    parts.push('', `Continúa con el asistente del negocio: https://${panelHost}/asistente`);
  }

  parts.push('', copy.backupSteps.replace(/app\.elmenuxfa\.com/g, panelHost));

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

/** Natural clarify when free text is unclear / typo-heavy. */
export const NATURAL_CLARIFY_REPLY =
  'Disculpa, no te entendí. Explícame mejor qué necesitas, porfa.';
