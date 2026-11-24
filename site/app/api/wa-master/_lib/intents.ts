import type { WaMasterIdentity, WaMasterIntent, WaMasterMemory, WaMasterSpecialist } from './types';

function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export type ClassifiedIntents = {
  intents: WaMasterIntent[];
  specialist: WaMasterSpecialist;
  confidence: 'high' | 'medium' | 'low';
};

/**
 * Deterministic intent classification for clear cases.
 * Ambiguous text returns clarify_role / unknown for orchestrator fallback.
 */
export function classifyWaMasterIntents(params: {
  text: string;
  identity: WaMasterIdentity;
  memory: WaMasterMemory;
}): ClassifiedIntents {
  const t = fold(params.text);
  const intents: WaMasterIntent[] = [];

  if (!t) {
    return { intents: ['unknown'], specialist: 'orchestrator', confidence: 'low' };
  }

  if (
    /^(hola|buenas|buenos dias|buenas tardes|buenas noches|hey|hi|hello)(\b|$)/.test(t) ||
    t === 'hola'
  ) {
    intents.push('greeting');
  }

  if (
    /\b(hablar con (una )?persona|operador|asesor humano|agente humano|quiero un humano)\b/.test(
      t,
    ) ||
    t === 'humano'
  ) {
    intents.push('support.human');
  }

  if (/\b(borrar mis datos|eliminar mi informacion|rectificar|privacidad)\b/.test(t)) {
    intents.push(t.includes('borrar') || t.includes('eliminar') ? 'privacy.delete' : 'privacy.rectify');
  }

  if (/\b(queja|reclamo|incidencia|problema con (mi )?pedido|no me llego)\b/.test(t)) {
    intents.push(t.includes('pedido') ? 'consumer.complaint' : 'support.issue');
  }

  if (
    /\b(registrar|poner mi (restaurante|negocio|menu)|crear (mi )?menu|quiero vender|unirme a (la )?plataforma)\b/.test(
      t,
    )
  ) {
    intents.push('commercial.register');
  }

  if (/\b(planes|precios del servicio|cuanto cuesta (elmenuxfa|la plataforma)|tarifas)\b/.test(t)) {
    intents.push('commercial.pricing');
  }

  if (
    /\b(como funciona|informacion|info|quiero informacion)\b/.test(t) &&
    !/\b(pizza|hamburguesa|pedir|delivery)\b/.test(t)
  ) {
    intents.push('commercial.info');
  }

  // "6 dólares" is a price unit — not an FX change request.
  const fxRequest =
    /\b(tasa|bcv|cambio del dolar|tasa del dolar)\b/.test(t) ||
    (/\bdolar\b/.test(t) && /\b(tasa|cambio|bcv|actualiza|consulta|cual)\b/.test(t) && !/\b\d+[.,]?\d*\s*dolares?\b/.test(t));
  if (fxRequest && /\b(actualiza|cambia|pon|modifica|consulta|cual|configurad)\b/.test(t)) {
    intents.push('admin.fx');
  }

  if (/\b(agrega|añade|agregar).*\b(producto|pizza|hamburguesa)\b/.test(t) || /\bpon (el )?precio\b/.test(t) || /\bcambia(r)? el precio\b/.test(t)) {
    if (/\bprecio\b/.test(t)) intents.push('admin.edit_price');
    else intents.push('admin.edit_product');
  }

  if (/\b(agotado|no tenemos|desactiva(r)? (el )?delivery|activa(r)? (el )?delivery)\b/.test(t)) {
    if (/\bdelivery\b/.test(t)) intents.push('admin.delivery');
    else intents.push('admin.availability');
  }

  if (/\b(mi menu|ver mis productos|mis productos|productos agotados|muestra(me)? mis productos)\b/.test(t)) {
    intents.push('admin.view_menu');
  }

  // Admin price/product edits must not also count as food search ("pizza" in product name).
  const adminMutation =
    /\b(cambia(?:r)? el precio|pon el precio|actualiza(?:r)? (el )?precio|agrega(?:r)? (una |un )?|desactiva|activa(?:r)? (el )?delivery)\b/.test(
      t,
    ) || intents.some((i) => i.startsWith('admin'));

  if (
    !adminMutation &&
    !intents.includes('consumer.complaint') &&
    /(pedir|quiero comer|tengo hambre|hamburgues|pizza|sushi|arepa|delivery de|buscar restaurante|donde como)/.test(
      t,
    )
  ) {
    if (/\bdelivery\b/.test(t)) intents.push('consumer.delivery');
    else if (/\b(horario|abierto|cierr)\b/.test(t)) intents.push('consumer.hours');
    else intents.push('consumer.search');
  }

  if (/\b(horario|abren|cierran)\b/.test(t) && !intents.includes('consumer.hours')) {
    intents.push('consumer.hours');
  }

  // Deduplicate
  const unique = [...new Set(intents)];
  if (unique.length === 0) {
    if (params.identity.role === 'merchant_candidate' || params.identity.role === 'mixed') {
      // Short help messages from known merchants → soft admin/support lean
      if (/\b(ayuda|necesito ayuda|soporte)\b/.test(t)) {
        return { intents: ['admin.view_menu'], specialist: 'admin', confidence: 'medium' };
      }
    }
    if (unique.length === 0 && (/informacion|info/.test(t) || t.length < 24)) {
      return { intents: ['clarify_role'], specialist: 'orchestrator', confidence: 'low' };
    }
    return { intents: ['unknown'], specialist: 'orchestrator', confidence: 'low' };
  }

  if (unique.length > 1 && !unique.every((i) => i === 'greeting' || i.startsWith('consumer'))) {
    // Keep greeting + primary non-greeting
  }

  const primary = pickPrimary(unique, params.identity);
  return {
    intents: unique.length > 1 ? (['multi', ...unique] as WaMasterIntent[]) : unique,
    specialist: specialistFor(primary, params.identity),
    confidence: unique.length === 1 ? 'high' : 'medium',
  };
}

function pickPrimary(intents: WaMasterIntent[], identity: WaMasterIdentity): WaMasterIntent {
  const nonGreeting = intents.filter((i) => i !== 'greeting' && i !== 'multi');
  if (nonGreeting.includes('support.human')) return 'support.human';
  if (nonGreeting.includes('consumer.complaint') || nonGreeting.includes('support.issue')) {
    return nonGreeting.includes('consumer.complaint') ? 'consumer.complaint' : 'support.issue';
  }
  // Prefer admin mutations over consumer when both fire (e.g. "precio de la pizza").
  if (nonGreeting.includes('admin.edit_price') || nonGreeting.includes('admin.edit_product')) {
    return nonGreeting.includes('admin.edit_price') ? 'admin.edit_price' : 'admin.edit_product';
  }
  if (nonGreeting.some((i) => i.startsWith('admin'))) {
    return nonGreeting.find((i) => i.startsWith('admin'))!;
  }
  if (nonGreeting.some((i) => i.startsWith('consumer'))) {
    return nonGreeting.find((i) => i.startsWith('consumer'))!;
  }
  if (nonGreeting.some((i) => i.startsWith('commercial'))) {
    return nonGreeting.find((i) => i.startsWith('commercial'))!;
  }
  if (identity.role === 'merchant_candidate' && nonGreeting[0]) return nonGreeting[0];
  return nonGreeting[0] || intents[0] || 'unknown';
}

function specialistFor(intent: WaMasterIntent, identity: WaMasterIdentity): WaMasterSpecialist {
  if (intent.startsWith('consumer')) return 'consumer';
  if (intent.startsWith('commercial')) return 'commercial';
  if (intent.startsWith('admin')) return 'admin';
  if (intent.startsWith('support') || intent.startsWith('privacy')) return 'support';
  if (intent === 'greeting') {
    if (identity.role === 'merchant_candidate' || identity.role === 'mixed') return 'admin';
    if (identity.role === 'possible_consumer') return 'consumer';
    return 'orchestrator';
  }
  return 'orchestrator';
}
