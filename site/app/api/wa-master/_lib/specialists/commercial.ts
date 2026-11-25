import type { WaHandoffStore } from '../../../_lib/wa-handoff';
import type { WaMasterConfig } from '../config';
import { issueMasterHandoff } from '../handoff';
import type { WaMasterMemory, WaMasterSignupDraft } from '../types';

/**
 * Commercial specialist — no invented plans/promos.
 * Receptionist mode: brief reply + opaque handoff to business assistant.
 * Create-comercio from WhatsApp remains pending without a secure API.
 */

const SERVICE_BLURB =
  'Con *elmenuxfa.com* tu negocio tiene menú digital para que clientes vean productos, precios y pidan más fácil.';

function fold(s: string) {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function extractBusinessName(text: string, allowBare: boolean): string | null {
  const m =
    text.match(/(?:negocio|restaurante)\s+se\s+llama\s+(.+)$/i) ||
    text.match(/se\s+llama\s+(.+)$/i) ||
    text.match(/me\s+llamo\s+(.+)$/i);
  if (m?.[1]) return m[1].trim().slice(0, 80);
  // Bare name only when we explicitly asked for business_name.
  if (
    allowBare &&
    text.trim().length >= 2 &&
    text.trim().length <= 80 &&
    !/\?/.test(text) &&
    !/\b(registrar|quiero|poner|crear|menu|menú|retomo|hola|negocio)\b/i.test(text)
  ) {
    return text.trim();
  }
  return null;
}

export type CommercialSpecialistResult = {
  replies: string[];
  toolsUsed: string[];
  memoryPatch: Partial<WaMasterMemory['summary']>;
  skipGeminiPolish?: boolean;
};

export async function runCommercialSpecialist(params: {
  text: string;
  memory: WaMasterMemory;
  config: WaMasterConfig;
  intent: string;
  fromDigits?: string;
  handoffStore?: WaHandoffStore;
  nowMs?: number;
}): Promise<CommercialSpecialistResult> {
  const { text, memory, config, intent } = params;
  const t = fold(text);
  const draft: WaMasterSignupDraft = memory.summary.signupDraft || {
    businessName: null,
    city: null,
    category: null,
    stage: 'intro',
  };

  {
    const allowBare = memory.summary.pendingQuestion === 'business_name';
    const name = extractBusinessName(text, allowBare);
    if (name && !/\b(registrar|poner mi|crear|quiero|menu|menú|retomo)\b/i.test(name)) {
      draft.businessName = name;
    }
  }

  // Memory-only: already have name and user asks again (not bare "nombre" alone).
  if (
    draft.businessName &&
    /\b(recuerdas|como se llama|cómo se llama|nombre de mi (negocio|restaurante))\b/.test(t)
  ) {
    return {
      replies: [
        `¡Sí! 😊 Me comentaste que se llama *${draft.businessName}*.\n\n¿Quieres que continuemos con su registro?`,
      ],
      toolsUsed: ['memory_recall'],
      memoryPatch: { signupDraft: draft },
      skipGeminiPolish: true,
    };
  }

  const handoffBusiness = async (payload: {
    intent: string;
    pendingOperation?: string;
    businessNameDraft?: string | null;
    conversationHint?: string;
  }) => {
    const handoff = await issueMasterHandoff({
      store: params.handoffStore,
      config,
      destination: 'business_assistant',
      fromDigits: params.fromDigits || memory.profile.fromDigits,
      nowMs: params.nowMs,
      payload: {
        intent: payload.intent,
        pendingOperation: payload.pendingOperation ?? null,
        businessNameDraft: payload.businessNameDraft ?? draft.businessName,
        conversationHint: payload.conversationHint ?? null,
        summary:
          payload.conversationHint ||
          payload.pendingOperation ||
          `Solicitud comercial: ${payload.intent}`,
        transcriptExcerpt: params.text.slice(0, 400),
        source: 'wa_platform',
        profile: 'business',
      },
    });
    return handoff;
  };

  if (intent === 'commercial.pricing' || /\b(precio|plan|tarifa|cuanto cuesta|cuánto cuesta)\b/.test(t)) {
    draft.stage = 'pricing';
    // Published business landing prices (business.elmenuxfa.com) — do not invent others.
    const pricingCopy =
      `¡Claro! 😊 Hoy elmenuxfa.com publica:\n` +
      `• *Kit Portamenú Inteligente* de lanzamiento: *$10*\n` +
      `• *Plataforma:* *$10/mes* o *$90/año*\n\n` +
      `Detalle y condiciones: ${config.businessLandingUrl}\n` +
      `Si quieres registrar tu menú, dímelo y te oriento.`;
    return {
      replies: [pricingCopy],
      toolsUsed: ['commercial_pricing_published'],
      memoryPatch: { signupDraft: draft, activeService: 'commercial' },
      skipGeminiPolish: true,
    };
  }

  if (
    intent === 'commercial.register' ||
    intent === 'commercial.resume_signup' ||
    /\b(registrar|poner mi|crear.*menu|unirme|menu de mi restaurante|menú de mi)\b/.test(t) ||
    memory.summary.pendingQuestion === 'business_name'
  ) {
    if (
      config.receptionistMode &&
      (draft.businessName || memory.summary.askedFields.includes('business_name'))
    ) {
      draft.stage = 'waiting_panel';
      const handoff = await handoffBusiness({
        intent: 'commercial.register',
        pendingOperation: 'register_business',
        businessNameDraft: draft.businessName,
        conversationHint: draft.businessName
          ? `Registrar ${draft.businessName}`
          : 'Registrar restaurante',
      });
      const nameBit = draft.businessName ? ` *${draft.businessName}*` : '';
      if (handoff) {
        return {
          replies: [
            `¡Excelente! 🙌 Nuestro asistente te acompaña para registrar${nameBit} y comenzar a crear tu menú.\n\nPuedes continuar aquí:\n${handoff.url}\n\n¡Te estará esperando para comenzar! 😊`,
          ],
          toolsUsed: ['handoff_business'],
          memoryPatch: {
            signupDraft: draft,
            pendingQuestion: null,
            activeService: 'commercial',
            lastHandoffUrl: handoff.url,
            lastHandoffAtMs: params.nowMs ?? Date.now(),
          },
          skipGeminiPolish: true,
        };
      }
    }

    if (!draft.businessName && !memory.summary.askedFields.includes('business_name')) {
      draft.stage = 'need';
      return {
        replies: [
          `¡Excelente! 🙌 ${SERVICE_BLURB}\n\n¿Cómo se llama tu negocio?`,
        ],
        toolsUsed: ['commercial_qualify'],
        memoryPatch: {
          signupDraft: draft,
          pendingQuestion: 'business_name',
          activeService: 'commercial',
        },
        skipGeminiPolish: true,
      };
    }

    if (config.receptionistMode) {
      draft.stage = 'waiting_panel';
      const handoff = await handoffBusiness({
        intent: 'commercial.register',
        pendingOperation: 'register_business',
        businessNameDraft: draft.businessName,
      });
      if (handoff) {
        return {
          replies: [
            `¡Perfecto${draft.businessName ? `, *${draft.businessName}*` : ''}! 🙌 Continúa el registro con nuestro asistente para negocios:\n${handoff.url}`,
          ],
          toolsUsed: ['handoff_business'],
          memoryPatch: {
            signupDraft: draft,
            pendingQuestion: null,
            activeService: 'commercial',
            lastHandoffUrl: handoff.url,
            lastHandoffAtMs: params.nowMs ?? Date.now(),
          },
          skipGeminiPolish: true,
        };
      }
    }

    draft.stage = 'waiting_panel';
    return {
      replies: [
        `Siguiente paso seguro: crear la cuenta en el panel.\n${config.businessRegisterUrl}\n\nInfo: ${config.businessLandingUrl}`,
      ],
      toolsUsed: ['handoff_register_url'],
      memoryPatch: {
        signupDraft: draft,
        pendingQuestion: null,
        activeService: 'commercial',
      },
      skipGeminiPolish: true,
    };
  }

  if (config.receptionistMode) {
    const handoff = await handoffBusiness({
      intent: 'commercial.info',
      conversationHint: 'Información del servicio para negocios',
    });
    if (handoff) {
      return {
        replies: [
          `¡Claro! ${SERVICE_BLURB}\n\nNuestro asistente para negocios te orienta paso a paso:\n${handoff.url}`,
        ],
        toolsUsed: ['handoff_business'],
        memoryPatch: {
          signupDraft: draft,
          activeService: 'commercial',
          lastHandoffUrl: handoff.url,
          lastHandoffAtMs: params.nowMs ?? Date.now(),
        },
        skipGeminiPolish: true,
      };
    }
  }

  return {
    replies: [
      `¡Claro! ${SERVICE_BLURB}\n\n¿Quieres registrar tu menú o solo entender el servicio?\nInfo: ${config.businessLandingUrl}`,
    ],
    toolsUsed: ['commercial_info'],
    memoryPatch: { signupDraft: draft, activeService: 'commercial' },
  };
}
