import { NextResponse } from 'next/server';

import {
  generatePublicTrackingToken,
  hashPublicTrackingToken,
} from '../_lib/order-tracking-token';
import { canSendOrderEmail, sendOrderEmail } from '../_lib/send-order-email';
import {
  MAX_SEND_ORDER_BODY_BYTES,
  buildOrderTrackingUrl,
  readJsonBodyWithLimit,
  sendOrderRequestSchema,
} from '../_lib/send-order-validation';
import { consumeRateLimit, getClientIp } from '../_lib/rate-limit';
import { getServiceSupabaseClient } from '../_lib/supabase-server';

const RATE_LIMIT = 8;
const RATE_WINDOW_MS = 60_000;

type PedidoLookupRow = {
  id: string;
  comercio_id?: string | null;
  cliente_email?: string | null;
  detalles?: {
    order_id?: string | null;
    [key: string]: unknown;
  } | null;
};

function genericError(status: number, code: string) {
  return NextResponse.json({ ok: false, error: code }, { status });
}

async function findOrderByPublicOrderId(orderId: string): Promise<{
  order: PedidoLookupRow;
  comercioNombre: string;
  comercioSlug: string | null;
} | null> {
  const supabase = getServiceSupabaseClient();

  const { data: rows, error } = await supabase
    .from('pedidos')
    .select('id,comercio_id,cliente_email,detalles')
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) {
    throw new Error('ORDER_LOOKUP_FAILED');
  }

  const order =
    ((rows ?? []) as PedidoLookupRow[]).find((row) => row?.detalles?.order_id === orderId) ?? null;

  if (!order) return null;

  let comercioNombre = 'elmenuxfa.com';
  let comercioSlug: string | null = null;

  if (order.comercio_id) {
    const { data: comercio } = await supabase
      .from('comercios')
      .select('nombre,slug')
      .eq('id', order.comercio_id)
      .maybeSingle();

    if (comercio?.nombre) {
      comercioNombre = String(comercio.nombre);
    }
    if (comercio?.slug) {
      comercioSlug = String(comercio.slug);
    }
  }

  return { order, comercioNombre, comercioSlug };
}

/**
 * Resend confirmation for an existing order.
 *
 * Token rotation is OPT-IN via regenerateTrackingLink: true.
 * Plain retries / receipt resends must not invalidate prior tracking links.
 * Plaintext tracking tokens are never stored, so without regeneration the
 * email omits a working tracking URL.
 */
export async function POST(request: Request) {
  try {
    const ip = getClientIp(request);
    const ipLimit = consumeRateLimit(`send-order:ip:${ip}`, RATE_LIMIT, RATE_WINDOW_MS);
    if (ipLimit.ok === false) {
      return NextResponse.json(
        { ok: false, error: 'rate_limited' },
        {
          status: 429,
          headers: { 'Retry-After': String(ipLimit.retryAfterSec) },
        },
      );
    }

    if (!canSendOrderEmail()) {
      return genericError(503, 'unavailable');
    }

    const bodyResult = await readJsonBodyWithLimit(request, MAX_SEND_ORDER_BODY_BYTES);
    if (bodyResult.ok === false) {
      return genericError(bodyResult.error === 'too_large' ? 413 : 400, bodyResult.error);
    }

    const parsed = sendOrderRequestSchema.safeParse(bodyResult.value);
    if (!parsed.success) {
      return genericError(400, 'invalid_request');
    }

    const { clientEmail, orderId, regenerateTrackingLink } = parsed.data;

    const orderLimit = consumeRateLimit(`send-order:order:${orderId}`, 3, RATE_WINDOW_MS);
    if (orderLimit.ok === false) {
      return NextResponse.json(
        { ok: false, error: 'rate_limited' },
        {
          status: 429,
          headers: { 'Retry-After': String(orderLimit.retryAfterSec) },
        },
      );
    }

    const found = await findOrderByPublicOrderId(orderId);
    if (!found) {
      return genericError(404, 'not_found');
    }

    const storedEmail = (found.order.cliente_email ?? '').trim().toLowerCase();
    if (!storedEmail || storedEmail !== clientEmail) {
      return genericError(404, 'not_found');
    }

    let trackingUrl: string | undefined;
    if (regenerateTrackingLink === true) {
      const supabase = getServiceSupabaseClient();
      const publicTrackingToken = generatePublicTrackingToken();
      const publicTrackingTokenHash = hashPublicTrackingToken(publicTrackingToken);
      const currentDetalles =
        found.order.detalles && typeof found.order.detalles === 'object'
          ? { ...(found.order.detalles as Record<string, unknown>) }
          : {};
      const nextDetalles = {
        ...currentDetalles,
        public_tracking_token_hash: publicTrackingTokenHash,
        tracking_token_rotated_at: new Date().toISOString(),
      };

      const rotate = await supabase
        .from('pedidos')
        .update({
          public_tracking_token_hash: publicTrackingTokenHash,
          detalles: nextDetalles,
        })
        .eq('id', found.order.id);

      if (rotate.error) {
        const missingColumn = (rotate.error.message ?? '')
          .toLowerCase()
          .includes('public_tracking_token_hash');
        if (!missingColumn) {
          return genericError(503, 'unavailable');
        }
        const retry = await supabase
          .from('pedidos')
          .update({ detalles: nextDetalles })
          .eq('id', found.order.id);
        if (retry.error) {
          return genericError(503, 'unavailable');
        }
      }

      trackingUrl = buildOrderTrackingUrl(orderId, found.comercioSlug, publicTrackingToken);
      // Never log the full tracking URL (contains secret token).
      console.info('[send-order] tracking link regenerated', { orderIdPrefix: orderId.slice(0, 12) });
    }

    const result = await sendOrderEmail({
      clientEmail,
      comercioNombre: found.comercioNombre,
      orderId,
      orderTrackingUrl: trackingUrl,
      comercioSlug: found.comercioSlug,
    });

    if (result.skipped) {
      return genericError(503, 'unavailable');
    }

    return NextResponse.json(
      {
        ok: true,
        trackingLinkRegenerated: regenerateTrackingLink === true,
      },
      { status: 200 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message.includes('Missing environment variable: SUPABASE_SERVICE_ROLE_KEY')) {
      console.error('[send-order] privileged supabase client unavailable');
      return genericError(503, 'unavailable');
    }

    console.error('[send-order] request failed');
    return genericError(500, 'request_failed');
  }
}
