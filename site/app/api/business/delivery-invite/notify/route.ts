import { createHash } from 'node:crypto';

import { NextResponse } from 'next/server';

import { consumeRateLimit, getClientIp } from '../../../_lib/rate-limit';
import { createDeliveryInviteShortLink } from '../../../_lib/delivery-invite-short-links';
import { getServiceSupabaseClient } from '../../../_lib/supabase-server';
import { getUserFromBearerRequest } from '../../../_lib/supabase-user-auth';
import { appSiteUrl } from '../../../../_lib/public-site-config';

const GENERIC_ERROR = { error: 'No disponible.' } as const;

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
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, content-type',
    Vary: 'Origin',
  };
}

function jsonResponse(request: Request, body: unknown, init?: ResponseInit) {
  const response = NextResponse.json(body, init);
  const headers = new Headers(corsHeaders(request));
  headers.forEach((value, key) => response.headers.set(key, value));
  return response;
}

export async function OPTIONS(request: Request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(request) });
}

export async function POST(request: Request) {
  const limit = consumeRateLimit(`delivery-invite-notify:${getClientIp(request)}`, 30, 60_000);
  if (limit.ok === false) {
    return jsonResponse(
      request,
      { error: 'Too many requests.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSec) } },
    );
  }

  try {
    const user = await getUserFromBearerRequest(request);
    if (!user?.id) {
      return jsonResponse(request, { error: 'Unauthorized.' }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const orderId = (body.orderId ?? '').toString().trim();
    const token = (body.token ?? '').toString().trim();
    const courierAlias = (body.courierAlias ?? '').toString().trim().slice(0, 80);
    if (!orderId || token.length < 32 || token.length > 256) {
      return jsonResponse(request, GENERIC_ERROR, { status: 400 });
    }

    const tokenHash = createHash('sha256').update(token).digest('hex');
    const supabase = getServiceSupabaseClient();
    const { data: invitation, error: invitationError } = await supabase
      .from('delivery_invitations')
      .select('id,pedido_id,order_id,comercio_id,invited_phone,status,token_hash')
      .eq('order_id', orderId)
      .eq('token_hash', tokenHash)
      .maybeSingle();

    if (invitationError || !invitation || invitation.status !== 'pending') {
      return jsonResponse(request, GENERIC_ERROR, { status: 404 });
    }

    const { data: comercio, error: comercioError } = await supabase
      .from('comercios')
      .select('owner_id,nombre')
      .eq('id', invitation.comercio_id)
      .maybeSingle();
    if (comercioError || !comercio || comercio.owner_id !== user.id) {
      return jsonResponse(request, GENERIC_ERROR, { status: 404 });
    }

    const shortCode = await createDeliveryInviteShortLink({
      supabase,
      invitationId: invitation.id,
      token,
    });
    const inviteUrl = new URL(`/d/${encodeURIComponent(shortCode)}`, request.url).toString();

    const recipient = (invitation.invited_phone ?? '').toString().replace(/\D/g, '');
    const message = encodeURIComponent(
      [
        `🛵 *INVITACIÓN DE DELIVERY*`,
        '',
        `🍽️ Comercio: ${comercio.nombre?.toString().trim() || 'el negocio'}`,
        `📦 Pedido: ${orderId}`,
        `👤 Repartidor: ${courierAlias || 'por confirmar'}`,
        '',
        '🔗 Aceptar delivery:',
        inviteUrl,
      ].join('\n'),
    );
    const directWhatsappUrl = recipient
      ? `https://wa.me/${recipient}?text=${message}`
      : '';

    await supabase.from('delivery_invitation_events').insert({
      invitation_id: invitation.id,
      pedido_id: invitation.pedido_id,
      order_id: invitation.order_id,
      event_type: 'notification_link_created',
      actor: user.id,
      payload: { channel: 'whatsapp', provider: 'direct_whatsapp' },
    });
    return jsonResponse(
      request,
      { ok: true, delivered: false, queued: false, directWhatsappUrl },
      { status: 200, headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    console.error('[delivery-invite-notify] failed', error);
    return jsonResponse(request, GENERIC_ERROR, { status: 500 });
  }
}