import { NextResponse } from 'next/server';

import { appSiteUrl, publicSiteUrl } from '../../../../../_lib/public-site-config';
import {
  collectComprobanteStorageRefs,
  extractComprobanteObjectPath,
} from '../../../../_lib/comprobante-path';
import { buildMerchantComprobanteMediaUrls } from '../../../../_lib/comprobante-media';
import { findOrderShortLinkByPedidoId } from '../../../../_lib/order-short-links';
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
 * Merchant-only: issue short-lived same-origin media proxy URLs for a payment proof.
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

    const proofRefs = collectComprobanteStorageRefs(order.detalles);
    const storageRef = proofRefs[0] ?? order.detalles?.comprobante_url ?? null;
    const objectPath = extractComprobanteObjectPath(storageRef);
    if (!objectPath) {
      return deny(headers);
    }

    // Path must start with this comercio's id folder.
    if (!objectPath.startsWith(`${order.comercio_id}/`)) {
      return deny(headers);
    }

    // Same-origin proxy URLs (HMAC). Phone never loads supabase.co directly.
    const view = buildMerchantComprobanteMediaUrls(orderId, objectPath);

    // Prefer the same public /p/{code} page used in WhatsApp (supports multiple proofs).
    let publicUrl: string | null = null;
    const storedPublic = typeof order.detalles?.comprobante_public_url === 'string'
      ? order.detalles.comprobante_public_url.trim()
      : '';
    if (storedPublic.startsWith('http')) {
      publicUrl = storedPublic;
    } else {
      try {
        const shortLink = await findOrderShortLinkByPedidoId(supabase, order.id);
        if (shortLink?.code) {
          publicUrl = `${publicSiteUrl}/p/${encodeURIComponent(shortLink.code)}`;
        }
      } catch {
        publicUrl = null;
      }
    }

    return NextResponse.json(
      {
        ok: true,
        data: {
          expiresInSec: view.expiresInSec,
          url: view.url,
          ...(view.previewUrl ? { previewUrl: view.previewUrl } : {}),
          downloadUrl: view.downloadUrl,
          ...(publicUrl ? { publicUrl } : {}),
          proofCount: Math.max(1, proofRefs.length),
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
