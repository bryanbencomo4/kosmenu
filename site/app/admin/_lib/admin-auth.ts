import 'server-only';

import { createClient, type Session, type User } from '@supabase/supabase-js';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';

import {
  adminSiteHost,
  developmentAdminHosts,
  publicSiteUrl,
} from '../../_lib/public-site-config';
import { logAdminAction } from './admin-audit';
import {
  getRolePermissions,
  hasAdminPermission,
  isAdminRole,
  type AdminPermission,
  type AdminRole,
} from './admin-permissions';
import {
  ADMIN_HOME_PATH,
  ADMIN_HOST_HEADER,
  ADMIN_INTERNAL_PATH_HEADER,
  ADMIN_LOGIN_PATH,
  ADMIN_SESSION_COOKIE_NAME,
  ADMIN_UNAUTHORIZED_PATH,
  sanitizeAdminNextPath,
} from './admin-routes';
import { getAdminSupabaseClient } from './admin-supabase';

const DEVELOPMENT_ADMIN_HOSTS = new Set<string>(developmentAdminHosts);
const ADMIN_LOGOUT_SCOPE = 'local';

type HeaderBag = {
  get(name: string): string | null;
};

type CookieStore = Awaited<ReturnType<typeof cookies>>;

type LogoutRevocationResult = {
  attempted: boolean;
  revoked: boolean;
  scope: typeof ADMIN_LOGOUT_SCOPE | null;
  error: string | null;
};

type AdminUserRecord = {
  id: string;
  auth_user_id: string | null;
  email: string;
  role: string;
  is_active: boolean;
};

type AdminContext =
  | {
      state: 'ok';
      admin: CurrentAdmin;
      path: string;
    }
  | {
      state: 'invalid-host' | 'missing-session' | 'invalid-session';
      path: string;
      authUserId?: string | null;
      email?: string | null;
      role?: string | null;
      isActive?: boolean | null;
    }
  | {
      state: 'forbidden';
      path: string;
      authUserId?: string | null;
      email?: string | null;
      role?: string | null;
      isActive?: boolean | null;
    };

export type CurrentAdmin = {
  adminUserId: string;
  authUserId: string;
  email: string;
  role: AdminRole;
  permissions: AdminPermission[];
  displayName: string;
  isActive: true;
};

function getRequiredEnv(name: string) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`[admin-auth] Missing environment variable: ${name}`);
  }

  return value;
}

function createAdminAuthClient() {
  const url = getRequiredEnv('NEXT_PUBLIC_SUPABASE_URL');
  const anonKey = getRequiredEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');

  return createClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

function requestHostname(requestHeaders: HeaderBag) {
  const host =
    requestHeaders.get('x-forwarded-host') ??
    requestHeaders.get('host') ??
    '';

  return host
    .split(',')[0]
    .split(':')[0]
    .trim()
    .toLowerCase();
}

function normalizeEmail(email: string | null | undefined) {
  const normalized = email?.trim().toLowerCase();
  return normalized || null;
}

function normalizeErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return typeof error === 'string' ? error : 'Unknown error';
}

function currentAdminPath(requestHeaders: HeaderBag) {
  return sanitizeAdminNextPath(
    requestHeaders.get(ADMIN_INTERNAL_PATH_HEADER) ?? ADMIN_HOME_PATH,
  );
}

function getDisplayName(user: User, email: string) {
  const metadata = user.user_metadata as Record<string, unknown> | undefined;
  const fullName = String(metadata?.full_name ?? metadata?.name ?? '').trim();

  if (fullName) {
    return fullName;
  }

  return email.split('@')[0] || email;
}

function maxAgeFromSession(session: Session) {
  const fallback = session.expires_in ?? 3600;

  if (!session.expires_at) {
    return Math.max(fallback, 300);
  }

  const secondsUntilExpiry = session.expires_at - Math.floor(Date.now() / 1000);
  return Math.max(secondsUntilExpiry, 300);
}

function clearAdminSessionCookie(cookieStore: CookieStore) {
  cookieStore.set(ADMIN_SESSION_COOKIE_NAME, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  });
}

async function revokeAdminSession(accessToken: string | null): Promise<LogoutRevocationResult> {
  if (!accessToken) {
    return {
      attempted: false,
      revoked: false,
      scope: null,
      error: null,
    };
  }

  try {
    const authClient = createAdminAuthClient();
    const { error } = await authClient.auth.admin.signOut(accessToken, ADMIN_LOGOUT_SCOPE);

    if (error) {
      return {
        attempted: true,
        revoked: false,
        scope: ADMIN_LOGOUT_SCOPE,
        error: error.message,
      };
    }

    return {
      attempted: true,
      revoked: true,
      scope: ADMIN_LOGOUT_SCOPE,
      error: null,
    };
  } catch (error) {
    return {
      attempted: true,
      revoked: false,
      scope: ADMIN_LOGOUT_SCOPE,
      error: normalizeErrorMessage(error),
    };
  }
}

function toCurrentAdmin(user: User, adminRecord: AdminUserRecord & { role: AdminRole }) {
  const email = normalizeEmail(user.email ?? adminRecord.email) ?? adminRecord.email;

  return {
    adminUserId: adminRecord.id,
    authUserId: user.id,
    email,
    role: adminRecord.role,
    permissions: getRolePermissions(adminRecord.role),
    displayName: getDisplayName(user, email),
    isActive: true as const,
  };
}

async function findAdminUserRecord(user: User) {
  const supabase = getAdminSupabaseClient();
  const normalizedEmail = normalizeEmail(user.email);

  const { data: byAuthUserId, error: authUserError } = await supabase
    .from('admin_users')
    .select('id, auth_user_id, email, role, is_active')
    .eq('auth_user_id', user.id)
    .maybeSingle<AdminUserRecord>();

  if (authUserError) {
    throw new Error(authUserError.message);
  }

  if (byAuthUserId) {
    return byAuthUserId;
  }

  if (!normalizedEmail) {
    return null;
  }

  const { data: byEmail, error: emailError } = await supabase
    .from('admin_users')
    .select('id, auth_user_id, email, role, is_active')
    .eq('email', normalizedEmail)
    .maybeSingle<AdminUserRecord>();

  if (emailError) {
    throw new Error(emailError.message);
  }

  if (!byEmail) {
    return null;
  }

  if (!byEmail.auth_user_id) {
    const { data: linkedRow, error: linkError } = await supabase
      .from('admin_users')
      .update({ auth_user_id: user.id })
      .eq('id', byEmail.id)
      .select('id, auth_user_id, email, role, is_active')
      .maybeSingle<AdminUserRecord>();

    if (linkError) {
      throw new Error(linkError.message);
    }

    return linkedRow ?? { ...byEmail, auth_user_id: user.id };
  }

  return byEmail;
}

async function readAdminContext(): Promise<AdminContext> {
  const requestHeaders = await headers();
  const path = currentAdminPath(requestHeaders);

  if (!(await isAdminHost())) {
    return { state: 'invalid-host', path };
  }

  const cookieStore = await cookies();
  const accessToken = cookieStore.get(ADMIN_SESSION_COOKIE_NAME)?.value?.trim();

  if (!accessToken) {
    return { state: 'missing-session', path };
  }

  const authClient = createAdminAuthClient();
  const { data, error } = await authClient.auth.getUser(accessToken);

  if (error || !data.user) {
    return { state: 'invalid-session', path };
  }

  const adminRecord = await findAdminUserRecord(data.user);

  if (!adminRecord || !adminRecord.is_active || !isAdminRole(adminRecord.role)) {
    return {
      state: 'forbidden',
      path,
      authUserId: data.user.id,
      email: normalizeEmail(data.user.email),
      role: adminRecord?.role ?? null,
      isActive: adminRecord?.is_active ?? null,
    };
  }

  return {
    state: 'ok',
    path,
    admin: toCurrentAdmin(data.user, {
      ...adminRecord,
      role: adminRecord.role,
    }),
  };
}

export async function isAdminHost() {
  const requestHeaders = await headers();

  if (requestHeaders.get(ADMIN_HOST_HEADER) === '1') {
    return true;
  }

  const hostname = requestHostname(requestHeaders);
  return hostname === adminSiteHost || DEVELOPMENT_ADMIN_HOSTS.has(hostname);
}

export async function getCurrentAdmin() {
  const context = await readAdminContext();
  return context.state === 'ok' ? context.admin : null;
}

export async function redirectToAdminLogin(nextPath?: string): Promise<never> {
  const requestHeaders = await headers();
  const safeNextPath = sanitizeAdminNextPath(nextPath ?? currentAdminPath(requestHeaders));

  redirect(`${ADMIN_LOGIN_PATH}?next=${encodeURIComponent(safeNextPath)}`);
}

export async function requireAdmin() {
  const context = await readAdminContext();

  if (context.state === 'ok') {
    return context.admin;
  }

  if (context.state === 'invalid-host') {
    redirect(publicSiteUrl);
  }

  if (context.state === 'missing-session' || context.state === 'invalid-session') {
    return redirectToAdminLogin(context.path);
  }

  await logAdminAction({
    action: 'admin.unauthorized_access',
    actorUserId: context.authUserId ?? null,
    actorEmail: context.email ?? null,
    metadata: {
      path: context.path,
      reason: context.state,
      role: context.role,
      isActive: context.isActive,
    },
  });

  redirect(ADMIN_UNAUTHORIZED_PATH);
}

export async function requireAdminPermission(permission: AdminPermission) {
  const admin = await requireAdmin();

  if (!hasAdminPermission(admin.role, permission)) {
    const requestHeaders = await headers();

    await logAdminAction({
      action: 'admin.unauthorized_access',
      actorUserId: admin.authUserId,
      actorEmail: admin.email,
      metadata: {
        path: currentAdminPath(requestHeaders),
        reason: 'missing_permission',
        permission,
        role: admin.role,
      },
      requestHeaders,
    });

    redirect(ADMIN_UNAUTHORIZED_PATH);
  }

  return admin;
}

export async function loginAdminAction(formData: FormData) {
  'use server';

  const requestHeaders = await headers();
  const email = normalizeEmail(String(formData.get('email') ?? ''));
  const password = String(formData.get('password') ?? '');
  const nextPath = sanitizeAdminNextPath(String(formData.get('next') ?? ADMIN_HOME_PATH));

  if (!email || !password) {
    redirect(`${ADMIN_LOGIN_PATH}?error=missing_credentials&next=${encodeURIComponent(nextPath)}`);
  }

  const authClient = createAdminAuthClient();
  const { data, error } = await authClient.auth.signInWithPassword({ email, password });

  if (error || !data.session || !data.user) {
    await logAdminAction({
      action: 'admin.login_denied',
      actorEmail: email,
      metadata: {
        reason: 'invalid_credentials',
        nextPath,
      },
      requestHeaders,
    });

    redirect(`${ADMIN_LOGIN_PATH}?error=invalid_credentials&next=${encodeURIComponent(nextPath)}`);
  }

  const adminRecord = await findAdminUserRecord(data.user);

  if (!adminRecord || !adminRecord.is_active || !isAdminRole(adminRecord.role)) {
    await logAdminAction({
      action: 'admin.login_denied',
      actorUserId: data.user.id,
      actorEmail: normalizeEmail(data.user.email) ?? email,
      metadata: {
        reason: 'admin_not_allowed',
        role: adminRecord?.role ?? null,
        isActive: adminRecord?.is_active ?? null,
        nextPath,
      },
      requestHeaders,
    });

    redirect(ADMIN_UNAUTHORIZED_PATH);
  }

  const cookieStore = await cookies();
  cookieStore.set(ADMIN_SESSION_COOKIE_NAME, data.session.access_token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: maxAgeFromSession(data.session),
  });

  await logAdminAction({
    action: 'admin.login_success',
    actorUserId: data.user.id,
    actorEmail: normalizeEmail(data.user.email) ?? email,
    metadata: {
      nextPath,
      role: adminRecord.role,
    },
    requestHeaders,
  });

  redirect(nextPath);
}

export async function logoutAdminAction() {
  'use server';

  const requestHeaders = await headers();
  const cookieStore = await cookies();
  const currentPath = currentAdminPath(requestHeaders);
  const accessToken = cookieStore.get(ADMIN_SESSION_COOKIE_NAME)?.value?.trim() || null;
  const currentAdmin = accessToken ? await getCurrentAdmin() : null;
  const revocationResult = await revokeAdminSession(accessToken);

  clearAdminSessionCookie(cookieStore);

  if (currentAdmin || accessToken) {
    await logAdminAction({
      action: 'admin.logout',
      actorUserId: currentAdmin?.authUserId ?? null,
      actorEmail: currentAdmin?.email ?? null,
      metadata: {
        path: currentPath,
        supabaseRevocationAttempted: revocationResult.attempted,
        supabaseRevocationSucceeded: revocationResult.revoked,
        supabaseRevocationScope: revocationResult.scope,
        supabaseRevocationError: revocationResult.error,
        accessTokenRevokedImmediately: false,
      },
      requestHeaders,
    });
  }

  redirect(ADMIN_LOGIN_PATH);
}