/**
 * WaSender interactive modality helpers (documented: polls only).
 *
 * Evidence:
 * - Messages API lists text/media/contact/location/poll/quoted — no reply-button
 *   or list-message endpoints:
 *   https://www.wasenderapi.com/api-docs/messages
 * - Official help: polls as button alternative:
 *   https://www.wasenderapi.com/help/messaging/using-polls-as-buttons
 * - Send: POST /api/send-message with { to, poll: { question, options, multiSelect } }
 * - Receive: webhook event `poll.results` (not messages.received)
 *
 * Native reply buttons / interactive lists: NOT verified in WaSender API docs.
 */

export type WaInteractiveMode = 'text' | 'poll';

export type WaPollPayload = {
  question: string;
  options: string[];
  multiSelect: false;
};

/** Stable option labels — also used as poll.results `name` (no separate option id). */
export const POLL_OPTION_CONSUMER = '🍔 Pedir comida';
export const POLL_OPTION_BUSINESS = '🏪 Tengo un negocio';
export const POLL_OPTION_BIZ_REGISTER = 'Registrar mi menú';
export const POLL_OPTION_BIZ_MANAGE = 'Gestionar mi menú';

export const WA_POLL_PREFIX = '__WA_ENTRY_POLL__:';

export function welcomePoll(): WaPollPayload {
  return {
    question: [
      '¡Hola! 👋 Bienvenido a elmenuxfa.com.',
      '',
      '¿Qué te gustaría hacer hoy? 😊',
    ].join('\n'),
    options: [POLL_OPTION_CONSUMER, POLL_OPTION_BUSINESS],
    multiSelect: false,
  };
}

export function businessMenuPoll(): WaPollPayload {
  return {
    question: [
      '¡Qué bueno tenerte por aquí! 🏪😊',
      '',
      '¿Qué te gustaría hacer con tu negocio?',
    ].join('\n'),
    options: [POLL_OPTION_BIZ_REGISTER, POLL_OPTION_BIZ_MANAGE],
    multiSelect: false,
  };
}

export function encodePollReply(poll: WaPollPayload): string {
  return `${WA_POLL_PREFIX}${JSON.stringify(poll)}`;
}

export function tryDecodePollReply(text: string): WaPollPayload | null {
  const raw = (text || '').trim();
  if (!raw.startsWith(WA_POLL_PREFIX)) return null;
  try {
    const parsed = JSON.parse(raw.slice(WA_POLL_PREFIX.length)) as unknown;
    if (!parsed || typeof parsed !== 'object') return null;
    const p = parsed as Record<string, unknown>;
    if (typeof p.question !== 'string' || !Array.isArray(p.options)) return null;
    const options = p.options.filter((o): o is string => typeof o === 'string' && o.trim().length > 0);
    if (options.length < 2) return null;
    return {
      question: p.question,
      options,
      multiSelect: false,
    };
  } catch {
    return null;
  }
}

/** Documented Wasender poll body for POST /api/send-message (not sent unless authorized). */
export function toWasenderPollBody(toE164: string, poll: WaPollPayload): {
  to: string;
  poll: { question: string; options: string[]; multiSelect: false };
} {
  return {
    to: toE164.startsWith('+') ? toE164 : `+${toE164}`,
    poll: {
      question: poll.question,
      options: poll.options,
      multiSelect: false,
    },
  };
}
