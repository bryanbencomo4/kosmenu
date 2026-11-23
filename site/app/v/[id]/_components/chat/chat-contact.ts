import {
  businessBenefitsHref,
  chatWhatsappHref,
} from '../../../../_lib/public-site-config';

/**
 * Restaurant customer-care intents (NOT platform / Kit Menú support).
 * Includes claims, complaints, human handoff, and published local WhatsApp.
 */
export const CONTACT_INTENT_RE =
  /\b(whats?app|wa\.?me|hablar con (un |una )?(humano|persona|alguien|asesor|mesero|cajero|el local|el restaurante|ustedes)|atencion (humana|personal|al cliente)|pasar(me)? (con |a )?(un )?humano|numero (de )?(whats?app|telefono|contacto)|telefono (del |de )?(negocio|local|restaurante)|contacto (del |de )?(negocio|local|restaurante)|escribir(le)? (al|a) (local|restaurante)|reclam(ar|o|acion|ación)|queja|quejar(me)?|devoluci[oó]n|pedido (incompleto|equivocado|malo|errado|danado|dañado)|me (falt[oó]|lleg[oó] mal|cobraron)|problema con (el |mi )?pedido|soporte (del |de (mi )?pedido)|atenci[oó]n (del |de (mi )?pedido))\b/i;

/** "elmenuxfa", "cómo creo un menú", "este chat para mi negocio"… */
export const PLATFORM_INTENT_RE =
  /\b(el ?menu ?xfa|elmenuxfa|como (creo|hago|armo|publico) (un |mi )?menu|quiero (un |mi )?menu (asi|como este|igual|digital)|kit menu|para mi (restaurante|negocio|local)|montar (un )?menu|menu inteligente)\b/i;

/** "tienen delivery", "recoger", "para llevar", "domicilio"… */
export const FULFILLMENT_INTENT_RE =
  /\b(tienen (delivery|domicilio|envio)|hacen (delivery|domicilio|envio)|delivery|domicilio|envio a domicilio|para llevar|recoger|pickup|pasar(lo)? a buscar|comer (aqui|alla)|retiro (en|del) local)\b/i;

function fold(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[¿?¡!.,;:]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function shortEnough(norm: string, maxWords: number): boolean {
  return Boolean(norm) && norm.split(' ').length <= maxWords;
}

export function matchContactIntent(text: string | null | undefined): boolean {
  const norm = fold((text ?? '').trim());
  if (!shortEnough(norm, 16)) return false;
  return CONTACT_INTENT_RE.test(norm);
}

export function matchPlatformIntent(text: string | null | undefined): boolean {
  const norm = fold((text ?? '').trim());
  if (!shortEnough(norm, 18)) return false;
  return PLATFORM_INTENT_RE.test(norm);
}

export function matchFulfillmentIntent(text: string | null | undefined): boolean {
  const norm = fold((text ?? '').trim());
  if (!shortEnough(norm, 14)) return false;
  return FULFILLMENT_INTENT_RE.test(norm);
}

export type ChatContactCardData = {
  whatsappUrl: string;
  /** Digits or pretty label for display. */
  label: string;
  /** Business display name (WhatsApp contact header). */
  businessName: string;
  /** Optional circular avatar (logo). */
  avatarUrl?: string | null;
  phoneDisplay: string | null;
};

export function buildRestaurantContactCard(input: {
  whatsappUrl: string | null | undefined;
  phoneDisplay?: string | null;
  businessName?: string | null;
  avatarUrl?: string | null;
}): ChatContactCardData | null {
  const url = (input.whatsappUrl || '').trim();
  if (!url) return null;
  const name = (input.businessName || '').trim() || 'el restaurante';
  return {
    whatsappUrl: url,
    label: name,
    businessName: name,
    avatarUrl: (input.avatarUrl || '').trim() || null,
    phoneDisplay: (input.phoneDisplay || '').trim() || null,
  };
}

export function buildPlatformPitchText(): string {
  return [
    'Este chat corre sobre *elmenuxfa*, el menú digital inteligente para restaurantes.',
    `Puedes armar uno igual en ${businessBenefitsHref} o escribirnos por WhatsApp para el *Kit Menú Inteligente*: ${chatWhatsappHref}`,
  ].join('\n');
}

export type ChatFulfillmentOptions = {
  delivery: boolean;
  pickup: boolean;
  dineIn: boolean;
};

export function buildFulfillmentReplyText(
  options: ChatFulfillmentOptions,
): string {
  const parts: string[] = [];
  if (options.delivery) {
    parts.push(
      'Tenemos *delivery*: comparte tu ubicación o dirección y te ayudo a cotizar en el checkout.',
    );
  }
  if (options.pickup) {
    parts.push(
      'También puedes *pasar a recoger* / pedir para llevar en el local.',
    );
  }
  if (options.dineIn) {
    parts.push('Y si prefieres, puedes *comer aquí*.');
  }
  if (parts.length === 0) {
    return 'Por ahora confirma con el restaurante cómo prefieren entregar el pedido (WhatsApp o menú tradicional).';
  }
  if (!options.delivery && options.pickup) {
    return `Por ahora no tengo delivery activo. ${parts.join(' ')}`;
  }
  return parts.join(' ');
}
