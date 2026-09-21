/// <reference path="../_shared/edge-runtime.d.ts" />

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { importPKCS8, SignJWT } from 'https://esm.sh/jose@5.9.6';

type WebhookPayload = {
  type?: string;
  table?: string;
  schema?: string;
  record?: Record<string, unknown>;
  old_record?: Record<string, unknown>;
};

type PedidoRecord = {
  id?: string;
  comercio_id?: string;
  estado?: string;
  telefono_cliente?: string;
  nombre_cliente?: string;
  cliente_email?: string;
  detalles?: {
    order_id?: string;
    codigo_orden?: string;
    telefono_cliente?: string;
    cliente_nombre?: string;
    nombre_cliente?: string;
    cliente_email?: string;
    notifications?: {
      whatsapp_enabled?: boolean;
    };
    [key: string]: unknown;
  };
};

type CommerceInfo = {
  ownerId: string;
  name: string;
  slug: string;
  whatsapp: string;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const FIREBASE_AUTH_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
const FIREBASE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const DEFAULT_WASENDER_ENDPOINT = 'https://www.wasenderapi.com/api/send-message';
const DEFAULT_PUBLIC_SITE_URL = 'https://elmenuxfa.com';
const DEFAULT_APP_SITE_URL = 'https://app.elmenuxfa.com';

function getPublicSiteUrl(): string {
  return (Deno.env.get('PUBLIC_SITE_URL') ?? DEFAULT_PUBLIC_SITE_URL).trim().replace(/\/$/, '');
}

function getAppSiteUrl(): string {
  return (Deno.env.get('APP_SITE_URL') ?? DEFAULT_APP_SITE_URL).trim().replace(/\/$/, '');
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed.' }, 405);
  }

  try {
    const body = (await req.json()) as WebhookPayload | PedidoRecord;
    const eventType = extractEventType(body);
    const record = extractRecord(body);
    const oldRecord = extractOldRecord(body);
    const comercioId = (record.comercio_id ?? '').trim();
    const orderId = resolveOrderId(record);
    const currentStatus = normalizeOrderStatus(record.estado);
    const previousStatus = normalizeOrderStatus(oldRecord.estado);
    const statusChanged = eventType === 'UPDATE' && currentStatus !== previousStatus;
    const customerPhone = resolveCustomerPhone(record);
    const customerName = resolveCustomerName(record);

    if (!comercioId) {
      return jsonResponse({ ok: false, error: 'Missing comercio_id in webhook payload.' }, 400);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const firebaseProjectId = (Deno.env.get('FIREBASE_PROJECT_ID') ?? '').trim();
    const firebaseClientEmail = (Deno.env.get('FIREBASE_CLIENT_EMAIL') ?? '').trim();
    const firebasePrivateKey = normalizePrivateKey(Deno.env.get('FIREBASE_PRIVATE_KEY') ?? '');
    const waSenderApiKey = (Deno.env.get('WASENDER_API_KEY') ?? '').trim();
    const waSenderEndpoint = (Deno.env.get('WASENDER_API_ENDPOINT') ?? '').trim() || DEFAULT_WASENDER_ENDPOINT;

    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse(
        { error: 'Missing env vars: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.' },
        500,
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    const commerce = await loadCommerceInfo(supabase, comercioId);
    const pedidoId = (record.id ?? '').toString().trim();
    const shouldSendPush = eventType === 'INSERT';
    const shouldSendWhatsapp = eventType === 'INSERT' || statusChanged;
    const shouldSendMerchantWhatsapp = eventType === 'INSERT';

    const merchantWhatsappResult = shouldSendMerchantWhatsapp
      ? await maybeSendMerchantWhatsappNotification({
          supabase,
          apiKey: waSenderApiKey,
          endpoint: waSenderEndpoint,
          record,
          customerName,
          orderId,
          commerce,
          pedidoId,
          eventType,
        })
      : { ok: true, skipped: true, reason: 'not-new-order' };

    const whatsappResult = shouldSendWhatsapp
      ? await maybeSendWhatsappNotification({
          supabase,
          apiKey: waSenderApiKey,
          endpoint: waSenderEndpoint,
          record,
          customerPhone,
          customerName,
          currentStatus,
          orderId,
          commerce,
          pedidoId,
          eventType,
        })
      : { ok: true, skipped: true, reason: 'status-unchanged' };

    const pushResult = shouldSendPush
      ? await maybeSendPushNotifications({
          supabase,
          commerce,
          firebaseProjectId,
          firebaseClientEmail,
          firebasePrivateKey,
          orderId,
          pedidoId,
          eventType,
          statusKey: currentStatus,
        })
      : { ok: true, skipped: true, reason: 'push-not-applicable' };

    return jsonResponse(
      {
        ok: true,
        eventType,
        comercioId,
        orderId,
        previousStatus,
        currentStatus,
        statusChanged,
        push: pushResult,
        whatsapp: whatsappResult,
        merchantWhatsapp: merchantWhatsappResult,
      },
      200,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown notify-order error.';
    return jsonResponse({ error: message }, 500);
  }
});

function extractEventType(payload: WebhookPayload | PedidoRecord): string {
  return ((payload as WebhookPayload).type ?? 'INSERT').toString().trim().toUpperCase() || 'INSERT';
}

function extractRecord(payload: WebhookPayload | PedidoRecord): PedidoRecord {
  if ((payload as WebhookPayload).record) {
    return asPedidoRecord((payload as WebhookPayload).record);
  }

  return asPedidoRecord(payload);
}

function extractOldRecord(payload: WebhookPayload | PedidoRecord): PedidoRecord {
  const oldRecord = (payload as WebhookPayload).old_record;
  if (oldRecord) {
    return asPedidoRecord(oldRecord);
  }

  return {};
}

function asPedidoRecord(value: unknown): PedidoRecord {
  if (!value || typeof value !== 'object') {
    return {};
  }

  const map = value as Record<string, unknown>;
  const detallesRaw = map['detalles'];
  const detallesMap =
    detallesRaw && typeof detallesRaw === 'object'
      ? (detallesRaw as Record<string, unknown>)
      : null;
  const notificationsRaw = detallesMap?.['notifications'];
  const detalles =
    detallesMap != null
      ? ({
          ...detallesMap,
          order_id: detallesMap['order_id']?.toString(),
          codigo_orden: detallesMap['codigo_orden']?.toString(),
          telefono_cliente: detallesMap['telefono_cliente']?.toString(),
          cliente_nombre: detallesMap['cliente_nombre']?.toString(),
          nombre_cliente: detallesMap['nombre_cliente']?.toString(),
          cliente_email: detallesMap['cliente_email']?.toString(),
          notifications:
              notificationsRaw != null && typeof notificationsRaw === 'object'
          ? {
              whatsapp_enabled:
                  (notificationsRaw as Record<string, unknown>)['whatsapp_enabled'] === false
                      ? false
                      : undefined,
            }
          : undefined,
        } as PedidoRecord['detalles'])
      : undefined;

  return {
    id: map['id']?.toString(),
    comercio_id: map['comercio_id']?.toString(),
    estado: map['estado']?.toString(),
    telefono_cliente: map['telefono_cliente']?.toString(),
    nombre_cliente: map['nombre_cliente']?.toString(),
    cliente_email: map['cliente_email']?.toString(),
    detalles,
  };
}

function resolveOrderId(record: PedidoRecord): string {
  const detallesOrderId =
    (record.detalles?.order_id ?? record.detalles?.codigo_orden ?? '')
      .toString()
      .trim();
  if (detallesOrderId.length > 0) {
    return detallesOrderId;
  }

  return (record.id ?? '').trim();
}

function normalizePrivateKey(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }

  return trimmed.replace(/\\n/g, '\n');
}

function resolveCustomerPhone(record: PedidoRecord): string {
  return (
    record.telefono_cliente?.toString().trim() ||
    record.detalles?.telefono_cliente?.toString().trim() ||
    ''
  );
}

function resolveCustomerName(record: PedidoRecord): string {
  return (
    record.nombre_cliente?.toString().trim() ||
    record.detalles?.nombre_cliente?.toString().trim() ||
    record.detalles?.cliente_nombre?.toString().trim() ||
    'cliente'
  );
}

function isWhatsappNotificationsEnabled(record: PedidoRecord): boolean {
  return record.detalles?.notifications?.whatsapp_enabled !== false;
}

function normalizeOrderStatus(value: unknown): string {
  const raw = (value ?? '').toString().trim().toLowerCase();
  if (!raw) return 'pendiente';
  if (raw === 'pendiente' || raw === 'nuevo' || raw === 'recibido' || raw === 'por_confirmar' || raw === 'por confirmar') {
    return 'pendiente';
  }
  if (raw === 'confirmado' || raw === 'aceptado') {
    return 'confirmado';
  }
  if (
    raw === 'en_proceso' ||
    raw === 'en proceso' ||
    raw === 'preparando' ||
    raw === 'preparacion' ||
    raw === 'preparación' ||
    raw === 'listo'
  ) {
    return 'preparando';
  }
  if (raw === 'en_camino' || raw === 'en camino' || raw === 'despachado') {
    return 'en_camino';
  }
  if (raw === 'completado' || raw === 'finalizado' || raw === 'entregado') {
    return 'entregado';
  }
  if (raw === 'cancelado' || raw === 'rechazado' || raw === 'anulado') {
    return 'cancelado';
  }
  return raw.replace(/\s+/g, '_');
}

function statusNotificationTitle(status: string) {
  switch (status) {
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

function buildTrackingUrl(orderId: string, slug: string, trackingToken?: string): string {
  const publicSiteUrl = getPublicSiteUrl();
  const path = slug
    ? `${publicSiteUrl}/v/${encodeURIComponent(slug)}/orders/${encodeURIComponent(orderId)}`
    : `${publicSiteUrl}/orders/${encodeURIComponent(orderId)}`;

  const token = (trackingToken ?? '').trim();
  if (!token) {
    return path;
  }

  return `${path}?t=${encodeURIComponent(token)}`;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function generatePublicTrackingToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}

async function hashPublicTrackingToken(token: string): Promise<string> {
  const data = new TextEncoder().encode(token.trim());
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function extractStoredTrackingUrl(record: PedidoRecord): string {
  const detalles = record.detalles && typeof record.detalles === 'object' ? record.detalles : null;
  const raw = (detalles?.tracking_url ?? '').toString().trim();
  if (!raw) {
    return '';
  }

  try {
    const site = new URL(getPublicSiteUrl());
    const parsed = new URL(raw, site.origin);
    if (parsed.origin !== site.origin) {
      return '';
    }

    const token = (parsed.searchParams.get('t') ?? parsed.searchParams.get('token') ?? '').trim();
    if (!token) {
      return '';
    }

    return parsed.toString();
  } catch {
    return '';
  }
}

async function ensureTrackingUrl(params: {
  supabase: ReturnType<typeof createClient>;
  record: PedidoRecord;
  orderId: string;
  businessSlug: string;
}): Promise<string> {
  const stored = extractStoredTrackingUrl(params.record);
  if (stored) {
    return stored;
  }

  const pedidoId = (params.record.id ?? '').trim();
  if (!pedidoId) {
    return buildTrackingUrl(params.orderId, params.businessSlug);
  }

  const token = generatePublicTrackingToken();
  const tokenHash = await hashPublicTrackingToken(token);
  const trackingUrl = buildTrackingUrl(params.orderId, params.businessSlug, token);

  const currentDetalles =
    params.record.detalles && typeof params.record.detalles === 'object'
      ? { ...(params.record.detalles as Record<string, unknown>) }
      : {};

  const nextDetalles = {
    ...currentDetalles,
    tracking_url: trackingUrl,
    public_tracking_token_hash: tokenHash,
  };

  const { error } = await params.supabase
    .from('pedidos')
    .update({
      detalles: nextDetalles,
      public_tracking_token_hash: tokenHash,
    })
    .eq('id', pedidoId);

  if (error) {
    console.warn('ensureTrackingUrl update failed', {
      orderId: params.orderId,
      message: error.message,
    });
    return buildTrackingUrl(params.orderId, params.businessSlug);
  }

  return trackingUrl;
}

function buildWhatsappMessage(params: {
  customerName: string;
  orderId: string;
  businessName: string;
  businessSlug: string;
  status: string;
  trackingUrl: string;
}) {
  const trackingUrl = params.trackingUrl.trim() || buildTrackingUrl(params.orderId, params.businessSlug);
  const title = statusNotificationTitle(params.status);
  const orderId = params.orderId.trim();

  return [`${title.emoji} *${title.label}*`, orderId ? `#${orderId}` : '', '', trackingUrl]
    .filter((line, index, lines) => line !== '' || Boolean(lines[index + 1]))
    .join('\n')
    .trim();
}

function normalizePhoneToE164(phone: string): string {
  const raw = (phone ?? '').toString().trim();
  if (!raw) {
    throw new Error('Invalid phone number.');
  }

  const normalizedInput = raw.startsWith('00') ? `+${raw.slice(2)}` : raw;
  if (/^\+\d{10,15}$/.test(normalizedInput)) {
    return normalizedInput;
  }

  const digits = normalizedInput.replace(/\D/g, '');

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

async function claimNotificationSlot(
  supabase: ReturnType<typeof createClient>,
  params: {
    pedidoId: string;
    channel: 'whatsapp' | 'push';
    eventType: string;
    statusKey: string;
  },
): Promise<boolean> {
  if (!params.pedidoId) {
    return true;
  }

  const { error } = await supabase.from('order_notification_dedup').insert({
    pedido_id: params.pedidoId,
    channel: params.channel,
    event_type: params.eventType,
    status_key: params.statusKey,
  });

  if (!error) {
    return true;
  }

  if ((error as { code?: string }).code === '23505') {
    return false;
  }

  // Table may not exist yet in some environments — do not block delivery.
  console.warn('order_notification_dedup insert skipped', error.message);
  return true;
}

async function releaseNotificationSlot(
  supabase: ReturnType<typeof createClient>,
  params: {
    pedidoId: string;
    channel: 'whatsapp' | 'push';
    eventType: string;
    statusKey: string;
  },
) {
  if (!params.pedidoId) {
    return;
  }

  const { error } = await supabase
    .from('order_notification_dedup')
    .delete()
    .eq('pedido_id', params.pedidoId)
    .eq('channel', params.channel)
    .eq('event_type', params.eventType)
    .eq('status_key', params.statusKey);

  if (error) {
    console.warn('order_notification_dedup release skipped', error.message);
  }
}

async function maybeSendWhatsappNotification(params: {
  supabase: ReturnType<typeof createClient>;
  apiKey: string;
  endpoint: string;
  record: PedidoRecord;
  customerPhone: string;
  customerName: string;
  currentStatus: string;
  orderId: string;
  commerce: CommerceInfo;
  pedidoId: string;
  eventType: string;
}) {
  if (!isWhatsappNotificationsEnabled(params.record)) {
    return { ok: true, skipped: true, reason: 'whatsapp-disabled-by-customer' };
  }

  if (!params.apiKey) {
    return { ok: true, skipped: true, reason: 'wasender-key-missing' };
  }

  if (!params.customerPhone.trim()) {
    return { ok: true, skipped: true, reason: 'customer-phone-missing' };
  }

  const claimed = await claimNotificationSlot(params.supabase, {
    pedidoId: params.pedidoId,
    channel: 'whatsapp',
    eventType: params.eventType,
    statusKey: params.currentStatus,
  });
  if (!claimed) {
    return { ok: true, skipped: true, reason: 'whatsapp-already-sent' };
  }

  try {
    const recipient = normalizePhoneToE164(params.customerPhone);
    const trackingUrl = await ensureTrackingUrl({
      supabase: params.supabase,
      record: params.record,
      orderId: params.orderId,
      businessSlug: params.commerce.slug,
    });
    const text = buildWhatsappMessage({
      customerName: params.customerName,
      orderId: params.orderId,
      businessName: params.commerce.name,
      businessSlug: params.commerce.slug,
      status: params.currentStatus,
      trackingUrl,
    });

    return await sendWasenderText({
      apiKey: params.apiKey,
      endpoint: params.endpoint,
      recipient,
      text,
      orderId: params.orderId,
    });
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Unknown WhatsApp notification error.',
    };
  }
}

function resolveMerchantTotalLabel(record: PedidoRecord): string {
  const detalles = record.detalles ?? {};
  const currency = (detalles['moneda_checkout'] ?? '').toString().trim().toUpperCase();
  const totalRaw = detalles['total_moneda_checkout'] ?? detalles['total'];
  const total = typeof totalRaw === 'number' ? totalRaw : Number(totalRaw);
  if (!Number.isFinite(total)) {
    return '—';
  }
  const symbol = currency === 'USD' ? 'US$' : currency === 'VES' ? 'Bs.' : currency || '';
  return `${symbol} ${total.toFixed(2)}`.trim();
}

function buildMerchantWhatsappMessage(params: {
  businessName: string;
  orderId: string;
  customerName: string;
  totalLabel: string;
  appOrderUrl: string;
}) {
  const orderId = params.orderId.trim();
  const totalLabel = params.totalLabel.trim();
  const detail = [orderId ? `#${orderId}` : '', totalLabel && totalLabel !== '—' ? totalLabel : '']
    .filter(Boolean)
    .join(' · ');

  return [`💰 *Nuevo pedido*`, detail, '', params.appOrderUrl]
    .filter((line, index, lines) => line !== '' || Boolean(lines[index + 1]))
    .join('\n')
    .trim();
}

async function maybeSendMerchantWhatsappNotification(params: {
  supabase: ReturnType<typeof createClient>;
  apiKey: string;
  endpoint: string;
  record: PedidoRecord;
  customerName: string;
  orderId: string;
  commerce: CommerceInfo;
  pedidoId: string;
  eventType: string;
}) {
  if (!params.apiKey) {
    return { ok: true, skipped: true, reason: 'wasender-key-missing' };
  }

  const merchantPhone = (params.commerce.whatsapp ?? '').trim();
  if (!merchantPhone) {
    return { ok: true, skipped: true, reason: 'merchant-whatsapp-missing' };
  }

  const claimed = await claimNotificationSlot(params.supabase, {
    pedidoId: params.pedidoId,
    channel: 'whatsapp',
    eventType: params.eventType,
    statusKey: 'merchant-new',
  });
  if (!claimed) {
    return { ok: true, skipped: true, reason: 'merchant-whatsapp-already-sent' };
  }

  try {
    const recipient = normalizePhoneToE164(merchantPhone);
    const appOrderUrl = `${getAppSiteUrl()}/orders/view/${encodeURIComponent(params.orderId)}`;
    const text = buildMerchantWhatsappMessage({
      businessName: params.commerce.name || 'Tu comercio',
      orderId: params.orderId,
      customerName: params.customerName,
      totalLabel: resolveMerchantTotalLabel(params.record),
      appOrderUrl,
    });

    const delivered = await sendWasenderText({
      apiKey: params.apiKey,
      endpoint: params.endpoint,
      recipient,
      text,
      orderId: params.orderId,
    });

    if (!delivered.ok) {
      await releaseNotificationSlot(params.supabase, {
        pedidoId: params.pedidoId,
        channel: 'whatsapp',
        eventType: params.eventType,
        statusKey: 'merchant-new',
      });
      console.error('merchant WhatsApp delivery failed', {
        orderId: params.orderId,
        error: 'error' in delivered ? delivered.error : 'unknown',
      });
    }

    return delivered;
  } catch (error) {
    await releaseNotificationSlot(params.supabase, {
      pedidoId: params.pedidoId,
      channel: 'whatsapp',
      eventType: params.eventType,
      statusKey: 'merchant-new',
    });
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Unknown merchant WhatsApp notification error.',
    };
  }
}

async function sendWasenderText(params: {
  apiKey: string;
  endpoint: string;
  recipient: string;
  text: string;
  orderId: string;
}) {
  let lastError = 'WASender request failed.';

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const response = await fetch(params.endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${params.apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        to: params.recipient,
        text: params.text,
      }),
    });

    const rawBody = await response.text();
    let payload: unknown = rawBody;

    try {
      payload = rawBody ? JSON.parse(rawBody) : null;
    } catch {
      payload = rawBody;
    }

    if (response.ok) {
      return {
        ok: true,
        recipient: params.recipient,
        response: payload,
      };
    }

    lastError = typeof payload === 'object' && payload !== null
      ? String((payload as Record<string, unknown>)['message'] ?? (payload as Record<string, unknown>)['error'] ?? `WASender request failed with status ${response.status}.`)
      : String(payload ?? `WASender request failed with status ${response.status}.`);

    console.error('WASender delivery failed', {
      orderId: params.orderId,
      status: response.status,
      attempt,
      recipientSuffix: params.recipient.slice(-4),
    });

    if (response.status === 400 || response.status === 401 || response.status === 403 || response.status === 422) {
      break;
    }
  }

  return {
    ok: false,
    recipient: params.recipient,
    error: lastError,
  };
}

async function maybeSendPushNotifications(params: {
  supabase: ReturnType<typeof createClient>;
  commerce: CommerceInfo;
  firebaseProjectId: string;
  firebaseClientEmail: string;
  firebasePrivateKey: string;
  orderId: string;
  pedidoId: string;
  eventType: string;
  statusKey: string;
}) {
  if (!params.commerce.ownerId) {
    return { ok: true, skipped: true, reason: 'owner-not-found' };
  }

  if (!params.firebaseProjectId || !params.firebaseClientEmail || !params.firebasePrivateKey) {
    return { ok: true, skipped: true, reason: 'firebase-config-missing' };
  }

  const claimed = await claimNotificationSlot(params.supabase, {
    pedidoId: params.pedidoId,
    channel: 'push',
    eventType: params.eventType,
    statusKey: params.statusKey,
  });
  if (!claimed) {
    return { ok: true, skipped: true, reason: 'push-already-sent' };
  }

  const tokens = await loadUserTokens(params.supabase, params.commerce.ownerId);
  if (tokens.length === 0) {
    return { ok: true, skipped: true, reason: 'no-tokens', ownerId: params.commerce.ownerId };
  }

  const accessToken = await getFirebaseAccessToken({
    clientEmail: params.firebaseClientEmail,
    privateKeyPem: params.firebasePrivateKey,
  });

  const results = await Promise.all(
    tokens.map((token) =>
      sendPushNotification({
        accessToken,
        firebaseProjectId: params.firebaseProjectId,
        fcmToken: token,
        orderId: params.orderId,
      }),
    ),
  );

  const delivered = results.filter((result) => result.ok).length;
  const failed = results.length - delivered;
  const unregisteredTokens = results
    .filter(
      (result) =>
        !result.ok &&
        result.status == 404 &&
        result.body.toUpperCase().includes('UNREGISTERED'),
    )
    .map((result) => result.fcmToken);

  if (unregisteredTokens.length > 0) {
    const { error: cleanupError } = await params.supabase
      .from('user_tokens')
      .delete()
      .in('fcm_token', unregisteredTokens);
    if (cleanupError) {
      console.error('Failed to clean invalid FCM tokens', cleanupError.message);
    }
  }

  const failures = results
    .filter((result) => !result.ok)
    .map((result) => ({
      status: result.status,
      body: result.body,
      tokenSuffix: result.tokenSuffix,
    }));

  return {
    ok: true,
    ownerId: params.commerce.ownerId,
    tokens: tokens.length,
    delivered,
    failed,
    invalidTokensRemoved: unregisteredTokens.length,
    failures,
  };
}

async function loadCommerceInfo(
  supabase: ReturnType<typeof createClient>,
  comercioId: string,
): Promise<CommerceInfo> {
  const { data, error } = await supabase
    .from('comercios')
    .select('owner_id,nombre,slug,whatsapp')
    .eq('id', comercioId)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Error loading comercio owner: ${error.message}`);
  }

  return {
    ownerId: data?.owner_id?.toString().trim() ?? '',
    name: data?.nombre?.toString().trim() ?? 'elmenuxfa.com',
    slug: data?.slug?.toString().trim() ?? '',
    whatsapp: data?.whatsapp?.toString().trim() ?? '',
  };
}

async function loadUserTokens(
  supabase: ReturnType<typeof createClient>,
  userId: string,
): Promise<string[]> {
  const { data, error } = await supabase
    .from('user_tokens')
    .select('fcm_token')
    .eq('user_id', userId);

  if (error) {
    throw new Error(`Error loading user_tokens: ${error.message}`);
  }

  const dedup = new Set<string>();
  for (const row of data ?? []) {
    const token = row?.fcm_token?.toString().trim() ?? '';
    if (token.length > 0) {
      dedup.add(token);
    }
  }
  return Array.from(dedup);
}

async function getFirebaseAccessToken(params: {
  clientEmail: string;
  privateKeyPem: string;
}): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const privateKey = await importPKCS8(params.privateKeyPem, 'RS256');

  const assertion = await new SignJWT({
    scope: FIREBASE_AUTH_SCOPE,
  })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .setIssuer(params.clientEmail)
    .setSubject(params.clientEmail)
    .setAudience(FIREBASE_TOKEN_URL)
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(privateKey);

  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion,
  });

  const response = await fetch(FIREBASE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  const responseBody = (await response.json()) as { access_token?: string; error?: string };
  if (!response.ok || !responseBody.access_token) {
    throw new Error(`Firebase OAuth error: ${JSON.stringify(responseBody)}`);
  }

  return responseBody.access_token;
}

async function sendPushNotification(params: {
  accessToken: string;
  firebaseProjectId: string;
  fcmToken: string;
  orderId: string;
}): Promise<{
  ok: boolean;
  status: number;
  body: string;
  tokenSuffix: string;
  fcmToken: string;
}> {
  const endpoint = `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(
    params.firebaseProjectId,
  )}/messages:send`;

  const payload = {
    message: {
      token: params.fcmToken,
      notification: {
        title: '💰 ¡Nuevo Pedido!',
        body: 'Has recibido un nuevo pedido en tu comercio.',
      },
      android: {
        notification: {
          channel_id: 'pedidos_channel',
          sound: 'cash_register',
        },
      },
      apns: {
        payload: {
          aps: {
            sound: 'cash_register.aiff',
          },
        },
      },
      data: {
        orderId: params.orderId,
      },
    },
  };

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${params.accessToken}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify(payload),
  });

  const text = await response.text();
  return {
    ok: response.ok,
    status: response.status,
    body: text,
    fcmToken: params.fcmToken,
    tokenSuffix: params.fcmToken.length > 8
        ? params.fcmToken.substring(params.fcmToken.length - 8)
        : params.fcmToken,
  };
}

function jsonResponse(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}