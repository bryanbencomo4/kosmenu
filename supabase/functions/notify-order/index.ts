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
    telefono_cliente?: string;
    cliente_nombre?: string;
    cliente_email?: string;
  };
};

type CommerceInfo = {
  ownerId: string;
  name: string;
  slug: string;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const FIREBASE_AUTH_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
const FIREBASE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const DEFAULT_WASENDER_ENDPOINT = 'https://wasenderapi.com/api/send-message';

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
    const shouldSendPush = eventType === 'INSERT';
    const shouldSendWhatsapp = eventType === 'INSERT' || statusChanged;

    const pushResult = shouldSendPush
      ? await maybeSendPushNotifications({
          supabase,
          commerce,
          firebaseProjectId,
          firebaseClientEmail,
          firebasePrivateKey,
          orderId,
        })
      : { ok: true, skipped: true, reason: 'push-not-applicable' };

    const whatsappResult = shouldSendWhatsapp
      ? await maybeSendWhatsappNotification({
          apiKey: waSenderApiKey,
          endpoint: waSenderEndpoint,
          record,
          customerPhone,
          customerName,
          currentStatus,
          orderId,
          commerce,
        })
      : { ok: true, skipped: true, reason: 'status-unchanged' };

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
  const detalles =
    detallesRaw && typeof detallesRaw === 'object'
      ? ({
          order_id: (detallesRaw as Record<string, unknown>)['order_id']?.toString(),
          telefono_cliente: (detallesRaw as Record<string, unknown>)['telefono_cliente']?.toString(),
          cliente_nombre: (detallesRaw as Record<string, unknown>)['cliente_nombre']?.toString(),
          cliente_email: (detallesRaw as Record<string, unknown>)['cliente_email']?.toString(),
        } as {
          order_id?: string;
          telefono_cliente?: string;
          cliente_nombre?: string;
          cliente_email?: string;
        })
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
  const detallesOrderId = (record.detalles?.order_id ?? '').trim();
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
    record.detalles?.cliente_nombre?.toString().trim() ||
    'cliente'
  );
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

function statusLabel(status: string): string {
  switch (status) {
    case 'confirmado':
      return 'Confirmado';
    case 'preparando':
      return 'Preparando';
    case 'en_camino':
      return 'En camino';
    case 'entregado':
      return 'Entregado';
    case 'cancelado':
      return 'Cancelado';
    case 'pendiente':
    default:
      return 'Pendiente';
  }
}

function messageLinesByStatus(status: string) {
  switch (status) {
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
        headline: 'Tu pedido fue actualizado como cancelado.',
        detail: 'Si necesitas ayuda adicional, puedes comunicarte directamente con el negocio.',
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

function buildTrackingUrl(orderId: string, slug: string): string {
  if (slug) {
    return `https://kosmenu.vercel.app/v/${encodeURIComponent(slug)}/orders/${encodeURIComponent(orderId)}`;
  }

  return `https://kosmenu.vercel.app/orders/${encodeURIComponent(orderId)}`;
}

function buildBusinessUrl(slug: string): string {
  if (slug) {
    return `https://kosmenu.vercel.app/v/${encodeURIComponent(slug)}`;
  }

  return 'https://kosmenu.vercel.app';
}

function buildWhatsappMessage(params: {
  customerName: string;
  orderId: string;
  businessName: string;
  businessSlug: string;
  status: string;
}) {
  const businessUrl = buildBusinessUrl(params.businessSlug);
  const trackingUrl = buildTrackingUrl(params.orderId, params.businessSlug);
  const messageVariant = messageLinesByStatus(params.status);

  return [
    `Hola ${params.customerName} 👋`,
    '',
    `${messageVariant.emoji} *${params.businessName}*`,
    `Pedido #${params.orderId}`,
    '',
    `${messageVariant.headline}`,
    `Estado actual: *${statusLabel(params.status)}*.`,
    `${messageVariant.detail}`,
    '',
    `🛍️ Negocio: ${businessUrl}`,
    `🔎 Sigue tu pedido aqui: ${trackingUrl}`,
    '',
    'Gracias por ordenar con elmenuxfa.com ✨',
  ].join('\n');
}

function normalizePhoneToE164(phone: string): string {
  const raw = (phone ?? '').toString().trim();
  if (!raw) {
    throw new Error('Invalid phone number.');
  }

  const normalizedInput = raw.startsWith('00') ? `+${raw.slice(2)}` : raw;
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

  if (/^\+\d{10,15}$/.test(normalizedInput)) {
    return normalizedInput;
  }

  throw new Error('Invalid phone number.');
}

async function maybeSendWhatsappNotification(params: {
  apiKey: string;
  endpoint: string;
  record: PedidoRecord;
  customerPhone: string;
  customerName: string;
  currentStatus: string;
  orderId: string;
  commerce: CommerceInfo;
}) {
  if (!params.apiKey) {
    return { ok: true, skipped: true, reason: 'wasender-key-missing' };
  }

  if (!params.customerPhone.trim()) {
    return { ok: true, skipped: true, reason: 'customer-phone-missing' };
  }

  try {
    const recipient = normalizePhoneToE164(params.customerPhone);
    const text = buildWhatsappMessage({
      customerName: params.customerName,
      orderId: params.orderId,
      businessName: params.commerce.name,
      businessSlug: params.commerce.slug,
      status: params.currentStatus,
    });

    const response = await fetch(params.endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${params.apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        to: recipient.replace(/^\+/, ''),
        text,
      }),
    });

    const rawBody = await response.text();
    let payload: unknown = rawBody;

    try {
      payload = rawBody ? JSON.parse(rawBody) : null;
    } catch {
      payload = rawBody;
    }

    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        recipient,
        error: typeof payload === 'object' && payload !== null
          ? ((payload as Record<string, unknown>)['message'] ?? (payload as Record<string, unknown>)['error'] ?? 'WASender request failed.')
          : String(payload ?? 'WASender request failed.'),
      };
    }

    return {
      ok: true,
      recipient,
      response: payload,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Unknown WhatsApp notification error.',
    };
  }
}

async function maybeSendPushNotifications(params: {
  supabase: ReturnType<typeof createClient>;
  commerce: CommerceInfo;
  firebaseProjectId: string;
  firebaseClientEmail: string;
  firebasePrivateKey: string;
  orderId: string;
}) {
  if (!params.commerce.ownerId) {
    return { ok: true, skipped: true, reason: 'owner-not-found' };
  }

  if (!params.firebaseProjectId || !params.firebaseClientEmail || !params.firebasePrivateKey) {
    return { ok: true, skipped: true, reason: 'firebase-config-missing' };
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
    .select('owner_id,nombre,slug')
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