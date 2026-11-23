/**
 * Natural, brief chat onboarding + return greetings.
 */

function clean(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function firstName(name: string | null | undefined): string {
  return clean(name).split(/\s+/)[0] || '';
}

function hourInTz(date = new Date()): number {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      hour12: false,
      timeZone: 'America/Caracas',
    }).formatToParts(date);
    return Number(parts.find((p) => p.type === 'hour')?.value || date.getHours());
  } catch {
    return date.getHours();
  }
}

function dayPart(hour: number): 'morning' | 'afternoon' | 'evening' | 'night' {
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 18) return 'afternoon';
  if (hour >= 18 && hour < 22) return 'evening';
  return 'night';
}

export function buildOnboardingHello(
  businessName: string,
  guestName?: string | null,
): string {
  const rest = clean(businessName) || 'nuestro restaurante';
  const guest = firstName(guestName);
  const hi = guest ? `¡Hola, ${guest}!` : '¡Hola!';
  return `${hi} Bienvenido a ${rest}.`;
}

/** Soft ask — brief, non-invasive. */
export function buildIdentityAskText(): string {
  return 'No te tenemos registrado todavía. ¿Nos regalas tu nombre y WhatsApp para mantenerte al tanto del pedido?';
}

export function buildIdentityThanks(name?: string | null): string {
  const guest = firstName(name);
  return guest
    ? `Listo, ${guest}. Gracias.`
    : 'Listo, gracias.';
}

export function buildIdentityDeclinedAck(): string {
  return 'Sin problema. Cuando quieras seguimos.';
}

/** Spoken (TTS) note — human handoff + voice/text invite. */
export function buildHumanHelpVoiceScript(businessName: string): string {
  const rest = clean(businessName) || 'el restaurante';
  return (
    `Puedo ayudarte con el menú, el pedido o lo que necesites en ${rest}. ` +
    `Si prefieres hablar con una persona, solo dímelo y te pongo en contacto. ` +
    `También puedes escribirnos o mandar una nota de voz.`
  );
}

export function buildWhatDoYouFeelLike(guestName?: string | null): string {
  const guest = firstName(guestName);
  return guest
    ? `¿Qué te provoca hoy, ${guest}?`
    : '¿Qué te provoca hoy?';
}

export function estimateTtsDurationMs(text: string): number {
  const words = clean(text).split(/\s+/).filter(Boolean).length;
  // ~2.6 words/sec spoken Spanish + pad
  return Math.min(28000, Math.max(3200, Math.round((words / 2.6) * 1000) + 600));
}

export type ReturnGreetingInput = {
  businessName: string;
  guestName?: string | null;
  /** Minutes since last chat activity. */
  idleMinutes?: number | null;
  afterOrder?: boolean;
  now?: Date;
};

export function buildReturnGreeting(input: ReturnGreetingInput): string {
  const guest = firstName(input.guestName);
  const rest = clean(input.businessName) || 'nosotros';
  const hour = hourInTz(input.now);
  const part = dayPart(hour);
  const idle = input.idleMinutes ?? 0;

  if (input.afterOrder) {
    const options = guest
      ? [
          `Listo, ${guest}. Si quieres otro pedido, aquí estoy.`,
          `Pedido anotado. ¿Pedimos algo más, ${guest}?`,
          `Cuando se te antoje otra cosa, me avisas.`,
        ]
      : [
          'Listo. Si quieres otro pedido, aquí estoy.',
          'Pedido anotado. ¿Pedimos algo más?',
          'Cuando se te antoje otra cosa, me avisas.',
        ];
    return options[hour % options.length]!;
  }

  const timeHi =
    part === 'morning'
      ? guest
        ? `Buenos días, ${guest}.`
        : 'Buenos días.'
      : part === 'afternoon'
        ? guest
          ? `Buenas tardes, ${guest}.`
          : 'Buenas tardes.'
        : part === 'evening'
          ? guest
            ? `Buenas noches, ${guest}.`
            : 'Buenas noches.'
          : guest
            ? `Hola de nuevo, ${guest}.`
            : 'Hola de nuevo.';

  if (idle >= 12 * 60) {
    return `${timeHi} Qué gusto verte otra vez en ${rest}. ¿Qué se te antoja?`;
  }
  if (idle >= 60) {
    return `${timeHi} ¿Seguimos con el pedido o empezamos de nuevo?`;
  }
  return `${timeHi} ¿En qué te ayudo?`;
}

export const ORDER_COMPLETED_NOTICE = 'Pedido finalizado';

/** Idle gap that triggers a fresh return greeting (30 min). */
export const RETURN_GREETING_IDLE_MS = 30 * 60 * 1000;

const LAST_ACTIVE_PREFIX = 'elmenuxfa:chat-last-active-v1:';
const AFTER_ORDER_PREFIX = 'elmenuxfa:chat-after-order-v1:';

export function readChatLastActive(comercioId: string): number | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(
      `${LAST_ACTIVE_PREFIX}${encodeURIComponent(comercioId)}`,
    );
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

export function writeChatLastActive(comercioId: string, at = Date.now()): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(
      `${LAST_ACTIVE_PREFIX}${encodeURIComponent(comercioId)}`,
      String(at),
    );
  } catch {
    /* ignore */
  }
}

export function markChatAfterOrder(comercioId: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(
      `${AFTER_ORDER_PREFIX}${encodeURIComponent(comercioId)}`,
      '1',
    );
  } catch {
    /* ignore */
  }
}

export function consumeChatAfterOrder(comercioId: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const key = `${AFTER_ORDER_PREFIX}${encodeURIComponent(comercioId)}`;
    const v = window.sessionStorage.getItem(key);
    if (v !== '1') return false;
    window.sessionStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}
