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

const DEFAULT_WASENDER_ENDPOINT = 'https://wasenderapi.com/api/send-message';

function normalizeStatusLabel(status: string) {
  const value = (status ?? '').toString().trim();
  if (!value) return 'Pendiente';
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function messageLinesByStatus(status: string) {
  const normalized = (status ?? '').toString().trim().toLowerCase();

  switch (normalized) {
    case 'confirmado':
      return {
        emoji: '✅',
        headline: 'Tu pedido fue confirmado y ya entro en preparacion.',
        detail: 'Muy pronto tendras una nueva actualizacion con el siguiente avance.',
      };
    case 'preparando':
      return {
        emoji: '👨‍🍳',
        headline: 'Tu pedido ya se esta preparando.',
        detail: 'Estamos afinando los ultimos detalles para que todo salga perfecto.',
      };
    case 'en_camino':
      return {
        emoji: '🛵',
        headline: 'Tu pedido ya va en camino.',
        detail: 'Te recomendamos estar atento al telefono o al punto de entrega.',
      };
    case 'entregado':
      return {
        emoji: '🎉',
        headline: 'Tu pedido fue entregado con exito.',
        detail: 'Gracias por confiar en elmenuxfa.com. Esperamos verte de nuevo pronto.',
      };
    case 'cancelado':
      return {
        emoji: '⚠️',
        headline: 'Tu pedido fue cancelado.',
        detail: 'Si necesitas ayuda adicional, puedes comunicarte con el negocio desde el seguimiento.',
      };
    case 'pendiente':
    default:
      return {
        emoji: '🧾',
        headline: 'Recibimos tu pedido y ya quedo registrado correctamente.',
        detail: 'Te avisaremos por aqui apenas cambie de estado.',
      };
  }
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
  const apiKey = process.env.WASENDER_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('WASENDER_API_KEY not configured.');
  }

  const endpoint = process.env.WASENDER_API_ENDPOINT?.trim() || DEFAULT_WASENDER_ENDPOINT;
  const recipient = normalizePhoneToE164(phone);
  const recipientForApi = recipient.replace(/^\+/, '');
  const safeCustomerName = (customerName ?? '').toString().trim() || 'cliente';
  const safeOrderId = (orderId ?? '').toString().trim();
  const safeBusinessName = (options?.businessName ?? 'elmenuxfa.com').toString().trim() || 'elmenuxfa.com';
  const safeBusinessSlug = (options?.businessSlug ?? '').toString().trim();

  if (!safeOrderId) {
    throw new Error('Invalid orderId.');
  }

  const businessUrl = safeBusinessSlug
    ? `${publicSiteUrl}/v/${encodeURIComponent(safeBusinessSlug)}`
    : publicSiteUrl;
  const trackingUrl = (options?.trackingUrl ?? '').toString().trim() || `${businessUrl}/orders/${encodeURIComponent(safeOrderId)}`;
  const statusLabel = normalizeStatusLabel(status);
  const messageVariant = messageLinesByStatus(status);

  const text = [
    `Hola ${safeCustomerName} 👋`,
    '',
    `${messageVariant.emoji} *${safeBusinessName}*`,
    `Pedido #${safeOrderId}`,
    '',
    `${messageVariant.headline}`,
    `Estado actual: *${statusLabel}*.`,
    `${messageVariant.detail}`,
    '',
    `🛍️ Negocio: ${businessUrl}`,
    `🔎 Sigue tu pedido aqui: ${trackingUrl}`,
    '',
    'Gracias por ordenar con elmenuxfa.com ✨',
  ].join('\n');

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      to: recipientForApi,
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

  if (!response.ok) {
    const message = typeof payload === 'object' && payload !== null
      ? (((payload as WasenderErrorPayload).message ?? (payload as WasenderErrorPayload).error ?? '').toString())
      : String(payload ?? '');
    const normalizedMessage = message.toLowerCase();

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

    throw new Error(message || `WASenderAPI request failed with status ${response.status}.`);
  }

  return {
    ok: true,
    recipient,
    response: payload,
  };
}