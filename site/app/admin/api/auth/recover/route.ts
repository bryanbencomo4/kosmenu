import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { adminSiteUrl } from '../../../../_lib/public-site-config';
import { logAdminAction } from '../../../_lib/admin-audit';
import { ADMIN_RESET_PASSWORD_PATH } from '../../../_lib/admin-routes';
import { getAdminSupabaseClient } from '../../../_lib/admin-supabase';

const GENERIC_RESPONSE_MESSAGE = 'Si el correo está habilitado, recibirás un enlace.';
const BASIC_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_RESET_SUCCESS_WINDOW_MS = 5 * 60 * 1000;
const PASSWORD_RECOVERY_REQUEST_WINDOW_MS = 60 * 60 * 1000;

type RecoverRequestBody = {
  email?: string;
};

type ActiveAdminRow = {
  id: string;
  auth_user_id: string | null;
  email: string;
  is_active: boolean;
};

function getRequiredEnv(name: string) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`[admin-recover] Missing environment variable: ${name}`);
  }

  return value;
}

function createRecoveryAuthClient() {
  return createClient(
    getRequiredEnv('NEXT_PUBLIC_SUPABASE_URL'),
    getRequiredEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    },
  );
}

function normalizeEmail(value: unknown) {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  return normalized || null;
}

function isValidEmail(email: string | null) {
  return Boolean(email && BASIC_EMAIL_PATTERN.test(email));
}

function genericResponse() {
  return NextResponse.json({ ok: true, message: GENERIC_RESPONSE_MESSAGE });
}

function passwordRecoveryRedirectUrl() {
  return `${adminSiteUrl}${ADMIN_RESET_PASSWORD_PATH}`;
}

async function findActiveAdminByEmail(email: string) {
  const supabase = getAdminSupabaseClient();
  const { data, error } = await supabase
    .from('admin_users')
    .select('id, auth_user_id, email, is_active')
    .eq('email', email)
    .eq('is_active', true)
    .maybeSingle<ActiveAdminRow>();

  if (error) {
    throw error;
  }

  return data;
}

async function logRecoveryDenied(email: string, request: NextRequest, reason: string) {
  await logAdminAction({
    action: 'admin.password_recovery_denied',
    actorEmail: email,
    metadata: { reason },
    requestHeaders: request.headers,
  });
}

async function logRecoveryRequested(admin: ActiveAdminRow, request: NextRequest, redirectTo: string) {
  await logAdminAction({
    action: 'admin.password_recovery_requested',
    actorUserId: admin.auth_user_id,
    actorEmail: admin.email,
    entityType: 'admin_user',
    entityId: admin.id,
    metadata: { redirectTo },
    requestHeaders: request.headers,
  });
}

async function hasRecentPasswordResetSuccess(actorUserId: string, actorEmail: string) {
  const cutoff = new Date(Date.now() - PASSWORD_RESET_SUCCESS_WINDOW_MS).toISOString();
  const supabase = getAdminSupabaseClient();
  const { data, error } = await supabase
    .from('admin_audit_logs')
    .select('id')
    .eq('action', 'admin.password_reset_success')
    .eq('actor_user_id', actorUserId)
    .eq('actor_email', actorEmail)
    .gte('created_at', cutoff)
    .limit(1);

  if (error) {
    throw error;
  }

  return Boolean(data && data.length > 0);
}

async function hasRecentPasswordRecoveryRequest(actorEmail: string) {
  const cutoff = new Date(Date.now() - PASSWORD_RECOVERY_REQUEST_WINDOW_MS).toISOString();
  const supabase = getAdminSupabaseClient();
  const { data, error } = await supabase
    .from('admin_audit_logs')
    .select('id')
    .eq('action', 'admin.password_recovery_requested')
    .eq('actor_email', actorEmail)
    .gte('created_at', cutoff)
    .limit(1);

  if (error) {
    throw error;
  }

  return Boolean(data && data.length > 0);
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as RecoverRequestBody;
    const normalizedEmail = normalizeEmail(body.email);

    if (!isValidEmail(normalizedEmail)) {
      return genericResponse();
    }

    const activeAdmin = await findActiveAdminByEmail(normalizedEmail);

    if (!activeAdmin) {
      await logRecoveryDenied(normalizedEmail, request, 'not_active_admin');
      return genericResponse();
    }

    const redirectTo = passwordRecoveryRedirectUrl();
    const recoveryAuthClient = createRecoveryAuthClient();
    const { error } = await recoveryAuthClient.auth.resetPasswordForEmail(normalizedEmail, {
      redirectTo,
    });

    if (error) {
      await logRecoveryDenied(normalizedEmail, request, 'supabase_recovery_error');
      return genericResponse();
    }

    await logRecoveryRequested(activeAdmin, request, redirectTo);
    return genericResponse();
  } catch {
    return genericResponse();
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as RecoverRequestBody;
    const normalizedEmail = normalizeEmail(body.email);

    if (!isValidEmail(normalizedEmail)) {
      return NextResponse.json({ ok: true });
    }

    const activeAdmin = await findActiveAdminByEmail(normalizedEmail);

    if (!activeAdmin || !activeAdmin.auth_user_id) {
      return NextResponse.json({ ok: true });
    }

    const hasRecentRequest = await hasRecentPasswordRecoveryRequest(normalizedEmail);

    if (!hasRecentRequest) {
      return NextResponse.json({ ok: true });
    }

    const alreadyLogged = await hasRecentPasswordResetSuccess(
      activeAdmin.auth_user_id,
      normalizedEmail,
    );

    if (!alreadyLogged) {
      await logAdminAction({
        action: 'admin.password_reset_success',
        actorUserId: activeAdmin.auth_user_id,
        actorEmail: normalizedEmail,
        entityType: 'admin_user',
        entityId: activeAdmin.id,
        metadata: {
          source: 'admin.password_recovery',
        },
        requestHeaders: request.headers,
      });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: true });
  }
}