import 'server-only';

import { createHash } from 'node:crypto';
import { parsePhoneNumberFromString } from 'libphonenumber-js';

import { publicSiteUrl } from './public-site-url';
import { getServiceSupabaseClient } from './supabase-server';

export type SendOrderNotificationResult = {
  ok: true;
  recipient: string;
  response: unknown;
  queued: boolean;
};

type SendOrderNotificationOptions = {
  businessName?: string;
  businessSlug?: string;
  trackingUrl?: string;
};

export type WhatsappQueueMetadata = {
  source?: string;
  dedupeKey?: string;
  comercioId?: string | null;
  pedidoId?: string | null;
  orderId?: string | null;
  deliveryInvitationId?: string | null;
  deliveryActor?: string | null;
};

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
  metadata: WhatsappQueueMetadata = {},
): Promise<SendOrderNotificationResult> {
  if (!process.env.WASENDER_API_KEY?.trim()) {
    throw new Error('WASENDER_API_KEY not configured.');
  }

  const recipient = normalizePhoneToE164(phone);
  const dedupeKey = metadata.dedupeKey?.trim() || createHash('sha256')
    .update(`${recipient}\n${text}`)
    .digest('hex');
  const { data, error } = await getServiceSupabaseClient().rpc('enqueue_wasender_message', {
    p_source: metadata.source?.trim() || 'next-api',
    p_recipient: recipient,
    p_message: text,
    p_dedupe_key: dedupeKey,
    p_comercio_id: metadata.comercioId ?? null,
    p_pedido_id: metadata.pedidoId ?? null,
    p_order_id: metadata.orderId ?? null,
    p_delivery_invitation_id: metadata.deliveryInvitationId ?? null,
    p_delivery_actor: metadata.deliveryActor ?? null,
  });

  if (error) {
    throw new Error(`Unable to queue WASender message: ${error.message}`);
  }

  const row = Array.isArray(data) ? data[0] as Record<string, unknown> | undefined : undefined;
  const queueId = (row?.queue_id ?? '').toString().trim();
  if (!queueId) {
    throw new Error('WASender queue did not return a message id.');
  }
  const queued = row?.queued === true;

  return {
    ok: true,
    recipient,
    queued,
    response: { queueId, alreadyProcessed: !queued },
  };
}