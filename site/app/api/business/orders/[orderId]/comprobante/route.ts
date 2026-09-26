import { NextResponse } from 'next/server';

import { appSiteUrl } from '../../../../../_lib/public-site-config';
import { extractComprobanteObjectPath } from '../../../../_lib/comprobante-path';
import {
  COMPROBANTE_SIGNED_URL_TTL_SEC,
  createComprobanteSignedUrl,
} from '../../../../_lib/comprobante-storage';
import { extractComercioId } from '../../../../_lib/order-utils';
import { consumeRateLimit, getClientIp } from '../../../../_lib/rate-limit';
import { getUserFromBearerRequest } from '../../../../_lib/supabase-user-auth';
import { getServiceSupabaseClient } from '../../../../_lib/supabase-server';

type Params = {
  params: Promise<{ orderId: string }>;
};

type PedidoRow = {
  id: string;
  comercio_id?: string | null;
  detalles?: {
    order_id?: string | null;
    comprobante_url?: string | null;
    [key: string]: unknown;
  } | null;
};

const GENERIC = { error: 'No disponible.' } as const;

function corsHeaders(request: Request): HeadersInit {
  const origin = (request.headers.get('origin') ?? '').trim();
  const allowed = new Set([
    appSiteUrl,
    'https://app.elmenuxfa.com',
    'http://localhost:5000',
    'http://localhost:8080',
    'http://127.0.0.1:5000',
    'http://127.0.0.1:8080',
  ]);

  if (!origin || !allowed.has(origin)) {
    return {};
  }

  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, content-type',
    Vary: 'Origin',
  };
}

function deny(headers: HeadersInit = {}) {
  return NextResponse.json(GENERIC, { status: 404, headers });
}

async function findOrderByPublicOrderId(
  supabase: ReturnType<typeof getServiceSupabaseClient>,
  orderId: string,
): Promise<PedidoRow | null> {
  const derivedComercioId = extractComercioId(orderId);
  let query = supabase
    .from('pedidos')
    .select('id,comercio_id,detalles')
    .order('created_at', { ascending: false })
    .limit(200);

  if (derivedComercioId) {
    query = query.eq('comercio_id', derivedComercioId);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error('ORDER_LOOKUP_FAILED');
  }

  return ((data ?? []) as PedidoRow[]).find((row) => row?.detalles?.order_id === orderId) ?? null;
}

/**
 * Merchant-only: issue a short-lived signed URL for a payment proof.
 * Authorization: Supabase access token + comercios.owner_id = auth.uid().
 * Path is taken from the order record — never from client-supplied file paths.
 */
export async function GET(request: Request, { params }: Params) {
  const headers = corsHeaders(request);

  try {
    const ip = getClientIp(request);
    const limit = consumeRateLimit(`comprobante:signed:${ip}`, 30, 60_000);
    if (limit.ok === false) {
      return NextResponse.json(
        { error: 'Too many requests.' },
        {
          status: 429,
          headers: { ...headers, 'Retry-After': String(limit.retryAfterSec) },
        },
      );
    }

    const user = await getUserFromBearerRequest(request);
    if (!user?.id) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 401, headers });
    }

    const { orderId: rawOrderId } = await params;
    const orderId = decodeURIComponent(rawOrderId ?? '').trim();
    if (!orderId) {
      return deny(headers);
    }

    const supabase = getServiceSupabaseClient();
    const order = await findOrderByPublicOrderId(supabase, orderId);
    if (!order?.comercio_id) {
      return deny(headers);
    }

    const { data: comercio, error: comercioError } = await supabase
      .from('comercios')
      .select('id,owner_id')
      .eq('id', order.comercio_id)
      .maybeSingle();

    if (comercioError || !comercio?.owner_id || comercio.owner_id !== user.id) {
      return deny(headers);
    }

    const storageRef = order.detalles?.comprobante_url ?? null;
    const objectPath = extractComprobanteObjectPath(storageRef);
    if (!objectPath) {
      return deny(headers);
    }

    // Path must start with this comercio's id folder.
    if (!objectPath.startsWith(`${order.comercio_id}/`)) {
      return deny(headers);
    }

    const expiresIn = Math.min(COMPROBANTE_SIGNED_URL_TTL_SEC, 5 * 60);
    const signedUrl = await createComprobanteSignedUrl(objectPath, expiresIn);
    if (!signedUrl) {
      return NextResponse.json({ error: 'Unavailable.' }, { status: 503, headers });
    }

    // Never log signedUrl.
    return NextResponse.json(
      {
        ok: true,
        data: {
          expiresInSec: expiresIn,
          url: signedUrl,
        },
      },
      {
        status: 200,
        headers: {
          ...headers,
          'Cache-Control': 'no-store',
        },
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message.includes('Missing environment variable')) {
      console.error('[comprobante] privileged client unavailable');
      return NextResponse.json({ error: 'Unavailable.' }, { status: 503, headers });
    }
    console.error('[comprobante] signed url request failed');
    return NextResponse.json({ error: 'Unavailable.' }, { status: 500, headers });
  }
}

export async function OPTIONS(request: Request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(request) });
}
