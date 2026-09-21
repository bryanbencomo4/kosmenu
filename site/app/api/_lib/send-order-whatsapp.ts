import { parsePhoneNumberFromString } from 'libphonenumber-js';

import { publicSiteUrl } from './public-site-url';

export type SendOrderNotificationResult = {
  ok: true;
  recipient: string;
  response: unknown;
};

type SendOrderNotificationOptions = {
  businessName?: string;
  businessSlug?: string;
  trackingUrl?: string;
};

type WasenderErrorPayload = {
  message?: string;
  error?: string;
};

const DEFAULT_WASENDER_ENDPOINT = 'https://www.wasenderapi.com/api/send-message';

export function statusNotificationTitle(status: string) {
  switch ((status ?? '').toString().trim().toLowerCase()) {
    case 'confirmado':
      return { emoji: '✅', label: 'Confirmado' };
    case 'preparando':
      return { emoji: '👨‍🍳', label: 'Preparando' };
    case 'en_camino':
      return { emoji: '🛵', label: 'En camino' };
    case 'entregado':
      return { emoji: '🎉', label: 'Entregado' };
    case 'cancelado':
      return { emoji: '⚠️', label: 'Cancelado' };
    case 'pendiente':
    default:
      return { emoji: '🧾', label: 'Recibido' };
  }
}

export function buildCustomerOrderWhatsappText(input: {
  orderId: string;
  status: string;
  trackingUrl: string;
}) {
  const title = statusNotificationTitle(input.status);
  const orderId = (input.orderId ?? '').toString().trim();
  const trackingUrl = (input.trackingUrl ?? '').toString().trim();

  return [`${title.emoji} *${title.label}*`, orderId ? `#${orderId}` : '', '', trackingUrl]
    .filter((line, index, lines) => line !== '' || lines[index + 1])
    .join('\n')
    .trim();
}

export function canSendOrderNotification() {
  return Boolean(process.env.WASENDER_API_KEY?.trim());
}

export function normalizePhoneToE164(phone: string) {
  const raw = (phone ?? '').toString().trim();
  if (!raw) {
    throw new Error('Invalid phone number.');
  }

  const normalizedInput = raw.startsWith('00') ? `+${raw.slice(2)}` : raw;
  const parsed = parsePhoneNumberFromString(normalizedInput, 'VE');
  if (parsed?.isValid()) {
    return parsed.format('E.164');
  }

  const digits = raw.replace(/\D/g, '');
  if (/^(?:58)?4\d{9}$/.test(digits)) {
    const local = digits.startsWith('58') ? digits.slice(2) : digits;
    return `+58${local}`;
  }

  if (/^0?4\d{9}$/.test(digits)) {
    return `+58${digits.replace(/^0/, '')}`;
  }

  if (/^\d{10,15}$/.test(digits)) {
    return `+${digits}`;
  }

  throw new Error('Invalid phone number.');
}

export async function sendOrderNotification(
  phone: string,
  customerName: string,
  orderId: string,
  status: string,
  options?: SendOrderNotificationOptions,
): Promise<SendOrderNotificationResult> {
  const recipient = normalizePhoneToE164(phone);
  const safeOrderId = (orderId ?? '').toString().trim();
  const safeBusinessSlug = (options?.businessSlug ?? '').toString().trim();

  if (!safeOrderId) {
    throw new Error('Invalid orderId.');
  }

  const businessUrl = safeBusinessSlug
    ? `${publicSiteUrl}/v/${encodeURIComponent(safeBusinessSlug)}`
    : publicSiteUrl;
  const trackingUrl =
    (options?.trackingUrl ?? '').toString().trim() ||
    `${businessUrl}/orders/${encodeURIComponent(safeOrderId)}`;
  const text = buildCustomerOrderWhatsappText({
    orderId: safeOrderId,
    status,
    trackingUrl,
  });

  return sendWhatsappText(recipient, text);
}

export async function sendWhatsappText(
  phone: string,
  text: string,
): Promise<SendOrderNotificationResult> {
  const apiKey = process.env.WASENDER_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('WASENDER_API_KEY not configured.');
  }

  const endpoint = process.env.WASENDER_API_ENDPOINT?.trim() || DEFAULT_WASENDER_ENDPOINT;
  const recipient = normalizePhoneToE164(phone);
  let lastError = `WASenderAPI request failed.`;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        to: recipient,
        text,
      }),
    });

    const rawBody = await response.text();
    let payload: unknown = null;

    try {
      payload = rawBody ? JSON.parse(rawBody) : null;
    } catch {
      payload = rawBody;
    }

    if (response.ok) {
      return {
        ok: true,
        recipient,
        response: payload,
      };
    }

    const message = typeof payload === 'object' && payload !== null
      ? (((payload as WasenderErrorPayload).message ?? (payload as WasenderErrorPayload).error ?? '').toString())
      : String(payload ?? '');
    const normalizedMessage = message.toLowerCase();
    lastError = message || `WASenderAPI request failed with status ${response.status}.`;

    if (response.status === 401 || response.status === 403) {
      throw new Error('WASenderAPI rejected the credentials. Check or renew the API key.');
    }

    if (
      response.status === 400 ||
      response.status === 422 ||
      normalizedMessage.includes('invalid') ||
      normalizedMessage.includes('phone') ||
      normalizedMessage.includes('number')
    ) {
      throw new Error(`Invalid WhatsApp number: ${recipient}.`);
    }

    if (attempt === 2 || (response.status !== 429 && response.status < 500)) {
      break;
    }
  }

  throw new Error(lastError);
}