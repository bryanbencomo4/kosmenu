import type { WaMasterConfig } from './config';
import { greetingForIdentity } from './personality';
import type {
  WaMasterIdentity,
  WaMasterIntent,
  WaMasterMemory,
  WaMasterSpecialist,
} from './types';

export function buildDeterministicReplies(params: {
  intents: WaMasterIntent[];
  specialist: WaMasterSpecialist;
  identity: WaMasterIdentity;
  memory: WaMasterMemory;
  config: WaMasterConfig;
  text: string;
}): { replies: string[]; escalateHuman: boolean; toolsUsed: string[]; askedFields: string[] } {
  const { intents, identity, config, memory } = params;
  const names = identity.comercios.map((c) => c.publicName);
  const askedFields: string[] = [];
  const toolsUsed: string[] = [];
  let escalateHuman = false;

  const primary =
    intents.find((i) => i !== 'multi' && i !== 'greeting') || intents[0] || 'unknown';

  if (intents.includes('support.human')) {
    escalateHuman = true;
    return {
      replies: [
        'Entendido. Voy a pausar la atención automática para que una persona del equipo de elmenuxfa.com pueda ayudarte.\n\nCuéntale el detalle cuando te escriba; ya dejo el contexto de esta conversación.',
      ],
      escalateHuman,
      toolsUsed: ['escalate_human'],
      askedFields,
    };
  }

  if (primary === 'greeting' || (intents.length === 1 && intents[0] === 'greeting')) {
    return {
      replies: [greetingForIdentity(identity.role, names)],
      escalateHuman,
      toolsUsed,
      askedFields,
    };
  }

  if (primary === 'clarify_role' || primary === 'commercial.info') {
    if (memory.summary.askedFields.includes('role_clarify')) {
      return {
        replies: [
          `Puedo ayudarte a encontrar comida en elmenuxfa.com o a crear el menú digital de tu negocio.\n\nMás info del servicio: ${config.businessLandingUrl}\nAsistente para pedir: ${config.consumerAssistantUrl}`,
        ],
        escalateHuman,
        toolsUsed: ['handoff_links'],
        askedFields,
      };
    }
    askedFields.push('role_clarify');
    return {
      replies: [
        '¡Claro! 😊 ¿Quieres saber cómo crear tu menú digital o estás buscando restaurantes para pedir comida?',
      ],
      escalateHuman,
      toolsUsed,
      askedFields,
    };
  }

  if (primary.startsWith('consumer')) {
    toolsUsed.push('consumer_guidance');
    if (primary === 'consumer.delivery') {
      if (!memory.summary.askedFields.includes('zone')) {
        askedFields.push('zone');
        return {
          replies: [
            '¡Qué buena idea! 🍔 Dime en qué ciudad o zona estás y buscamos opciones. Solo confirmo delivery cuando el restaurante lo tenga activado.',
          ],
          escalateHuman,
          toolsUsed,
          askedFields,
        };
      }
    }
    if (!memory.summary.askedFields.includes('zone') && primary === 'consumer.search') {
      askedFields.push('zone');
      return {
        replies: [
          '¡Te ayudo! 🍕 ¿En qué zona estás? Así te muestro opciones cercanas. También puedes explorar aquí:\n' +
            config.consumerAssistantUrl,
        ],
        escalateHuman,
        toolsUsed,
        askedFields,
      };
    }
    return {
      replies: [
        `Puedo ayudarte a encontrar opciones en elmenuxfa.com. Sigue aquí con el asistente de búsqueda:\n${config.consumerAssistantUrl}`,
      ],
      escalateHuman,
      toolsUsed,
      askedFields,
    };
  }

  if (primary.startsWith('commercial')) {
    toolsUsed.push('commercial_guidance');
    if (primary === 'commercial.register' || primary === 'commercial.resume_signup') {
      return {
        replies: [
          '¡Excelente! 🙌 Con elmenuxfa.com puedes tener tu menú digital para que tus clientes exploren productos y pidan más fácil.\n\n¿Tu negocio ya está funcionando o estás por abrirlo?\n\nCuando quieras crear la cuenta (sin compartir contraseñas por WhatsApp):\n' +
            config.businessRegisterUrl,
        ],
        escalateHuman,
        toolsUsed,
        askedFields,
      };
    }
    if (primary === 'commercial.pricing') {
      return {
        replies: [
          `Te cuento con gusto los planes vigentes. La información comercial actualizada está aquí:\n${config.businessLandingUrl}\n\nSi quieres, dime el tamaño de tu menú y te oriento sin inventar promociones.`,
        ],
        escalateHuman,
        toolsUsed,
        askedFields,
      };
    }
  }

  if (primary.startsWith('admin')) {
    toolsUsed.push('admin_propose_only');
    if (!identity.comercios.length) {
      return {
        replies: [
          'Para cambios en un menú necesito verificar que este WhatsApp esté vinculado al negocio. Si ya tienes cuenta, gestiona desde el panel:\n' +
            config.businessManageUrl,
        ],
        escalateHuman,
        toolsUsed,
        askedFields,
      };
    }
    if (identity.comercios.length > 1 && !memory.summary.selectedComercioId) {
      askedFields.push('comercio_select');
      const list = identity.comercios.map((c) => `• ${c.publicName}`).join('\n');
      return {
        replies: [
          `Puedo ayudarte con estos negocios:\n${list}\n\n¿Cuál quieres gestionar? (Aún no aplico cambios: primero confirmamos identidad y el ajuste.)`,
        ],
        escalateHuman,
        toolsUsed,
        askedFields,
      };
    }
    const shop = identity.comercios.find((c) => c.comercioId === memory.summary.selectedComercioId)
      || identity.comercios[0];
    return {
      replies: [
        `Entiendo el cambio que quieres en *${shop.publicName}*. Por seguridad, el número de WhatsApp identifica el negocio pero no autoriza solo modificaciones.\n\nPor ahora puedo preparar la propuesta; la ejecución segura irá al panel:\n${config.businessManageUrl}\n\nCuando activemos administración por chat, te pediré confirmación explícita antes de cualquier cambio.`,
      ],
      escalateHuman,
      toolsUsed,
      askedFields,
    };
  }

  if (primary === 'privacy.delete' || primary === 'privacy.rectify') {
    return {
      replies: [
        'Claro. Puedes pedir corregir o eliminar datos que hayamos guardado de esta conversación. Un humano del equipo de elmenuxfa.com lo revisará. Escribe *humano* si quieres atención personal ahora.',
      ],
      escalateHuman: false,
      toolsUsed: ['privacy_request'],
      askedFields,
    };
  }

  if (primary === 'support.issue' || primary === 'consumer.complaint') {
    return {
      replies: [
        'Lamento el inconveniente. Cuéntame qué pasó (sin datos de tarjetas). Si es un pedido de un restaurante, el local atiende su operación; si es de la plataforma elmenuxfa.com, te ayudo o te paso con una persona.',
      ],
      escalateHuman: false,
      toolsUsed,
      askedFields,
    };
  }

  return {
    replies: [
      'Ya entendí que necesitas ayuda. ¿Buscas comida en elmenuxfa.com o quieres gestionar / crear el menú de un negocio?',
    ],
    escalateHuman,
    toolsUsed,
    askedFields,
  };
}
