import { NextResponse } from 'next/server';

import { appSiteUrl } from '../../../../_lib/public-site-config';
import { consumeRateLimit, getClientIp } from '../../../_lib/rate-limit';
import {
  canSendStaffInviteEmail,
  sendStaffInviteEmail,
} from '../../../_lib/send-staff-invite-email';
import { getServiceSupabaseClient } from '../../../_lib/supabase-server';
import { getUserFromBearerRequest } from '../../../_lib/supabase-user-auth';

const GENERIC_ERROR = { error: 'No se pudo enviar la invitación.' } as const;

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

function isAdminOfComercio(params: {
  ownerId: string | null | undefined;
  userId: string;
  memberRole: string | null | undefined;
  memberStatus: string | null | undefined;
}) {
  if (params.ownerId && params.ownerId === params.userId) return true;
  return (
    params.memberStatus === 'active' &&
    (params.memberRole ?? '').toLowerCase() === 'administrador'
  );
}

export async function OPTIONS(request: Request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(request) });
}

export async function POST(request: Request) {
  const limit = consumeRateLimit(`staff-invite-notify:${getClientIp(request)}`, 20, 60_000);
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

    if (!canSendStaffInviteEmail()) {
      return jsonResponse(
        request,
        { error: 'El envío de correo no está configurado.' },
        { status: 503 },
      );
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const comercioId = (body.comercioId ?? '').toString().trim();
    const email = (body.email ?? '').toString().trim().toLowerCase();
    const role = (body.role ?? '').toString().trim().toLowerCase();

    if (
      !comercioId ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      !['administrador', 'caja', 'cocina', 'marketing', 'mesero'].includes(role)
    ) {
      return jsonResponse(request, GENERIC_ERROR, { status: 400 });
    }

    const supabase = getServiceSupabaseClient();
    const { data: comercio, error: comercioError } = await supabase
      .from('comercios')
      .select('id,nombre,owner_id')
      .eq('id', comercioId)
      .maybeSingle();

    if (comercioError || !comercio) {
      return jsonResponse(request, GENERIC_ERROR, { status: 404 });
    }

    const { data: membership } = await supabase
      .from('comercio_members')
      .select('role,status')
      .eq('comercio_id', comercioId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (
      !isAdminOfComercio({
        ownerId: comercio.owner_id?.toString(),
        userId: user.id,
        memberRole: membership?.role?.toString(),
        memberStatus: membership?.status?.toString(),
      })
    ) {
      return jsonResponse(request, { error: 'Forbidden.' }, { status: 403 });
    }

    const redirectTo = `${appSiteUrl}/`;
    const roleLabel = ROLE_LABELS[role] ?? role;
    const comercioNombre =
      (comercio.nombre?.toString().trim() || 'tu restaurante').slice(0, 120);

    // Prefer branded Resend + Auth action link (invite for new, magiclink for existing).
    let existingUser = false;
    let actionUrl = redirectTo;

    const inviteLink = await supabase.auth.admin.generateLink({
      type: 'invite',
      email,
      options: {
        redirectTo,
        data: {
          invited_comercio_id: comercioId,
          invited_role: role,
        },
      },
    });

    if (inviteLink.error) {
      const message = (inviteLink.error.message ?? '').toLowerCase();
      const alreadyExists =
        message.includes('already') ||
        message.includes('registered') ||
        message.includes('exists') ||
        inviteLink.error.status === 422;

      if (!alreadyExists) {
        console.error('staff-invite generateLink(invite)', inviteLink.error);
        return jsonResponse(request, GENERIC_ERROR, { status: 500 });
      }

      existingUser = true;
      const magic = await supabase.auth.admin.generateLink({
        type: 'magiclink',
        email,
        options: { redirectTo },
      });
      if (magic.error) {
        // Still email a plain "open the app" link if magic link fails.
        console.error('staff-invite generateLink(magiclink)', magic.error);
        actionUrl = redirectTo;
      } else {
        actionUrl = (magic.data.properties?.action_link ?? redirectTo).trim();
      }
    } else {
      actionUrl = (inviteLink.data.properties?.action_link ?? redirectTo).trim();
    }

    const sent = await sendStaffInviteEmail({
      toEmail: email,
      comercioNombre,
      roleLabel,
      actionUrl,
      existingUser,
    });

    if (!sent.ok) {
      return jsonResponse(
        request,
        { error: 'No se pudo enviar el correo de invitación.' },
        { status: 502 },
      );
    }

    return jsonResponse(request, {
      ok: true,
      email,
      role,
      existingUser,
      channel: 'resend',
    });
  } catch (error) {
    console.error('staff-invite notify failed', error);
    return jsonResponse(request, GENERIC_ERROR, { status: 500 });
  }
}
