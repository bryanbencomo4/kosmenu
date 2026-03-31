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
  detalles?: {
    order_id?: string;
  };
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const FIREBASE_AUTH_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
const FIREBASE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed.' }, 405);
  }

  try {
    const body = (await req.json()) as WebhookPayload | PedidoRecord;
    const record = extractRecord(body);
    const comercioId = (record.comercio_id ?? '').trim();
    const orderId = resolveOrderId(record);

    if (!comercioId) {
      return jsonResponse({ ok: false, error: 'Missing comercio_id in webhook payload.' }, 400);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const firebaseProjectId = (Deno.env.get('FIREBASE_PROJECT_ID') ?? '').trim();
    const firebaseClientEmail = (Deno.env.get('FIREBASE_CLIENT_EMAIL') ?? '').trim();
    const firebasePrivateKey = normalizePrivateKey(Deno.env.get('FIREBASE_PRIVATE_KEY') ?? '');

    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse(
        { error: 'Missing env vars: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.' },
        500,
      );
    }

    if (!firebaseProjectId || !firebaseClientEmail || !firebasePrivateKey) {
      return jsonResponse(
        {
          error:
            'Missing Firebase env vars: FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY.',
        },
        500,
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    const ownerId = await loadOwnerId(supabase, comercioId);
    if (!ownerId) {
      return jsonResponse({ ok: true, skipped: true, reason: 'owner-not-found', comercioId }, 200);
    }

    const tokens = await loadUserTokens(supabase, ownerId);
    if (tokens.length === 0) {
      return jsonResponse({ ok: true, skipped: true, reason: 'no-tokens', comercioId, ownerId }, 200);
    }

    const accessToken = await getFirebaseAccessToken({
      clientEmail: firebaseClientEmail,
      privateKeyPem: firebasePrivateKey,
    });

    const results = await Promise.all(
      tokens.map((token) =>
        sendPushNotification({
          accessToken,
          firebaseProjectId,
          fcmToken: token,
          orderId,
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
      const { error: cleanupError } = await supabase
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

    return jsonResponse(
      {
        ok: true,
        comercioId,
        ownerId,
        orderId,
        tokens: tokens.length,
        delivered,
        failed,
        invalidTokensRemoved: unregisteredTokens.length,
        failures,
      },
      200,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown notify-order error.';
    return jsonResponse({ error: message }, 500);
  }
});

function extractRecord(payload: WebhookPayload | PedidoRecord): PedidoRecord {
  if ((payload as WebhookPayload).record) {
    return asPedidoRecord((payload as WebhookPayload).record);
  }

  return asPedidoRecord(payload);
}

function asPedidoRecord(value: unknown): PedidoRecord {
  if (!value || typeof value !== 'object') {
    return {};
  }

  const map = value as Record<string, unknown>;
  const detallesRaw = map['detalles'];
  const detalles =
    detallesRaw && typeof detallesRaw === 'object'
      ? ({ order_id: (detallesRaw as Record<string, unknown>)['order_id']?.toString() } as {
          order_id?: string;
        })
      : undefined;

  return {
    id: map['id']?.toString(),
    comercio_id: map['comercio_id']?.toString(),
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

async function loadOwnerId(
  supabase: ReturnType<typeof createClient>,
  comercioId: string,
): Promise<string> {
  const { data, error } = await supabase
    .from('comercios')
    .select('owner_id')
    .eq('id', comercioId)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Error loading comercio owner: ${error.message}`);
  }

  return data?.owner_id?.toString().trim() ?? '';
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