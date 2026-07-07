import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import {
  adminSiteHost,
  appSiteUrl,
  developmentAdminHosts,
  developmentPublicHosts,
  legalPagePaths,
  publicSiteHost,
} from './app/_lib/public-site-config';

const EXCLUDED_PREFIXES = ['/api', '/_next', '/v', '/orders', '/delivery', '/.well-known'];
const EXCLUDED_EXACT = new Set(['/favicon.ico', '/robots.txt', '/sitemap.xml', ...legalPagePaths]);
const CANONICAL_HOST = publicSiteHost;
const CANONICAL_REDIRECT_HOSTS = new Set([
  'www.elmenuxfa.com',
  'business.elmenuxfa.com',
  'kosmenu.vercel.app',
]);
const ADMIN_HOSTS = new Set<string>([adminSiteHost, ...developmentAdminHosts]);
const LOCAL_DEVELOPMENT_HOSTS = new Set<string>(['localhost', '127.0.0.1', '0.0.0.0']);
const LOCAL_DEVELOPMENT_ALIAS_HOSTS = new Set<string>([
  ...developmentPublicHosts,
  ...developmentAdminHosts,
]);
const ADMIN_INTERNAL_PREFIX = '/admin';
const ADMIN_FORGOT_PASSWORD_PATH = '/admin/forgot-password';
const ADMIN_LOGIN_PATH = '/admin/login';
const ADMIN_RESET_PASSWORD_PATH = '/admin/reset-password';
const ADMIN_UNAUTHORIZED_PATH = '/admin/unauthorized';
const ADMIN_SESSION_COOKIE = 'elmenuxfa_admin_access_token';
const ADMIN_HOST_HEADER = 'x-admin-host';
const ADMIN_INTERNAL_PATH_HEADER = 'x-admin-internal-path';
const PUBLIC_ADMIN_API_PATHS = new Set(['/admin/api/auth/recover']);

function applySecurityHeaders(response: NextResponse) {
  if (process.env.NODE_ENV === 'production') {
    response.headers.set(
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains; preload',
    );
  }
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('X-Frame-Options', 'DENY');
  return response;
}

function requestHost(request: NextRequest) {
  return (
    request.headers.get('x-forwarded-host') ??
    request.headers.get('host') ??
    request.nextUrl.host
  )
    .split(',')[0]
    .trim()
    .toLowerCase();
}

function requestProto(request: NextRequest) {
  return (
    request.headers.get('x-forwarded-proto') ??
    request.nextUrl.protocol.replace(':', '')
  )
    .split(',')[0]
    .trim()
    .toLowerCase();
}

function requestHostname(host: string) {
  return host.split(':')[0].trim().toLowerCase();
}

function cloneRedirectUrl(request: NextRequest) {
  const clonedUrl = request.nextUrl.clone();
  clonedUrl.protocol = `${requestProto(request)}:`;
  clonedUrl.host = requestHost(request);
  return clonedUrl;
}

function shouldPreserveHostForWellKnown(pathname: string) {
  return pathname === '/.well-known/apple-app-site-association' ||
      pathname === '/.well-known/assetlinks.json';
}

function hasFileExtension(pathname: string) {
  return /\.[^/]+$/.test(pathname);
}

function isInternalAdminPath(pathname: string) {
  return pathname === ADMIN_INTERNAL_PREFIX || pathname.startsWith(`${ADMIN_INTERNAL_PREFIX}/`);
}

function isAdminAliasPath(pathname: string) {
  return (
    pathname === '/forgot-password' ||
    pathname === '/login' ||
    pathname === '/reset-password' ||
    pathname === '/unauthorized'
  );
}

function isAssetRequest(pathname: string) {
  return pathname.startsWith('/_next/') || shouldPreserveHostForWellKnown(pathname) || hasFileExtension(pathname);
}

function resolveAdminInternalPath(pathname: string) {
  if (pathname === '/') {
    return ADMIN_INTERNAL_PREFIX;
  }

  if (pathname === '/forgot-password') {
    return ADMIN_FORGOT_PASSWORD_PATH;
  }

  if (pathname === '/login') {
    return ADMIN_LOGIN_PATH;
  }

  if (pathname === '/reset-password') {
    return ADMIN_RESET_PASSWORD_PATH;
  }

  if (pathname === '/unauthorized') {
    return ADMIN_UNAUTHORIZED_PATH;
  }

  if (isInternalAdminPath(pathname)) {
    return pathname;
  }

  return `${ADMIN_INTERNAL_PREFIX}${pathname}`;
}

function adminLoginUrl(request: NextRequest, nextPathname: string) {
  const redirectUrl = cloneRedirectUrl(request);
  redirectUrl.pathname = ADMIN_LOGIN_PATH;
  redirectUrl.searchParams.set('next', nextPathname || '/');
  return redirectUrl;
}

function isExcludedPath(pathname: string) {
  if (EXCLUDED_EXACT.has(pathname)) {
    return true;
  }

  return EXCLUDED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function isPublicAuthCodeCallback(request: NextRequest, hostname: string) {
  if (hostname !== publicSiteHost) {
    return false;
  }

  return request.nextUrl.searchParams.has('code');
}

function buildAppAuthCallbackRedirect(request: NextRequest) {
  const redirectUrl = cloneRedirectUrl(request);
  const appUrl = new URL(appSiteUrl);
  redirectUrl.protocol = appUrl.protocol;
  redirectUrl.host = appUrl.host;
  return redirectUrl;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const host = requestHost(request);
  const hostname = requestHostname(host);
  const proto = requestProto(request);
  const isLocalDevelopmentHost = LOCAL_DEVELOPMENT_HOSTS.has(hostname);
  const isLocalDevelopmentAliasHost = LOCAL_DEVELOPMENT_ALIAS_HOSTS.has(hostname);
  const isDevelopmentHost = isLocalDevelopmentHost || isLocalDevelopmentAliasHost;
  const isAdminHost = ADMIN_HOSTS.has(hostname);
  const isLocalAdminPath = isLocalDevelopmentHost && isInternalAdminPath(pathname);

  const needsCanonicalHost =
    !isDevelopmentHost &&
    CANONICAL_REDIRECT_HOSTS.has(hostname) &&
    !shouldPreserveHostForWellKnown(pathname);
  const needsHttps =
    !isDevelopmentHost &&
    proto === 'http' &&
    !shouldPreserveHostForWellKnown(pathname);

  if (needsCanonicalHost) {
    const redirectUrl = cloneRedirectUrl(request);
    redirectUrl.protocol = 'https';
    redirectUrl.host = CANONICAL_HOST;
    return applySecurityHeaders(NextResponse.redirect(redirectUrl, 308));
  }

  if (needsHttps) {
    const redirectUrl = cloneRedirectUrl(request);
    redirectUrl.protocol = 'https';
    return applySecurityHeaders(NextResponse.redirect(redirectUrl, 308));
  }

  if (isPublicAuthCodeCallback(request, hostname)) {
    return applySecurityHeaders(
      NextResponse.redirect(buildAppAuthCallbackRedirect(request), 307),
    );
  }

  if (!isAdminHost && !isLocalAdminPath && (isInternalAdminPath(pathname) || isAdminAliasPath(pathname))) {
    const redirectUrl = cloneRedirectUrl(request);
    redirectUrl.pathname = '/';
    redirectUrl.search = '';
    return applySecurityHeaders(NextResponse.redirect(redirectUrl, 307));
  }

  if (isAdminHost || isLocalAdminPath) {
    const internalAdminPath = isAdminHost ? resolveAdminInternalPath(pathname) : pathname;
    const requestHeaders = new Headers(request.headers);
    const hasAdminSession = Boolean(request.cookies.get(ADMIN_SESSION_COOKIE)?.value?.trim());
    const isAdminPublicApiPath = PUBLIC_ADMIN_API_PATHS.has(internalAdminPath);
    const isAdminPublicPath =
      internalAdminPath === ADMIN_FORGOT_PASSWORD_PATH ||
      internalAdminPath === ADMIN_LOGIN_PATH ||
      internalAdminPath === ADMIN_RESET_PASSWORD_PATH ||
      internalAdminPath === ADMIN_UNAUTHORIZED_PATH;
    const isAdminApiPath = internalAdminPath.startsWith('/admin/api/');

    requestHeaders.set(ADMIN_HOST_HEADER, '1');
    requestHeaders.set(ADMIN_INTERNAL_PATH_HEADER, internalAdminPath);

    if (isAssetRequest(pathname)) {
      return applySecurityHeaders(NextResponse.next({ request: { headers: requestHeaders } }));
    }

    if (!hasAdminSession && !isAdminPublicPath && !isAdminPublicApiPath) {
      if (isAdminApiPath) {
        return applySecurityHeaders(
          NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
        );
      }

      return applySecurityHeaders(
        NextResponse.redirect(adminLoginUrl(request, pathname), 307),
      );
    }

    if (internalAdminPath !== pathname) {
      const rewriteUrl = request.nextUrl.clone();
      rewriteUrl.pathname = internalAdminPath;
      return applySecurityHeaders(
        NextResponse.rewrite(rewriteUrl, { request: { headers: requestHeaders } }),
      );
    }

    return applySecurityHeaders(NextResponse.next({ request: { headers: requestHeaders } }));
  }

  if (pathname === '/business') {
    const redirectUrl = cloneRedirectUrl(request);
    redirectUrl.pathname = '/';
    redirectUrl.search = '';
    return applySecurityHeaders(NextResponse.redirect(redirectUrl, 308));
  }

  if (pathname === '/') {
    return applySecurityHeaders(NextResponse.next());
  }

  if (isExcludedPath(pathname) || hasFileExtension(pathname)) {
    return applySecurityHeaders(NextResponse.next());
  }

  const redirectUrl = cloneRedirectUrl(request);
  redirectUrl.pathname = `/v${pathname}`;

  return applySecurityHeaders(NextResponse.redirect(redirectUrl, 308));
}

export const config = {
  matcher: ['/((?!_next/static|_next/image).*)'],
};
