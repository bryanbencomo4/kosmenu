import type { WaMasterConfig } from '../config';
import type { WaMasterMemory, WaMasterSignupDraft } from '../types';

/**
 * Commercial specialist — no invented plans/promos.
 * Conversational registration create-comercio remains PENDING (no safe WA signup API).
 * We persist draft progress and deep-link to the real panel register.
 */

const SERVICE_BLURB = [
  'Con *elmenuxfa.com* tu negocio tiene menú digital para que clientes vean productos, precios y pidan más fácil — por web y WhatsApp cuando lo actives.',
  'Tú controlas el catálogo desde el panel; nosotros no inventamos planes ni pruebas gratis que no estén publicadas.',
].join('\n');

function fold(s: string) {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function extractBusinessName(text: string): string | null {
  const m =
    text.match(/(?:negocio|restaurante)\s+se\s+llama\s+(.+)$/i) ||
    text.match(/se\s+llama\s+(.+)$/i) ||
    text.match(/me\s+llamo\s+(.+)$/i);
  if (m?.[1]) return m[1].trim().slice(0, 80);
  return null;
}

export type CommercialSpecialistResult = {
  replies: string[];
  toolsUsed: string[];
  memoryPatch: Partial<WaMasterMemory['summary']>;
};

export function runCommercialSpecialist(params: {
  text: string;
  memory: WaMasterMemory;
  config: WaMasterConfig;
  intent: string;
}): CommercialSpecialistResult {
  const { text, memory, config, intent } = params;
  const t = fold(text);
  const draft: WaMasterSignupDraft = memory.summary.signupDraft || {
    businessName: null,
    city: null,
    category: null,
    stage: 'intro',
  };
  const name = extractBusinessName(text);
  if (name) draft.businessName = name;

  if (intent === 'commercial.pricing' || /\b(precio|plan|tarifa|cuanto cuesta)\b/.test(t)) {
    draft.stage = 'pricing';
    return {
      replies: [
        `${SERVICE_BLURB}\n\nLos planes y condiciones vigentes están en:\n${config.businessLandingUrl}\n\nNo te cito precios inventados por chat. Si quieres, dime el tamaño aproximado de tu menú y te oriento sobre el proceso.`,
      ],
      toolsUsed: ['commercial_pricing_link'],
      memoryPatch: { signupDraft: draft, activeService: 'commercial' },
    };
  }

  if (intent === 'commercial.resume_signup' || draft.stage === 'waiting_panel') {
    const nameBit = draft.businessName ? ` de *${draft.businessName}*` : '';
    return {
      replies: [
        `Retomamos el registro${nameBit}. Completa la cuenta aquí (nunca pidas/contraseñas por WhatsApp):\n${config.businessRegisterUrl}\n\nCuando entres al panel puedes armar el menú. Si te trabas, escribe y te guío.`,
      ],
      toolsUsed: ['handoff_register_url'],
      memoryPatch: {
        signupDraft: { ...draft, stage: 'waiting_panel' },
        activeService: 'commercial',
      },
    };
  }

  if (intent === 'commercial.register' || /\b(registrar|poner mi|crear.*menu|unirme)\b/.test(t)) {
    if (!draft.businessName && !memory.summary.askedFields.includes('business_name')) {
      draft.stage = 'need';
      return {
        replies: [
          `¡Excelente! 🙌 ${SERVICE_BLURB}\n\n¿Cómo se llama tu negocio? (Así lo recuerdo cuando vuelvas.)`,
        ],
        toolsUsed: ['commercial_qualify'],
        memoryPatch: {
          signupDraft: draft,
          pendingQuestion: 'business_name',
          activeService: 'commercial',
        },
      };
    }
    draft.stage = 'ready_register';
    const nameBit = draft.businessName ? `*${draft.businessName}*: ` : '';
    return {
      replies: [
        `${nameBit}el siguiente paso seguro es crear la cuenta en el panel:\n${config.businessRegisterUrl}\n\nMás info del servicio: ${config.businessLandingUrl}\n\nEl registro 100% por chat (crear comercio sin panel) sigue pendiente de una API segura — por ahora conservo tu avance y te dejo el enlace correcto.`,
      ],
      toolsUsed: ['handoff_register_url'],
      memoryPatch: {
        signupDraft: { ...draft, stage: 'waiting_panel' },
        pendingQuestion: null,
        activeService: 'commercial',
      },
    };
  }

  // generic info
  return {
    replies: [
      `¡Claro! ${SERVICE_BLURB}\n\n¿Quieres registrar tu menú o solo entender el servicio?\nInfo: ${config.businessLandingUrl}`,
    ],
    toolsUsed: ['commercial_info'],
    memoryPatch: { signupDraft: draft, activeService: 'commercial' },
  };
}
