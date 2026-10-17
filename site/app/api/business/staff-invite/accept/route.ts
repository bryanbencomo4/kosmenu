import { NextResponse } from 'next/server';

import { appSiteUrl } from '../../../../_lib/public-site-config';
import { consumeRateLimit, getClientIp } from '../../../_lib/rate-limit';
import { getServiceSupabaseClient } from '../../../_lib/supabase-server';

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

export async function POST(request: Request) {
  const limit = consumeRateLimit(`staff-invite-accept:${getClientIp(request)}`, 15, 60_000);
  if (limit.ok === false) {
    return jsonResponse(
      request,
      { error: 'Too many requests.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSec) } },
    );
  }

  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const token = (body.token ?? '').toString().trim();
    const password = (body.password ?? '').toString();

    if (token.length < 16 || token.length > 128) {
      return jsonResponse(request, { error: 'Invitación no válida.' }, { status: 400 });
    }
    if (password.length < 8) {
      return jsonResponse(
        request,
        { error: 'Usa una contraseña de al menos 8 caracteres.' },
        { status: 400 },
      );
    }

    const supabase = getServiceSupabaseClient();
    const { data: invite, error: inviteError } = await supabase
      .from('comercio_member_invites')
      .select('id, email, role, status, comercio_id, invited_by')
      .eq('token', token)
      .maybeSingle();

    if (inviteError || !invite || invite.status !== 'pending') {
      return jsonResponse(request, { error: 'Invitación no disponible.' }, { status: 404 });
    }

    const email = (invite.email ?? '').toString().trim().toLowerCase();
    const role = (invite.role ?? '').toString().trim().toLowerCase();
    const comercioId = (invite.comercio_id ?? '').toString().trim();
    if (!email || !role || !comercioId) {
      return jsonResponse(request, { error: 'Invitación no disponible.' }, { status: 404 });
    }

    // Resolve existing auth user by scanning is unreliable; try create, then handle exists.
    const created = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        invited_comercio_id: comercioId,
        invited_role: role,
      },
    });

    let userId = created.data.user?.id ?? '';

    if (created.error || !userId) {
      const message = (created.error?.message ?? '').toLowerCase();
      const already =
        message.includes('already') ||
        message.includes('registered') ||
        message.includes('exists') ||
        created.error?.status === 422;

      if (!already) {
        console.error('staff-invite accept createUser', created.error);
        return jsonResponse(
          request,
          { error: 'No se pudo crear la cuenta. Inténtalo de nuevo.' },
          { status: 500 },
        );
      }

      return jsonResponse(
        request,
        {
          error: 'already_registered',
          message:
            'Este correo ya tiene cuenta. Inicia sesión en la app para unirte al negocio.',
        },
        { status: 409 },
      );
    }

    const { data: owned } = await supabase
      .from('comercios')
      .select('id')
      .eq('owner_id', userId)
      .limit(1)
      .maybeSingle();
    if (owned?.id) {
      // Should be unreachable for brand-new users; keep safe.
      return jsonResponse(
        request,
        { error: 'Esta invitación no aplica a cuentas de restaurante.' },
        { status: 409 },
      );
    }

    const { error: memberError } = await supabase.from('comercio_members').upsert(
      {
        comercio_id: comercioId,
        user_id: userId,
        role,
        status: 'active',
        invited_by: invite.invited_by ?? null,
      },
      { onConflict: 'comercio_id,user_id' },
    );

    if (memberError) {
      console.error('staff-invite accept member upsert', memberError);
      return jsonResponse(
        request,
        { error: 'No se pudo activar el acceso al negocio.' },
        { status: 500 },
      );
    }

    await supabase
      .from('comercio_member_invites')
      .update({ status: 'accepted', accepted_at: new Date().toISOString() })
      .eq('id', invite.id);

    return jsonResponse(request, {
      ok: true,
      email,
      role,
      comercioId,
    });
  } catch (error) {
    console.error('staff-invite accept failed', error);
    return jsonResponse(
      request,
      { error: 'No se pudo completar el registro.' },
      { status: 500 },
    );
  }
}
