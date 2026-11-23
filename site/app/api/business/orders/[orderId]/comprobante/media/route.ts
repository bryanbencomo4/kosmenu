import { NextResponse } from 'next/server';

import { appSiteUrl } from '../../../../../../_lib/public-site-config';
import { extractComprobanteObjectPath } from '../../../../../_lib/comprobante-path';
import {
  buildComprobanteMediaResponse,
  isComprobanteMediaVariant,
  verifyMediaToken,
} from '../../../../../_lib/comprobante-media';
import { extractComercioId } from '../../../../../_lib/order-utils';
import { consumeRateLimit, getClientIp } from '../../../../../_lib/rate-limit';
import { getServiceSupabaseClient } from '../../../../../_lib/supabase-server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 25;

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
  if (!origin || !allowed.has(origin)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, content-type',
    Vary: 'Origin',
  };
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
  if (error) throw new Error('ORDER_LOOKUP_FAILED');
  return ((data ?? []) as PedidoRow[]).find((row) => row?.detalles?.order_id === orderId) ?? null;
}

/**
 * Merchant media proxy. Auth is a short-lived HMAC on the query string so
 * Image.network can load without Authorization headers.
 */
export async function GET(request: Request, { params }: Params) {
  const headers = corsHeaders(request);
  try {
    const ip = getClientIp(request);
    const limit = consumeRateLimit(`comprobante:merchant-media:${ip}`, 80, 60_000);
    if (limit.ok === false) {
      return new NextResponse('Too many requests.', {
        status: 429,
        headers: { ...headers, 'Retry-After': String(limit.retryAfterSec) },
      });
    }

    const { orderId: rawOrderId } = await params;
    const orderId = decodeURIComponent(rawOrderId ?? '').trim();
    if (!orderId) {
      return new NextResponse('Not found.', { status: 404, headers });
    }

    const url = new URL(request.url);
    const variantRaw = (url.searchParams.get('v') || 'file').trim();
    const exp = (url.searchParams.get('exp') || '').trim();
    const sig = (url.searchParams.get('sig') || '').trim();
    if (!isComprobanteMediaVariant(variantRaw)) {
      return new NextResponse('Bad request.', { status: 400, headers });
    }
    if (verifyMediaToken(orderId, variantRaw, exp, sig).ok === false) {
      return new NextResponse('Gone.', { status: 410, headers });
    }

    const supabase = getServiceSupabaseClient();
    const order = await findOrderByPublicOrderId(supabase, orderId);
    if (!order?.comercio_id) {
      return new NextResponse('Not found.', { status: 404, headers });
    }

    const objectPath = extractComprobanteObjectPath(order.detalles?.comprobante_url ?? null);
    if (!objectPath || !objectPath.startsWith(`${order.comercio_id}/`)) {
      return new NextResponse('Not found.', { status: 404, headers });
    }

    const response = await buildComprobanteMediaResponse({
      objectPath,
      orderId,
      variant: variantRaw,
    });
    const outHeaders = new Headers(response.headers);
    Object.entries(headers).forEach(([key, value]) => {
      if (value) outHeaders.set(key, value);
    });
    return new NextResponse(response.body, {
      status: response.status,
      headers: outHeaders,
    });
  } catch (error) {
    console.error('[comprobante-media] merchant media failed', error);
    return new NextResponse('Unavailable.', { status: 503, headers });
  }
}

export async function OPTIONS(request: Request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(request) });
}
