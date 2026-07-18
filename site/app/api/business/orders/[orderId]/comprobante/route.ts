import { NextResponse } from 'next/server';

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

function deny() {
  return NextResponse.json(GENERIC, { status: 404 });
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
  try {
    const ip = getClientIp(request);
    const limit = consumeRateLimit(`comprobante:signed:${ip}`, 30, 60_000);
    if (limit.ok === false) {
      return NextResponse.json(
        { error: 'Too many requests.' },
        { status: 429, headers: { 'Retry-After': String(limit.retryAfterSec) } },
      );
    }

    const user = await getUserFromBearerRequest(request);
    if (!user?.id) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    }

    const { orderId: rawOrderId } = await params;
    const orderId = decodeURIComponent(rawOrderId ?? '').trim();
    if (!orderId) {
      return deny();
    }

    const supabase = getServiceSupabaseClient();
    const order = await findOrderByPublicOrderId(supabase, orderId);
    if (!order?.comercio_id) {
      return deny();
    }

    const { data: comercio, error: comercioError } = await supabase
      .from('comercios')
      .select('id,owner_id')
      .eq('id', order.comercio_id)
      .maybeSingle();

    if (comercioError || !comercio?.owner_id || comercio.owner_id !== user.id) {
      return deny();
    }

    const storageRef = order.detalles?.comprobante_url ?? null;
    const objectPath = extractComprobanteObjectPath(storageRef);
    if (!objectPath) {
      return deny();
    }

    // Path must start with this comercio's id folder.
    if (!objectPath.startsWith(`${order.comercio_id}/`)) {
      return deny();
    }

    const expiresIn = Math.min(COMPROBANTE_SIGNED_URL_TTL_SEC, 5 * 60);
    const signedUrl = await createComprobanteSignedUrl(objectPath, expiresIn);
    if (!signedUrl) {
      return NextResponse.json({ error: 'Unavailable.' }, { status: 503 });
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
          'Cache-Control': 'no-store',
        },
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message.includes('Missing environment variable')) {
      console.error('[comprobante] privileged client unavailable');
      return NextResponse.json({ error: 'Unavailable.' }, { status: 503 });
    }
    console.error('[comprobante] signed url request failed');
    return NextResponse.json({ error: 'Unavailable.' }, { status: 500 });
  }
}
