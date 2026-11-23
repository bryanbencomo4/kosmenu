/**
 * Phase 1 — Sales assistant preview gate.
 *
 * Public chatbot UX (home chooser + FAB) is allowlisted per commerce slug.
 * Expand CHATBOT_UX_ENABLED_SLUGS when rolling out to more restaurants.
 * This does NOT grant Plan Pro and must not be treated as commercial activation.
 */

/** Slugs with assistant entry points on the public menu. */
export const CHATBOT_UX_ENABLED_SLUGS = ['pizzas-el-trueno'] as const;

/** True when this public menu may show assistant entry (home / FAB). */
export function isChatbotUxEnabledForSlug(
  slug: string | null | undefined,
): boolean {
  const normalized = (slug ?? '').trim().toLowerCase();
  if (!normalized) return false;
  return (CHATBOT_UX_ENABLED_SLUGS as readonly string[]).includes(normalized);
}

export type ChatbotQueryConflict =
  | 'preview_disabled'
  | 'assisted_priority'
  | 'catalog_priority';

export type ChatbotOpenDecision =
  | { open: true }
  | { open: false; reason?: ChatbotQueryConflict };

/** True when the environment may show the assistant UI at all. */
export function isChatbotPreviewEnabled(
  env: {
    nodeEnv?: string | null;
    publicPreviewFlag?: string | null;
  } = {
    nodeEnv: process.env.NODE_ENV,
    publicPreviewFlag: process.env.NEXT_PUBLIC_CHATBOT_PREVIEW,
  },
): boolean {
  const flag = (env.publicPreviewFlag ?? '').trim();
  if (flag === '1' || flag.toLowerCase() === 'true') return true;
  const nodeEnv = (env.nodeEnv ?? '').trim().toLowerCase();
  return nodeEnv !== 'production';
}

export function isChatbotQueryEnabled(raw: string | null | undefined): boolean {
  return (raw ?? '').trim() === '1';
}

/**
 * Priority when several public-menu modes appear together:
 * 1. mode=assisted (waiter) — always traditional / assisted UI
 * 2. catalog QR (?catalogo=1, ?src=qr, …) — catalog-only session
 * 3. chatbot=1 — assistant preview (only if preview env allows it)
 *
 * Tracking, orders, and proof routes are unrelated and must not be rewritten here.
 */
export function shouldOpenChatbotFromQuery(params: {
  chatbot: string | null | undefined;
  mode?: string | null | undefined;
  catalogForced?: boolean;
  previewEnabled?: boolean;
}): ChatbotOpenDecision {
  if (!isChatbotQueryEnabled(params.chatbot)) {
    return { open: false };
  }

  const mode = (params.mode ?? '').trim().toLowerCase();
  if (mode === 'assisted') {
    return { open: false, reason: 'assisted_priority' };
  }

  if (params.catalogForced) {
    return { open: false, reason: 'catalog_priority' };
  }

  const previewEnabled =
    typeof params.previewEnabled === 'boolean'
      ? params.previewEnabled
      : isChatbotPreviewEnabled();

  if (!previewEnabled) {
    return { open: false, reason: 'preview_disabled' };
  }

  return { open: true };
}

/** Bump when welcome copy changes so persisted chats refresh the first bubble. */
export const CHATBOT_WELCOME_VERSION = 6;

export function buildChatbotWelcomeMessage(
  restaurantName: string,
  _options?: { runtimeEnabled?: boolean },
): string {
  const name = restaurantName.trim() || 'nuestro restaurante';
  return [
    `¡Hola! 👋 Bienvenido a ${name} 🍕`,
    '',
    '¿Qué se te antoja hoy? Mira nuestro menú o dime qué te gustaría pedir.',
    '',
    '_Esta conversación puede ser revisada por personal autorizado del restaurante y procesada por IA para atenderte mejor._',
  ].join('\n');
}

/**
 * Refresh only the welcome bubble when copy/version changes.
 * Keeps the rest of the conversation intact.
 */
export function refreshWelcomeInHistory(
  messages: Array<{
    id: string;
    role: string;
    text: string;
    createdAt: number;
    demo?: boolean;
    isWelcome?: boolean;
    welcomeVersion?: number;
  }>,
  welcome: string,
  options?: { runtimeEnabled?: boolean },
): typeof messages {
  const live = Boolean(options?.runtimeEnabled);
  if (messages.length === 0) {
    return [
      {
        id: `assistant-welcome-${Date.now()}`,
        role: 'assistant',
        text: welcome,
        createdAt: Date.now(),
        demo: !live,
        isWelcome: true,
        welcomeVersion: CHATBOT_WELCOME_VERSION,
      },
    ];
  }
  const [first, ...rest] = messages;
  // First assistant bubble is the welcome slot (including legacy histories).
  if (first.role !== 'assistant') return messages;
  if (
    first.welcomeVersion === CHATBOT_WELCOME_VERSION &&
    first.text === welcome &&
    Boolean(first.demo) === !live
  ) {
    return messages;
  }
  return [
    {
      ...first,
      text: welcome,
      demo: !live,
      isWelcome: true,
      welcomeVersion: CHATBOT_WELCOME_VERSION,
    },
    ...rest,
  ];
}

/** Deterministic demo reply — never invents catalog prices or stock. */
export function buildChatbotDemoReply(userText: string, restaurantName: string): string {
  const trimmed = userText.replace(/\s+/g, ' ').trim().slice(0, 240);
  const name = restaurantName.trim() || 'el restaurante';
  const quoted = trimmed || '(mensaje vacío)';
  return [
    'Esta es una demostración de la interfaz. Aún no hay inteligencia artificial conectada.',
    '',
    `Recibí: “${quoted}”`,
    '',
    `Cuando activemos el asistente, consultaré el menú real de ${name} con los mismos precios y reglas del menú tradicional.`,
    '',
    'Por ahora puedes usar “Ver menú” para pedir con el catálogo actual. Tu carrito se conserva al cambiar de modalidad.',
  ].join('\n');
}
