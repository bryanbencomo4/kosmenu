import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const EXCLUDED_PREFIXES = ['/api', '/_next', '/v', '/orders', '/delivery', '/.well-known', '/business'];
const EXCLUDED_EXACT = new Set(['/favicon.ico', '/robots.txt', '/sitemap.xml']);
const CANONICAL_HOST = 'www.elmenuxfa.com';
const CANONICAL_REDIRECT_HOSTS = new Set(['elmenuxfa.com', 'kosmenu.vercel.app']);
const BUSINESS_HOSTS = new Set(['business.elmenuxfa.com']);
const LOCAL_DEVELOPMENT_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0']);

function applySecurityHeaders(response: NextResponse) {
  response.headers.set(
    'Strict-Transport-Security',
    'max-age=31536000; includeSubDomains; preload',
  );
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('X-Frame-Options', 'SAMEORIGIN');
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

function shouldPreserveHostForWellKnown(pathname: string) {
  return pathname === '/.well-known/apple-app-site-association' ||
      pathname === '/.well-known/assetlinks.json';
}

function hasFileExtension(pathname: string) {
  return /\.[^/]+$/.test(pathname);
}

function isExcludedPath(pathname: string) {
  if (EXCLUDED_EXACT.has(pathname)) {
    return true;
  }

  return EXCLUDED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const host = requestHost(request);
  const hostname = requestHostname(host);
  const proto = requestProto(request);
  const isLocalDevelopmentHost = LOCAL_DEVELOPMENT_HOSTS.has(hostname);

  const needsCanonicalHost =
    !isLocalDevelopmentHost &&
    CANONICAL_REDIRECT_HOSTS.has(hostname) &&
    !shouldPreserveHostForWellKnown(pathname);
  const needsHttps =
    !isLocalDevelopmentHost &&
    proto === 'http' &&
    !shouldPreserveHostForWellKnown(pathname);

  if (needsCanonicalHost || needsHttps) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.protocol = 'https';
    redirectUrl.host = CANONICAL_HOST;
    return applySecurityHeaders(NextResponse.redirect(redirectUrl, 308));
  }

  if (pathname === '/') {
    if (BUSINESS_HOSTS.has(hostname)) {
      const rewriteUrl = request.nextUrl.clone();
      rewriteUrl.pathname = '/business';
      return applySecurityHeaders(NextResponse.rewrite(rewriteUrl));
    }

    return applySecurityHeaders(NextResponse.next());
  }

  if (isExcludedPath(pathname) || hasFileExtension(pathname)) {
    return applySecurityHeaders(NextResponse.next());
  }

  const redirectUrl = request.nextUrl.clone();
  redirectUrl.pathname = `/v${pathname}`;

  return applySecurityHeaders(NextResponse.redirect(redirectUrl, 308));
}

export const config = {
  matcher: ['/((?!_next/static|_next/image).*)'],
};
