import { NextResponse } from 'next/server';

import { collectComprobanteStorageRefs, extractComprobanteObjectPath } from '../../../_lib/comprobante-path';
import {
  buildComprobanteMediaResponse,
  isComprobanteMediaVariant,
} from '../../../_lib/comprobante-media';
import { findOrderShortLink } from '../../../_lib/order-short-links';
import { consumeRateLimit, getClientIp } from '../../../_lib/rate-limit';
import { getServiceSupabaseClient } from '../../../_lib/supabase-server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 25;

type Params = {
  params: Promise<{ code: string }>;
};

type PedidoRow = {
  id: string;
  comercio_id?: string | null;
  detalles?: {
    order_id?: string | null;
    comprobante_url?: string | null;
    comprobantes?: unknown;
    [key: string]: unknown;
  } | null;
};

/**
 * Same-origin media proxy for WhatsApp `/p/[code]` proofs.
 * Phone never talks to supabase.co — Vercel fetches storage server-side.
 */
export async function GET(request: Request, { params }: Params) {
  try {
    const ip = getClientIp(request);
    const limit = consumeRateLimit(`comprobante:public-image:${ip}`, 60, 60_000);
    if (limit.ok === false) {
      return new NextResponse('Too many requests.', {
        status: 429,
        headers: { 'Retry-After': String(limit.retryAfterSec) },
      });
    }

    const { code: rawCode } = await params;
    let code = '';
    try {
      code = decodeURIComponent(rawCode ?? '').trim();
    } catch {
      return new NextResponse('Not found.', { status: 404 });
    }
    if (!code) return new NextResponse('Not found.', { status: 404 });

    const url = new URL(request.url);
    const variantRaw = (url.searchParams.get('v') || 'file').trim();
    if (!isComprobanteMediaVariant(variantRaw)) {
      return new NextResponse('Bad request.', { status: 400 });
    }
    const indexRaw = Number.parseInt(url.searchParams.get('i') || '0', 10);
    const proofIndex = Number.isFinite(indexRaw) && indexRaw >= 0 ? indexRaw : 0;

    const supabase = getServiceSupabaseClient();
    const shortLink = await findOrderShortLink(supabase, code);
    if (!shortLink) return new NextResponse('Not found.', { status: 404 });

    const { data: order, error } = await supabase
      .from('pedidos')
      .select('id,comercio_id,detalles')
      .eq('id', shortLink.pedido_id)
      .maybeSingle();
    if (error || !order) return new NextResponse('Not found.', { status: 404 });

    const row = order as PedidoRow;
    if (row.comercio_id && row.comercio_id !== shortLink.comercio_id) {
      return new NextResponse('Not found.', { status: 404 });
    }

    const refs = collectComprobanteStorageRefs(row.detalles);
    const storageRef = refs[proofIndex] ?? null;
    const objectPath = extractComprobanteObjectPath(storageRef);
    if (!objectPath) return new NextResponse('Not found.', { status: 404 });
    if (!objectPath.startsWith(`${shortLink.comercio_id}/`)) {
      return new NextResponse('Not found.', { status: 404 });
    }

    return buildComprobanteMediaResponse({
      objectPath,
      orderId: shortLink.order_id,
      variant: variantRaw,
    });
  } catch (error) {
    console.error('[comprobante-media] public image failed', error);
    return new NextResponse('Unavailable.', { status: 503 });
  }
}
