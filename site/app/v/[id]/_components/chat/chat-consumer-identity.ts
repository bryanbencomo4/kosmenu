/**
 * Soft first-visit name + WhatsApp capture for chat.
 * Cached per commerce on-device; seeds from checkout customer cache.
 */

import {
  readCachedCheckoutCustomer,
  writeCachedCheckoutCustomer,
} from '../../../../_lib/checkout-customer-cache';

const PREFIX = 'elmenuxfa:chat-identity-v1:';

export type ChatConsumerIdentity = {
  name: string;
  whatsapp: string;
  askedAt?: string;
  declinedAt?: string;
  phoneRemindedAt?: string;
  savedAt?: string;
};

function clean(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function storageKey(comercioId: string): string {
  return `${PREFIX}${encodeURIComponent(comercioId.trim() || 'unknown')}`;
}

function fold(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[¿?¡!.,;:]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function readChatConsumerIdentity(
  comercioId: string,
): ChatConsumerIdentity | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(storageKey(comercioId));
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<ChatConsumerIdentity>;
      return {
        name: clean(parsed.name),
        whatsapp: clean(parsed.whatsapp),
        askedAt: clean(parsed.askedAt) || undefined,
        declinedAt: clean(parsed.declinedAt) || undefined,
        phoneRemindedAt: clean(parsed.phoneRemindedAt) || undefined,
        savedAt: clean(parsed.savedAt) || undefined,
      };
    }
  } catch {
    /* ignore */
  }
  // Seed from checkout if the guest already completed "Tus datos".
  const checkout = readCachedCheckoutCustomer();
  if (!checkout) return null;
  const name = clean(checkout.clientName);
  const whatsapp = clean(checkout.clientWhatsapp);
  if (!name && !whatsapp) return null;
  return { name, whatsapp, savedAt: checkout.savedAt };
}

export function writeChatConsumerIdentity(
  comercioId: string,
  patch: Partial<ChatConsumerIdentity>,
): ChatConsumerIdentity {
  const prev = readChatConsumerIdentity(comercioId) || {
    name: '',
    whatsapp: '',
  };
  const next: ChatConsumerIdentity = {
    name: clean(patch.name !== undefined ? patch.name : prev.name),
    whatsapp: clean(
      patch.whatsapp !== undefined ? patch.whatsapp : prev.whatsapp,
    ),
    askedAt: clean(patch.askedAt !== undefined ? patch.askedAt : prev.askedAt) || undefined,
    declinedAt:
      clean(
        patch.declinedAt !== undefined ? patch.declinedAt : prev.declinedAt,
      ) || undefined,
    phoneRemindedAt:
      clean(
        patch.phoneRemindedAt !== undefined
          ? patch.phoneRemindedAt
          : prev.phoneRemindedAt,
      ) || undefined,
    savedAt: new Date().toISOString(),
  };
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(storageKey(comercioId), JSON.stringify(next));
    } catch {
      /* private mode */
    }
  }
  // Keep checkout form in sync so pay flow doesn't re-ask.
  if (next.name || next.whatsapp) {
    const checkout = readCachedCheckoutCustomer();
    writeCachedCheckoutCustomer({
      clientName: next.name || checkout?.clientName || '',
      clientWhatsapp: next.whatsapp || checkout?.clientWhatsapp || '',
      clientEmail: checkout?.clientEmail || '',
      wantOrderEmail: checkout?.wantOrderEmail,
      selectedCurrency: checkout?.selectedCurrency,
    });
  }
  return next;
}

export function buildConsumerLabel(identity: {
  name?: string | null;
  whatsapp?: string | null;
}): string | null {
  const name = clean(identity.name);
  const phone = clean(identity.whatsapp);
  if (name && phone) return `${name} · ${phone}`;
  if (name) return name;
  if (phone) return phone;
  return null;
}

export function buildSoftIdentityAskText(): string {
  // Prefer chat-onboarding copy; kept for older imports/tests.
  return 'No te tenemos registrado todavía. ¿Nos regalas tu nombre y WhatsApp para mantenerte al tanto del pedido?';
}

export function buildSoftPhoneReminderText(name: string): string {
  const first = clean(name).split(/\s+/)[0] || '';
  const hi = first ? `${first}, ` : '';
  return `${hi}si más adelante quieres dejar un WhatsApp para el pedido, me avisas.`;
}

/** Words that are never a personal name. */
const NAME_BLOCKLIST = new Set([
  'no',
  'nop',
  'nope',
  'nah',
  'nel',
  'si',
  'sí',
  'ok',
  'okay',
  'hola',
  'buenas',
  'menu',
  'menú',
  'pizza',
  'gracias',
  'nada',
  'luego',
  'despues',
  'después',
  'ya',
  'claro',
  'dale',
  'listo',
  'bueno',
  'bien',
  'mal',
  'tal',
  'vez',
  'pasar',
  'omitir',
  'skip',
]);

const DECLINE_RE =
  /^(no|nop|nope|nah|nel|nope\.|no gracias|ahora no|mejor no|prefiero no|no quiero|no doy|no paso|sin datos|omitir|pasar|luego|despues|después|skip)([.!]?|\s+gracias)?$/i;

export function matchIdentityDecline(text: string | null | undefined): boolean {
  const norm = fold(text ?? '');
  if (!norm || norm.split(' ').length > 8) return false;
  if (DECLINE_RE.test(norm)) return true;
  // "no, gracias" / "no gracias por ahora"
  if (/^no\b/.test(norm) && norm.split(' ').length <= 5) {
    if (
      /\b(gracias|ahora|luego|despues|después|quiero|doy|paso|prefiero|mejor)\b/.test(
        norm,
      ) ||
      norm === 'no'
    ) {
      return true;
    }
  }
  return false;
}

/** Extract VE / international phone from free text. */
export function extractWhatsappFromText(text: string): string | null {
  const raw = (text || '').replace(/[()\-\s.]/g, ' ');
  // +58… or 58… (10–13 digits after country) or local 04xx…
  const intl = raw.match(
    /(?:\+|00)?\s*(?:58)?\s*(0?4(?:12|14|16|24|26)\d{7}|\d{10,12})\b/,
  );
  if (intl) {
    let digits = intl[0].replace(/\D/g, '');
    if (digits.startsWith('00')) digits = digits.slice(2);
    if (digits.startsWith('0') && digits.length === 11) {
      digits = `58${digits.slice(1)}`;
    } else if (digits.length === 10 && digits.startsWith('4')) {
      digits = `58${digits}`;
    } else if (!digits.startsWith('58') && digits.length >= 10) {
      /* keep as-is for other countries */
    }
    if (digits.length >= 10 && digits.length <= 15) return `+${digits}`;
  }
  const loose = (text || '').match(/\+?\d[\d\s\-()]{8,18}\d/);
  if (loose) {
    const digits = loose[0].replace(/\D/g, '');
    if (digits.length >= 10 && digits.length <= 15) {
      return digits.startsWith('0') ? `+58${digits.slice(1)}` : `+${digits}`;
    }
  }
  return null;
}

export function extractNameFromText(text: string): string | null {
  const trimmed = clean(text);
  if (!trimmed) return null;
  const withoutPhone = trimmed
    .replace(/\+?\d[\d\s\-()]{7,}\d/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const named = withoutPhone.match(
    /(?:me llamo|soy|mi nombre (?:es|:)|nombre[:\s]+)\s*([A-Za-zÁÉÍÓÚÜÑáéíóúüñ][A-Za-zÁÉÍÓÚÜÑáéíóúüñ' -]{1,40})/i,
  );
  if (named?.[1]) {
    const candidate = clean(named[1]);
    const first = fold(candidate.split(/\s+/)[0] || '');
    if (NAME_BLOCKLIST.has(first) || matchIdentityDecline(candidate)) {
      return null;
    }
    return candidate.replace(/\b\w/g, (c) => c.toUpperCase());
  }
  // Short reply that looks like a bare name (1–3 words, letters only).
  const words = withoutPhone.split(/\s+/).filter(Boolean);
  if (
    words.length >= 1 &&
    words.length <= 3 &&
    words.every((w) => /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ'-]+$/.test(w)) &&
    !matchIdentityDecline(withoutPhone) &&
    withoutPhone.length <= 40
  ) {
    const first = fold(words[0] || '');
    if (NAME_BLOCKLIST.has(first)) return null;
    if (words.every((w) => NAME_BLOCKLIST.has(fold(w)))) return null;
    return words
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ');
  }
  return null;
}

export function parseIdentityReply(text: string): {
  declined: boolean;
  name: string | null;
  whatsapp: string | null;
} {
  if (matchIdentityDecline(text)) {
    return { declined: true, name: null, whatsapp: null };
  }
  return {
    declined: false,
    name: extractNameFromText(text),
    whatsapp: extractWhatsappFromText(text),
  };
}

/**
 * True when we still need name capture.
 * Do NOT gate on askedAt alone — that caused silent "already asked" without a bubble.
 */
export function needsIdentityCapture(
  identity: ChatConsumerIdentity | null,
): boolean {
  if (identity?.declinedAt) return false;
  if (clean(identity?.name || '')) return false;
  return true;
}

/** @deprecated use needsIdentityCapture — kept for older call sites/tests. */
export function shouldAskForIdentity(
  identity: ChatConsumerIdentity | null,
): boolean {
  return needsIdentityCapture(identity);
}

/** Short greetings that must not skip identity capture via Gemini. */
export function matchGreetingOnly(text: string | null | undefined): boolean {
  const norm = fold(text ?? '');
  return /^(hola|holaa+|buenas|buen[oa]s( (dias|tardes|noches))?|hey|hi|hello|saludos)(!|\.)?$/.test(
    norm,
  );
}

export function shouldRemindPhone(
  identity: ChatConsumerIdentity | null,
): boolean {
  if (!identity) return false;
  if (identity.declinedAt) return false;
  if (!clean(identity.name)) return false;
  if (clean(identity.whatsapp)) return false;
  if (identity.phoneRemindedAt) return false;
  return true;
}
