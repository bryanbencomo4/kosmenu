import { NextResponse } from 'next/server';

import { appSiteUrl } from '../../../../_lib/public-site-config';
import { consumeRateLimit, getClientIp } from '../../../_lib/rate-limit';
import { getServiceSupabaseClient } from '../../../_lib/supabase-server';

const ROLE_LABELS: Record<string, string> = {
  administrador: 'Administrador',
  caja: 'Caja',
  cocina: 'Cocina',
  marketing: 'Marketing',
  mesero: 'Mesero',
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
    'Access-Control-Allow-Headers': 'content-type',
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

export async function GET(request: Request) {
  const limit = consumeRateLimit(`staff-invite-lookup:${getClientIp(request)}`, 40, 60_000);
  if (limit.ok === false) {
    return jsonResponse(
      request,
      { error: 'Too many requests.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSec) } },
    );
  }

  try {
    const token = new URL(request.url).searchParams.get('token')?.trim() ?? '';
    if (token.length < 16 || token.length > 128) {
      return jsonResponse(request, { error: 'Invitación no válida.' }, { status: 400 });
    }

    const supabase = getServiceSupabaseClient();
    const { data, error } = await supabase.rpc('get_staff_invite_public', {
      p_token: token,
    });

    if (error || data == null) {
      return jsonResponse(request, { error: 'Invitación no disponible.' }, { status: 404 });
    }

    const map = typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : {};
    if (map.error === 'owner') {
      return jsonResponse(
        request,
        { error: 'Esta invitación no aplica a cuentas de restaurante.' },
        { status: 409 },
      );
    }

    const email = String(map.email ?? '').trim().toLowerCase();
    const role = String(map.role ?? '').trim().toLowerCase();
    if (!email || !role) {
      return jsonResponse(request, { error: 'Invitación no disponible.' }, { status: 404 });
    }

    return jsonResponse(request, {
      ok: true,
      email,
      role,
      roleLabel: ROLE_LABELS[role] ?? role,
      comercioNombre: String(map.comercio_nombre ?? 'el restaurante').trim() || 'el restaurante',
      existingAccount: map.existing_account === true,
    });
  } catch (error) {
    console.error('staff-invite lookup failed', error);
    return jsonResponse(request, { error: 'Invitación no disponible.' }, { status: 500 });
  }
}
